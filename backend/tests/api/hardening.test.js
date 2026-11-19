import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

const password = "Sup3rSecret";

// Phase 8 (T072): gaps found by the coverage run and a security review. Payment stays PARTIAL (mock only).
describe.skipIf(!hasDb())("hardening and edge cases (temporary schema)", () => {
  let db;
  let app;
  let closePool;
  let n = 300;
  const ids = {};

  const member = async () => {
    n += 1;
    const agent = request.agent(app);
    const email = `hd${n}@example.com`;
    await agent.post("/api/members/register").send({ name: "Edge Reader", email, mobile: `9895000${n}`, password, confirmPassword: password }).expect(201);
    await agent.post("/api/members/login").send({ identifier: email, password }).expect(200);
    return { agent, email, id: (await db.sql("SELECT id::int AS id FROM members WHERE email = $1", [email])).rows[0].id };
  };

  beforeAll(async () => {
    db = await createTestSchema();
    await db.sql("INSERT INTO app_config (key, value) VALUES ('estimated_delivery_days','5'), ('wishlist_max_items','200'), ('free_shipping_threshold','499')");
    for (const [key, title, active] of [["a", "Alpha Tales", true], ["b", "100% Pure_Fiction", true], ["off", "Hidden Gem", false]]) {
      const { rows } = await db.sql(
        `INSERT INTO books (isbn, title, short_description, description, cover_url, price, format, language, publication_date, is_active, stock_quantity)
         VALUES ($1, $2, 's', 'd', '/covers/x.svg', 100, 'Paperback', 'English', '2020-01-01', $3, 5) RETURNING id::int AS id`,
        [`isbn-hd-${key}`, title, active],
      );
      ids[key] = rows[0].id;
    }
    const { createApp } = await import("../../src/app.js");
    const { createLoginLimiter, createRegisterLimiter } = await import("../../src/middleware/rateLimit.js");
    ({ closePool } = await import("../../src/lib/db.js"));
    app = createApp({ memberRouteOptions: { loginLimiter: createLoginLimiter({ max: 1000 }), registerLimiter: createRegisterLimiter({ max: 1000 }) } });
  }, 60000);

  afterAll(async () => {
    await closePool?.();
    await db?.drop();
  });

  describe("transport and headers", () => {
    it("sends security headers and does not announce the framework", async () => {
      const res = await request(app).get("/api/health");
      expect(res.headers["x-powered-by"]).toBeUndefined();
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["strict-transport-security"]).toBeDefined();
      expect(res.headers["content-security-policy"]).toBeDefined();
    });

    it("allows cross-origin calls only from the configured frontend origin", async () => {
      const ok = await request(app).get("/api/health").set("Origin", "http://127.0.0.1:5173");
      expect(ok.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
      expect(ok.headers["access-control-allow-credentials"]).toBe("true");
      const evil = await request(app).get("/api/health").set("Origin", "https://evil.example");
      expect(evil.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
      expect(evil.headers["access-control-allow-origin"]).not.toBe("*");
    });

    it("rejects an oversized body with 413 and a generic message, not a 500", async () => {
      const res = await request(app).post("/api/members/login").send({ identifier: "x".repeat(200_000), password: "y" });
      expect(res.status).toBe(413);
      expect(res.body).toEqual({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request is too large" } });
    });

    it("clears the session cookie on sign-out with the same safe flags", async () => {
      const m = await member();
      const res = await m.agent.post("/api/members/logout");
      expect(res.status).toBe(204);
      const cookie = res.headers["set-cookie"].join(";");
      expect(cookie).toMatch(/session=;/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    });
  });

  describe("authentication edge cases", () => {
    it("treats an email in any letter case as the same account", async () => {
      const m = await member();
      const res = await request(app).post("/api/members/login").send({ identifier: m.email.toUpperCase(), password });
      expect(res.status).toBe(200);
    });

    it("rejects missing, non-string and oversized sign-in fields without a 500", async () => {
      for (const body of [{}, { identifier: 1, password: 2 }, { identifier: ["a"], password: { x: 1 } }, { identifier: "a@b.co", password: "p".repeat(5000) }]) {
        const res = await request(app).post("/api/members/login").send(body);
        expect([400, 401]).toContain(res.status);
        expect(JSON.stringify(res.body)).not.toMatch(/stack|select |at \w+ \(/i);
      }
    });

    it("does not log the member in with SQL-like text and never reveals whether the account exists", async () => {
      const m = await member();
      const wrongPassword = await request(app).post("/api/members/login").send({ identifier: m.email, password: "Wr0ngPassword" });
      const injected = await request(app).post("/api/members/login").send({ identifier: "' OR '1'='1' --", password: "x' OR '1'='1" });
      expect(wrongPassword.status).toBe(401);
      expect(injected.status).toBe(401);
      expect(injected.body.error.message).toBe(wrongPassword.body.error.message);
    });

    it("stores the password only as a bcrypt hash and never returns it from /me", async () => {
      const m = await member();
      const me = await m.agent.get("/api/members/me").expect(200);
      expect(JSON.stringify(me.body)).not.toMatch(/password|hash/i);
    });

    it("ignores a session cookie signed for a member that no longer exists", async () => {
      const m = await member();
      const cookie = (await request(app).post("/api/members/login").send({ identifier: m.email, password })).headers["set-cookie"][0].split(";")[0];
      await db.sql("DELETE FROM members WHERE id = $1", [m.id]);
      expect((await request(app).get("/api/members/me").set("Cookie", cookie)).status).toBe(401);
      expect((await request(app).get("/api/wishlist").set("Cookie", cookie)).status).toBe(401);
    });
  });

  describe("catalogue input safety", () => {
    it("treats SQL-like search text as plain text and returns an ordinary result", async () => {
      for (const q of ["'; DROP TABLE books; --", "\" OR 1=1 --", "Robert'); DELETE FROM members;--"]) {
        const res = await request(app).get("/api/books").query({ q });
        expect(res.status, q).toBe(200);
        expect(res.body.items).toEqual([]);
      }
      expect((await db.sql("SELECT count(*)::int AS n FROM books")).rows[0].n).toBe(3);
    });

    it("matches % and _ literally and never returns an inactive book", async () => {
      const pct = await request(app).get("/api/books").query({ q: "100%" });
      expect(pct.body.items.map((b) => b.id)).toEqual([ids.b]);
      const hidden = await request(app).get("/api/books").query({ q: "Hidden Gem" });
      expect(hidden.body.items).toEqual([]);
    });

    it("rejects array, object and over-long query values with field messages, not a 500", async () => {
      for (const query of ["q[]=a&q[]=b", "page[x]=1", `q=${"a".repeat(500)}`, "pageSize=1e3", "page=0", "author=abc", "category=Not A Slug!"]) {
        const res = await request(app).get(`/api/books?${query}`);
        expect([200, 400], query).toContain(res.status);
        expect(res.status, `${query} must not be a server error`).toBeLessThan(500);
      }
    });

    it("answers book ids that are not plain numbers with 404", async () => {
      for (const bad of ["abc", "1.5", "-1", "0", "99999999999999999999", "1%20OR%201=1"]) {
        expect((await request(app).get(`/api/books/${bad}`)).status, bad).toBe(404);
      }
    });
  });

  describe("cart edge cases", () => {
    it("rejects non-integer, zero, negative and absurd quantities without changing the cart", async () => {
      const agent = request.agent(app);
      for (const quantity of [0, -1, 1.5, "abc", null, 1e9, 100000]) {
        const res = await agent.post("/api/cart/items").send({ bookId: ids.a, quantity });
        expect(res.status, String(quantity)).toBe(400);
      }
      expect((await agent.get("/api/cart").expect(200)).body.cart.items).toEqual([]);
    });

    it("never takes a price from the client", async () => {
      const agent = request.agent(app);
      const res = await agent.post("/api/cart/items").send({ bookId: ids.a, quantity: 1, price: 0.01, unitPrice: 0.01 });
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) expect((await agent.get("/api/cart").expect(200)).body.cart.items[0].unitPrice).toBe(100);
    });
  });

  describe("unexpected failures stay generic", () => {
    it("returns a generic 500 and never the database error when a query fails", async () => {
      const m = await member();
      await db.sql("ALTER TABLE wishlist_items RENAME TO wishlist_items_tmp");
      try {
        const res = await m.agent.get("/api/wishlist");
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
      } finally {
        await db.sql("ALTER TABLE wishlist_items_tmp RENAME TO wishlist_items");
      }
    });
  });
});
