import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

// Phase 3 has no real admin endpoint yet, so a tiny app with an admin-only route exercises the guard.
describe.skipIf(!hasDb())("authorization guard (temporary schema)", () => {
  let db;
  let app;
  let closePool;

  const registration = (email, mobile) => ({
    name: "Role Tester",
    email,
    mobile,
    password: "Sup3rSecret",
    confirmPassword: "Sup3rSecret",
  });

  beforeAll(async () => {
    db = await createTestSchema();
    const { parseCookies, requireAuth } = await import("../../src/middleware/auth.js");
    const { authorize } = await import("../../src/middleware/authorize.js");
    const { errorHandler } = await import("../../src/middleware/errorHandler.js");
    const { createMemberRoutes } = await import("../../src/modules/member/member.routes.js");
    const { createLoginLimiter, createRegisterLimiter } = await import("../../src/middleware/rateLimit.js");
    ({ closePool } = await import("../../src/lib/db.js"));

    app = express();
    app.use(express.json());
    app.use(parseCookies);
    app.use(
      "/api/members",
      createMemberRoutes({
        loginLimiter: createLoginLimiter({ max: 1000 }),
        registerLimiter: createRegisterLimiter({ max: 1000 }),
      }),
    );
    app.get("/api/admin/ping", requireAuth, authorize("ADMIN"), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    await request(app).post("/api/members/register").send(registration("member@example.com", "9000000011"));
    await request(app).post("/api/members/register").send(registration("boss@example.com", "9000000012"));
    await db.sql("UPDATE members SET role = 'ADMIN' WHERE email = 'boss@example.com'");
  }, 60000);

  afterAll(async () => {
    await closePool?.();
    await db?.drop();
  });

  const signIn = async (email) => {
    const agent = request.agent(app);
    const res = await agent.post("/api/members/login").send({ identifier: email, password: "Sup3rSecret" });
    expect(res.status).toBe(200);
    return agent;
  };

  it("denies guests an admin action with 401", async () => {
    const res = await request(app).get("/api/admin/ping");
    expect(res.status).toBe(401);
  });

  it("denies a member an admin action with 403", async () => {
    const agent = await signIn("member@example.com");
    const res = await agent.get("/api/admin/ping");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("allows an admin the admin action", async () => {
    const agent = await signIn("boss@example.com");
    const res = await agent.get("/api/admin/ping");
    expect(res.status).toBe(200);
  });
});
