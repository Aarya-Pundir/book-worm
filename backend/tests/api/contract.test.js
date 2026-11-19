import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import YAML from "yaml";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

// Phase 8 (T074): the OpenAPI contract must describe the routes the app really has, and the app serves it.
const SRC = fileURLToPath(new URL("../../src", import.meta.url));
const SPEC = fileURLToPath(new URL("../../../specs/001-member-auth-catalogue/contracts/openapi.yaml", import.meta.url));
const METHODS = ["get", "post", "put", "patch", "delete"];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const spec = YAML.parse(readFileSync(SPEC, "utf8"));
const documented = Object.entries(spec.paths).flatMap(([p, item]) => METHODS.filter((m) => item[m]).map((m) => ({ method: m, path: p })));

describe("API contract (openapi.yaml)", () => {
  it("documents exactly as many operations as the route files declare", () => {
    const declared = walk(SRC)
      .filter((f) => f.endsWith(".routes.js"))
      .map((f) => (readFileSync(f, "utf8").match(/router\.(get|post|put|patch|delete)\(/g) ?? []).length)
      .reduce((a, b) => a + b, 0);
    expect(documented.length).toBe(declared);
  });

  it("has unique operation summaries, a tag on every operation and no empty descriptions", () => {
    const declaredTags = new Set(spec.tags.map((t) => t.name));
    for (const op of documented) {
      const item = spec.paths[op.path][op.method];
      expect(item.summary, `${op.method} ${op.path}`).toBeTruthy();
      expect(item.tags?.length, `${op.method} ${op.path} tags`).toBeGreaterThan(0);
      for (const t of item.tags) expect(declaredTags.has(t), `${t} is declared`).toBe(true);
    }
  });

  it("never describes a field that could hold card data", () => {
    const text = readFileSync(SPEC, "utf8");
    expect(text).not.toMatch(/cardNumber|cvv|cvc|securityCode|expiryDate|upiId|accountNumber/i);
  });
});

describe.skipIf(!hasDb())("API contract against the running app (temporary schema)", () => {
  let db;
  let app;
  let closePool;

  beforeAll(async () => {
    db = await createTestSchema();
    const { createApp } = await import("../../src/app.js");
    ({ closePool } = await import("../../src/lib/db.js"));
    app = createApp();
  }, 60000);

  afterAll(async () => {
    await closePool?.();
    await db?.drop();
  });

  it("serves the contract file unchanged at GET /api/openapi.yaml", async () => {
    const res = await request(app).get("/api/openapi.yaml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/yaml/);
    expect(res.text).toBe(readFileSync(SPEC, "utf8"));
  });

  it("answers every documented operation as a real route (never the generic 'Resource not found', never a 5xx)", async () => {
    for (const op of documented) {
      const url = `/api${op.path.replace(/\{[^}]+\}/g, "1")}`;
      const res = await request(app)[op.method](url).send(op.method === "get" || op.method === "delete" ? undefined : {});
      const generic = res.status === 404 && res.body?.error?.message === "Resource not found";
      expect(generic, `${op.method.toUpperCase()} ${op.path} is not routed`).toBe(false);
      expect(res.status, `${op.method.toUpperCase()} ${op.path}`).toBeLessThan(500);
    }
  });

  it("requires sign-in for every operation the contract marks as member-only", async () => {
    const memberOnly = ["/wishlist", "/writers", "/addresses", "/orders", "/gift-points", "/members/me"];
    for (const p of memberOnly) expect((await request(app).get(`/api${p}`)).status, p).toBe(401);
    expect((await request(app).post("/api/checkout/order").send({})).status).toBe(401);
    expect((await request(app).post("/api/payments").send({})).status).toBe(401);
    expect((await request(app).post("/api/admin/orders/BW-1/shipment").send({})).status).toBe(401);
  });
});
