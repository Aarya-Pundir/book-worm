import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

const valid = {
  name: "Test Reader",
  email: "Reader@Example.com",
  mobile: "+91 98765 43210",
  password: "Sup3rSecret",
  confirmPassword: "Sup3rSecret",
};

describe.skipIf(!hasDb())("member auth API (temporary schema)", () => {
  let db;
  let app;
  let closePool;

  beforeAll(async () => {
    db = await createTestSchema();
    const { createApp } = await import("../../src/app.js");
    const { createLoginLimiter, createRegisterLimiter } = await import("../../src/middleware/rateLimit.js");
    ({ closePool } = await import("../../src/lib/db.js"));
    app = createApp({
      memberRouteOptions: {
        loginLimiter: createLoginLimiter({ max: 1000 }),
        registerLimiter: createRegisterLimiter({ max: 1000 }),
      },
    });
  }, 60000);

  afterAll(async () => {
    await closePool?.();
    await db?.drop();
  });

  it("registers a member, normalising email and mobile, and never returns the hash", async () => {
    const res = await request(app).post("/api/members/register").send(valid);
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({ email: "reader@example.com", mobile: "9876543210", role: "MEMBER" });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    const { rows } = await db.sql("SELECT password_hash FROM members WHERE email = 'reader@example.com'");
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(rows[0].password_hash).not.toContain(valid.password);
  });

  it("rejects duplicate email and duplicate mobile without creating a second account", async () => {
    const dupEmail = await request(app)
      .post("/api/members/register")
      .send({ ...valid, mobile: "9123456780" });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error.fields.email).toBeDefined();

    const dupMobile = await request(app)
      .post("/api/members/register")
      .send({ ...valid, email: "other@example.com" });
    expect(dupMobile.status).toBe(409);
    expect(dupMobile.body.error.fields.mobile).toBeDefined();

    const { rows } = await db.sql("SELECT count(*)::int AS n FROM members");
    expect(rows[0].n).toBe(1);
  });

  it("returns field-level messages for invalid input", async () => {
    const res = await request(app)
      .post("/api/members/register")
      .send({ name: "", email: "nope", mobile: "123", password: "weak", confirmPassword: "different" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.fields).sort()).toEqual(
      ["confirmPassword", "email", "mobile", "name", "password"].sort(),
    );
  });

  it("signs in by email or by mobile and sets an httpOnly cookie", async () => {
    const byEmail = await request(app)
      .post("/api/members/login")
      .send({ identifier: "READER@example.com", password: valid.password });
    expect(byEmail.status).toBe(200);
    const cookie = byEmail.headers["set-cookie"][0];
    expect(cookie).toMatch(/^session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const byMobile = await request(app)
      .post("/api/members/login")
      .send({ identifier: "98765 43210", password: valid.password });
    expect(byMobile.status).toBe(200);
    expect(byMobile.body.member.email).toBe("reader@example.com");
  });

  it("gives the same generic error for a wrong password and an unknown account", async () => {
    const wrongPassword = await request(app)
      .post("/api/members/login")
      .send({ identifier: "reader@example.com", password: "Wrong1234" });
    const unknown = await request(app)
      .post("/api/members/login")
      .send({ identifier: "nobody@example.com", password: "Wrong1234" });
    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknown.body);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("protects /me: 401 for guests, profile for a signed-in member, 401 again after logout", async () => {
    expect((await request(app).get("/api/members/me")).status).toBe(401);

    const agent = request.agent(app);
    await agent.post("/api/members/login").send({ identifier: "reader@example.com", password: valid.password });
    const me = await agent.get("/api/members/me");
    expect(me.status).toBe(200);
    expect(me.body.member.email).toBe("reader@example.com");
    expect(JSON.stringify(me.body)).not.toMatch(/password|hash/i);

    expect((await agent.post("/api/members/logout")).status).toBe(204);
    expect((await agent.get("/api/members/me")).status).toBe(401);
  });

  it("rejects a tampered session cookie", async () => {
    const res = await request(app).get("/api/members/me").set("Cookie", "session=not.a.valid.token");
    expect(res.status).toBe(401);
  });

  it("limits repeated failed sign-ins (FR-007)", async () => {
    const { createApp } = await import("../../src/app.js");
    const { createLoginLimiter } = await import("../../src/middleware/rateLimit.js");
    const limited = createApp({ memberRouteOptions: { loginLimiter: createLoginLimiter({ max: 3 }) } });
    const attempt = () =>
      request(limited).post("/api/members/login").send({ identifier: "reader@example.com", password: "Wrong1234" });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_ATTEMPTS");
  });
});
