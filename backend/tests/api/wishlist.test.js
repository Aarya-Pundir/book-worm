import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

const password = "Sup3rSecret";

describe.skipIf(!hasDb())("My Wishlist API (temporary schema)", () => {
  let db;
  let app;
  let closePool;
  let n = 100;
  const ids = {};

  const addBook = async (key, { price = 100, stock = 5, active = true, format = "Paperback", author } = {}) => {
    const { rows } = await db.sql(
      `INSERT INTO books (isbn, title, short_description, description, cover_url, price, format, language, publication_date, is_active, stock_quantity)
       VALUES ($1, $2, 'secret short', 'secret long description', '/covers/x.svg', $3, $4, 'English', '2020-01-01', $5, $6) RETURNING id::int AS id`,
      [`isbn-wl-${key}`, `Book ${key}`, price, format, active, stock],
    );
    ids[key] = rows[0].id;
    if (author) {
      const a = await db.sql("INSERT INTO authors (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id::int AS id", [author]);
      await db.sql("INSERT INTO book_authors (book_id, author_id) VALUES ($1, $2)", [ids[key], a.rows[0].id]);
    }
  };

  /** A signed-in member (the agent keeps the session cookie, like a browser). */
  const member = async () => {
    n += 1;
    const agent = request.agent(app);
    const email = `wl${n}@example.com`;
    await agent.post("/api/members/register").send({ name: "Wish Reader", email, mobile: `9880000${n}`, password, confirmPassword: password }).expect(201);
    await agent.post("/api/members/login").send({ identifier: email, password }).expect(200);
    return { agent, email, id: (await db.sql("SELECT id::int AS id FROM members WHERE email = $1", [email])).rows[0].id };
  };
  const add = (m, bookId) => m.agent.post("/api/wishlist/items").send({ bookId });
  const list = async (m) => (await m.agent.get("/api/wishlist").expect(200)).body;
  const rowsFor = async (m) => (await db.sql("SELECT book_id::int AS id FROM wishlist_items WHERE member_id = $1", [m.id])).rows.map((r) => r.id);

  beforeAll(async () => {
    db = await createTestSchema();
    await addBook("a", { price: 100, stock: 5, author: "Ada Writer" });
    await addBook("b", { price: 250.5, stock: 3, author: "Ada Writer" });
    await addBook("c", { price: 75, stock: 10 });
    await addBook("sold", { stock: 0 });
    await addBook("ebook", { price: 50, stock: 10, format: "eBook" });
    await addBook("gone", { stock: 4, active: false, author: "Hidden Author" });
    await db.sql("INSERT INTO app_config (key, value) VALUES ('estimated_delivery_days', '5'), ('wishlist_max_items', '200')");
    const { createApp } = await import("../../src/app.js");
    const { createLoginLimiter, createRegisterLimiter } = await import("../../src/middleware/rateLimit.js");
    ({ closePool } = await import("../../src/lib/db.js"));
    app = createApp({ memberRouteOptions: { loginLimiter: createLoginLimiter({ max: 1000 }), registerLimiter: createRegisterLimiter({ max: 1000 }) } });
  }, 60000);

  afterAll(async () => {
    await closePool?.();
    await db?.drop();
  });

  describe("authentication (FR-081, FR-090, SC-022)", () => {
    it("denies a guest every wishlist operation with 401 and stores nothing", async () => {
      const guest = request(app);
      await guest.get("/api/wishlist").expect(401);
      await guest.post("/api/wishlist/items").send({ bookId: ids.a }).expect(401);
      await guest.delete(`/api/wishlist/items/${ids.a}`).expect(401);
      await guest.post("/api/wishlist/cart").send({}).expect(401);
      expect((await db.sql("SELECT count(*)::int AS n FROM wishlist_items")).rows[0].n).toBe(0);
    });
  });

  describe("adding (FR-082)", () => {
    it("adds an active book once; adding it again keeps a single entry", async () => {
      const m = await member();
      const first = await add(m, ids.a);
      expect(first.status).toBe(201);
      expect(first.body.count).toBe(1);
      const again = await add(m, ids.a);
      expect(again.status).toBe(200);
      expect(again.body.count).toBe(1);
      expect(await rowsFor(m)).toEqual([ids.a]);
    });

    it("accepts an active out-of-stock book and labels it unavailable (clarified D2)", async () => {
      const m = await member();
      const res = await add(m, ids.sold).expect(201);
      expect(res.body.item).toMatchObject({ bookId: ids.sold, available: false, unavailableReason: "Out of stock" });
      expect(await rowsFor(m)).toEqual([ids.sold]);
    });

    it("rejects an inactive book and an unknown book the same way, storing nothing", async () => {
      const m = await member();
      const inactive = await add(m, ids.gone);
      const unknown = await add(m, 999999);
      expect(inactive.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(inactive.body.error.message).toBe(unknown.body.error.message);
      expect(await rowsFor(m)).toEqual([]);
    });

    it("validates the request: wrong types, missing id, extra fields", async () => {
      const m = await member();
      for (const body of [{}, { bookId: "abc" }, { bookId: -1 }, { bookId: 1.5 }, { bookId: 99999999999 }, { bookId: ids.a, memberId: 1 }]) {
        const res = await m.agent.post("/api/wishlist/items").send(body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      }
      expect(await rowsFor(m)).toEqual([]);
    });

    it("never creates two rows when the same book is added at the same time", async () => {
      const m = await member();
      const results = await Promise.all([add(m, ids.b), add(m, ids.b), add(m, ids.b)]);
      expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await rowsFor(m)).toEqual([ids.b]);
    });

    it("stops at the configured maximum with a clear message and drops nothing", async () => {
      await db.sql("UPDATE app_config SET value = '2' WHERE key = 'wishlist_max_items'");
      try {
        const m = await member();
        await add(m, ids.a).expect(201);
        await add(m, ids.b).expect(201);
        const full = await add(m, ids.c);
        expect(full.status).toBe(409);
        expect(full.body.error.code).toBe("WISHLIST_FULL");
        expect(full.body.error.message).toContain("2");
        // Adding something already on the list is still fine.
        await add(m, ids.a).expect(200);
        expect((await rowsFor(m)).sort()).toEqual([ids.a, ids.b].sort());
        // Two requests racing for the last slot cannot both win.
        const r = await member();
        await add(r, ids.a).expect(201);
        const race = await Promise.all([add(r, ids.b), add(r, ids.c)]);
        expect(race.map((x) => x.status).sort()).toEqual([201, 409]);
        expect(await rowsFor(r)).toHaveLength(2);
      } finally {
        await db.sql("UPDATE app_config SET value = '200' WHERE key = 'wishlist_max_items'");
      }
    });
  });

  describe("viewing (FR-083, FR-084, SC-023, SC-024)", () => {
    it("is empty for a new member, not fabricated", async () => {
      const m = await member();
      expect(await list(m)).toEqual({ items: [], count: 0, maxItems: 200 });
    });

    it("lists newest first with current price, format, authors and availability", async () => {
      const m = await member();
      await add(m, ids.a);
      await add(m, ids.ebook);
      await add(m, ids.sold);
      const body = await list(m);
      expect(body.items.map((i) => i.bookId)).toEqual([ids.sold, ids.ebook, ids.a]);
      const a = body.items.find((i) => i.bookId === ids.a);
      expect(a).toMatchObject({ title: "Book a", format: "Paperback", price: 100, available: true, unavailableReason: null });
      expect(a.authors).toEqual([{ id: expect.any(Number), name: "Ada Writer" }]);
      expect(body.items.find((i) => i.bookId === ids.sold)).toMatchObject({ available: false, unavailableReason: "Out of stock" });
    });

    it("shows today's price, not the price when it was added", async () => {
      const m = await member();
      await add(m, ids.c);
      await db.sql("UPDATE books SET price = 80 WHERE id = $1", [ids.c]);
      expect((await list(m)).items[0].price).toBe(80);
      await db.sql("UPDATE books SET price = 75 WHERE id = $1", [ids.c]);
    });

    it("keeps the same list after signing out and in again (SC-023)", async () => {
      const m = await member();
      await add(m, ids.a);
      await add(m, ids.b);
      await m.agent.post("/api/members/logout").expect(204);
      await m.agent.get("/api/wishlist").expect(401);
      await m.agent.post("/api/members/login").send({ identifier: m.email, password }).expect(200);
      expect((await list(m)).items.map((i) => i.bookId)).toEqual([ids.b, ids.a]);
    });

    it("keeps a book that became inactive, exposing ONLY id, title, cover and reason (FR-084)", async () => {
      const m = await member();
      await add(m, ids.b);
      await add(m, ids.c);
      await db.sql("UPDATE books SET is_active = false WHERE id = $1", [ids.b]);
      try {
        const body = await list(m);
        expect(body.count).toBe(2);
        const hidden = body.items.find((i) => i.bookId === ids.b);
        expect(Object.keys(hidden).sort()).toEqual(["available", "bookId", "coverUrl", "title", "unavailableReason"]);
        expect(hidden).toEqual({ bookId: ids.b, title: "Book b", coverUrl: "/covers/x.svg", available: false, unavailableReason: "No longer available" });
        const rawHidden = JSON.stringify(hidden);
        for (const secret of ["secret short", "secret long description", "250.5", "Ada Writer", "Paperback", "isbn-wl-b", "stock"]) {
          expect(rawHidden).not.toContain(secret);
        }
        // The other, still-active book is unaffected.
        expect(body.items.find((i) => i.bookId === ids.c).available).toBe(true);
      } finally {
        await db.sql("UPDATE books SET is_active = true WHERE id = $1", [ids.b]);
      }
    });

    it("an unavailable book can still be removed", async () => {
      const m = await member();
      await add(m, ids.c);
      await db.sql("UPDATE books SET is_active = false WHERE id = $1", [ids.c]);
      try {
        await m.agent.delete(`/api/wishlist/items/${ids.c}`).expect(204);
        expect((await list(m)).items).toEqual([]);
      } finally {
        await db.sql("UPDATE books SET is_active = true WHERE id = $1", [ids.c]);
      }
    });
  });

  describe("removing (FR-085)", () => {
    it("removes a book, and removing it again or one never added is not an error", async () => {
      const m = await member();
      await add(m, ids.a);
      await add(m, ids.b);
      await m.agent.delete(`/api/wishlist/items/${ids.a}`).expect(204);
      await m.agent.delete(`/api/wishlist/items/${ids.a}`).expect(204);
      await m.agent.delete(`/api/wishlist/items/${ids.c}`).expect(204);
      expect(await rowsFor(m)).toEqual([ids.b]);
    });

    it("rejects a malformed book id", async () => {
      const m = await member();
      await m.agent.delete("/api/wishlist/items/abc").expect(400);
      await m.agent.delete("/api/wishlist/items/-4").expect(400);
    });
  });

  describe("adding to the cart (FR-086, SC-024)", () => {
    const cartOf = async (m) => (await m.agent.get("/api/cart").expect(200)).body.cart;

    it("adds one chosen book at today's price and leaves it on the wishlist (D3)", async () => {
      const m = await member();
      await add(m, ids.a);
      await add(m, ids.b);
      const res = await m.agent.post("/api/wishlist/cart").send({ bookIds: [ids.a] }).expect(200);
      expect(res.body.added).toEqual([{ bookId: ids.a, title: "Book a", quantity: 1 }]);
      expect(res.body.skipped).toEqual([]);
      expect(res.body.cart.items.map((i) => i.bookId)).toEqual([ids.a]);
      expect(res.body.cart.items[0].unitPrice).toBe(100);
      expect((await rowsFor(m)).sort()).toEqual([ids.a, ids.b].sort());
    });

    it("adds every available book when none are named, and skips the rest with reasons without failing", async () => {
      const m = await member();
      for (const key of ["a", "sold", "ebook"]) await add(m, ids[key]);
      await add(m, ids.c);
      await db.sql("UPDATE books SET is_active = false WHERE id = $1", [ids.c]);
      try {
        const res = await m.agent.post("/api/wishlist/cart").send({}).expect(200);
        expect(res.body.added.map((a) => a.bookId).sort()).toEqual([ids.a, ids.ebook].sort());
        const reasons = Object.fromEntries(res.body.skipped.map((s) => [s.bookId, s.reason]));
        expect(reasons).toEqual({ [ids.sold]: "Out of stock", [ids.c]: "No longer available" });
        expect(res.body.message).toContain("Not added");
        expect((await cartOf(m)).items.map((i) => i.bookId).sort()).toEqual([ids.a, ids.ebook].sort());
        expect(await rowsFor(m)).toHaveLength(4);
      } finally {
        await db.sql("UPDATE books SET is_active = true WHERE id = $1", [ids.c]);
      }
    });

    it("never puts an out-of-stock book in the cart until stock returns", async () => {
      const m = await member();
      await add(m, ids.sold);
      const first = await m.agent.post("/api/wishlist/cart").send({ bookIds: [ids.sold] }).expect(200);
      expect(first.body.added).toEqual([]);
      expect(first.body.skipped[0]).toMatchObject({ bookId: ids.sold, reason: "Out of stock" });
      expect((await cartOf(m)).items).toEqual([]);
      await db.sql("UPDATE books SET stock_quantity = 2 WHERE id = $1", [ids.sold]);
      try {
        const second = await m.agent.post("/api/wishlist/cart").send({ bookIds: [ids.sold] }).expect(200);
        expect(second.body.added.map((a) => a.bookId)).toEqual([ids.sold]);
      } finally {
        await db.sql("UPDATE books SET stock_quantity = 0 WHERE id = $1", [ids.sold]);
      }
    });

    it("limits the quantity to stock using the normal cart rules and says so", async () => {
      await addBook("last", { stock: 1 });
      const m = await member();
      await add(m, ids.last);
      await m.agent.post("/api/cart/items").send({ bookId: ids.last, quantity: 1 }).expect(200);
      const res = await m.agent.post("/api/wishlist/cart").send({ bookIds: [ids.last] }).expect(200);
      expect(res.body.added[0].note).toContain("Only 1 copy is available");
      expect((await cartOf(m)).items[0].quantity).toBe(1);
    });

    it("refuses to move a book that is not on the member's own wishlist", async () => {
      const m = await member();
      const other = await member();
      await add(other, ids.b);
      const res = await m.agent.post("/api/wishlist/cart").send({ bookIds: [ids.b] }).expect(200);
      expect(res.body.added).toEqual([]);
      expect(res.body.skipped[0].reason).toBe("This book is not on your wishlist");
      expect((await cartOf(m)).items).toEqual([]);
    });

    it("validates the request and reports an empty wishlist plainly", async () => {
      const m = await member();
      await m.agent.post("/api/wishlist/cart").send({ bookIds: "all" }).expect(400);
      await m.agent.post("/api/wishlist/cart").send({ bookIds: [0] }).expect(400);
      await m.agent.post("/api/wishlist/cart").send({ extra: true }).expect(400);
      const res = await m.agent.post("/api/wishlist/cart").send({}).expect(200);
      expect(res.body).toMatchObject({ added: [], skipped: [], message: "Your wishlist has no books to add." });
    });
  });

  describe("ownership (FR-090, SC-022)", () => {
    it("never shows or changes another member's wishlist", async () => {
      const alice = await member();
      const bob = await member();
      await add(alice, ids.a);
      await add(alice, ids.b);
      expect((await list(bob)).items).toEqual([]);

      // Bob removing "the same book" only touches Bob's own (empty) list.
      await bob.agent.delete(`/api/wishlist/items/${ids.a}`).expect(204);
      expect((await rowsFor(alice)).sort()).toEqual([ids.a, ids.b].sort());

      // A member id in the request is rejected, so it cannot be used to reach another list.
      await bob.agent.post("/api/wishlist/items").send({ bookId: ids.c, memberId: alice.id }).expect(400);
      expect(await rowsFor(alice)).not.toContain(ids.c);
      expect(await rowsFor(bob)).toEqual([]);

      // Bob's own adds do not appear for Alice.
      await add(bob, ids.c);
      expect((await list(alice)).items.map((i) => i.bookId).sort()).toEqual([ids.a, ids.b].sort());
    });

    it("removes a member's wishlist when the member is deleted", async () => {
      const m = await member();
      await add(m, ids.a);
      await db.sql("DELETE FROM members WHERE id = $1", [m.id]);
      expect((await db.sql("SELECT count(*)::int AS n FROM wishlist_items WHERE member_id = $1", [m.id])).rows[0].n).toBe(0);
    });
  });

  describe("safety", () => {
    it("returns generic errors without internals", async () => {
      const m = await member();
      const res = await add(m, 999999);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/select|insert|pg_|stack|at .*\.js|wishlist_items/i);
    });
  });
});
