import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

const password = "Sup3rSecret";

describe.skipIf(!hasDb())("My Writers API (temporary schema)", () => {
  let db;
  let app;
  let closePool;
  let n = 100;
  const ids = {};
  const writer = {};

  const addBook = async (key, { active = true, authors = [] } = {}) => {
    const { rows } = await db.sql(
      `INSERT INTO books (isbn, title, short_description, description, cover_url, price, format, language, publication_date, is_active, stock_quantity)
       VALUES ($1, $2, 's', 'd', '/covers/x.svg', 100, 'Paperback', 'English', '2020-01-01', $3, 5) RETURNING id::int AS id`,
      [`isbn-wr-${key}`, `Book ${key}`, active],
    );
    ids[key] = rows[0].id;
    for (const name of authors) {
      if (!writer[name]) {
        const a = await db.sql("INSERT INTO authors (name) VALUES ($1) RETURNING id::int AS id", [name]);
        writer[name] = a.rows[0].id;
      }
      await db.sql("INSERT INTO book_authors (book_id, author_id) VALUES ($1, $2)", [ids[key], writer[name]]);
    }
  };

  const member = async () => {
    n += 1;
    const agent = request.agent(app);
    const email = `wr${n}@example.com`;
    await agent.post("/api/members/register").send({ name: "Writer Fan", email, mobile: `9890000${n}`, password, confirmPassword: password }).expect(201);
    await agent.post("/api/members/login").send({ identifier: email, password }).expect(200);
    return { agent, email, id: (await db.sql("SELECT id::int AS id FROM members WHERE email = $1", [email])).rows[0].id };
  };
  const follow = (m, id) => m.agent.post(`/api/writers/${id}/follow`);
  const unfollow = (m, id) => m.agent.delete(`/api/writers/${id}/follow`);
  const list = async (m) => (await m.agent.get("/api/writers").expect(200)).body.items;
  const rowsFor = async (m) => (await db.sql("SELECT author_id::int AS id FROM followed_authors WHERE member_id = $1", [m.id])).rows.map((r) => r.id);

  beforeAll(async () => {
    db = await createTestSchema();
    await addBook("a1", { authors: ["Ada Writer"] });
    await addBook("a2", { authors: ["Ada Writer", "Ben Writer"] });
    await addBook("a3", { active: false, authors: ["Ada Writer"] });
    await addBook("b1", { authors: ["Ben Writer"] });
    await addBook("hidden", { active: false, authors: ["Quiet Writer"] });
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

  describe("authentication (FR-087, FR-090)", () => {
    it("denies a guest following, unfollowing and listing with 401, and stores nothing", async () => {
      const guest = request(app);
      await guest.get("/api/writers").expect(401);
      await guest.post(`/api/writers/${writer["Ada Writer"]}/follow`).expect(401);
      await guest.delete(`/api/writers/${writer["Ada Writer"]}/follow`).expect(401);
      expect((await db.sql("SELECT count(*)::int AS n FROM followed_authors")).rows[0].n).toBe(0);
    });
  });

  describe("following and unfollowing (FR-087)", () => {
    it("follows a writer once; following again keeps a single entry", async () => {
      const m = await member();
      const first = await follow(m, writer["Ada Writer"]);
      expect(first.status).toBe(201);
      expect(first.body.author).toMatchObject({ id: writer["Ada Writer"], name: "Ada Writer", following: true });
      const again = await follow(m, writer["Ada Writer"]);
      expect(again.status).toBe(200);
      expect(await rowsFor(m)).toEqual([writer["Ada Writer"]]);
    });

    it("unfollows, and unfollowing again or a writer never followed is not an error", async () => {
      const m = await member();
      await follow(m, writer["Ada Writer"]).expect(201);
      await unfollow(m, writer["Ada Writer"]).expect(204);
      await unfollow(m, writer["Ada Writer"]).expect(204);
      await unfollow(m, writer["Ben Writer"]).expect(204);
      expect(await rowsFor(m)).toEqual([]);
    });

    it("answers 404 for an unknown or non-numeric writer, the same way every time, storing nothing", async () => {
      const m = await member();
      for (const bad of [999999, "abc", "-1", "1.5", "99999999999999999999"]) {
        const f = await follow(m, bad);
        const u = await unfollow(m, bad);
        expect(f.status).toBe(404);
        expect(u.status).toBe(404);
        expect(f.body.error.message).toBe("Writer not found");
      }
      expect(await rowsFor(m)).toEqual([]);
    });

    it("never creates two rows when the same writer is followed at the same time", async () => {
      const m = await member();
      await Promise.all([follow(m, writer["Ben Writer"]), follow(m, writer["Ben Writer"]), follow(m, writer["Ben Writer"])]);
      expect(await rowsFor(m)).toEqual([writer["Ben Writer"]]);
    });

    it("allows following a writer who has no active books (D5)", async () => {
      const m = await member();
      await follow(m, writer["Quiet Writer"]).expect(201);
      expect(await list(m)).toMatchObject([{ id: writer["Quiet Writer"], name: "Quiet Writer", bookCount: 0 }]);
    });
  });

  describe("listing (FR-088, SC-023)", () => {
    it("is empty for a new member", async () => {
      const m = await member();
      expect(await list(m)).toEqual([]);
    });

    it("lists newest follow first with the number of ACTIVE books", async () => {
      const m = await member();
      await follow(m, writer["Ada Writer"]).expect(201);
      await follow(m, writer["Ben Writer"]).expect(201);
      const items = await list(m);
      expect(items.map((i) => i.id)).toEqual([writer["Ben Writer"], writer["Ada Writer"]]);
      expect(items.find((i) => i.name === "Ada Writer").bookCount).toBe(2); // a3 is inactive
      expect(items.find((i) => i.name === "Ben Writer").bookCount).toBe(2);
      expect(items[0].followedAt).toBeTruthy();
    });

    it("keeps the same list after signing out and in again", async () => {
      const m = await member();
      await follow(m, writer["Ada Writer"]);
      await m.agent.post("/api/members/logout").expect(204);
      await m.agent.get("/api/writers").expect(401);
      await m.agent.post("/api/members/login").send({ identifier: m.email, password }).expect(200);
      expect((await list(m)).map((i) => i.id)).toEqual([writer["Ada Writer"]]);
    });
  });

  describe("writer page (FR-089)", () => {
    it("is public: a guest sees the writer without a following flag", async () => {
      const res = await request(app).get(`/api/authors/${writer["Ada Writer"]}`).expect(200);
      expect(res.body.author).toEqual({ id: writer["Ada Writer"], name: "Ada Writer", bookCount: 2 });
    });

    it("tells a signed-in member whether they follow the writer", async () => {
      const m = await member();
      const before = (await m.agent.get(`/api/authors/${writer["Ada Writer"]}`).expect(200)).body.author;
      expect(before.following).toBe(false);
      await follow(m, writer["Ada Writer"]);
      const after = (await m.agent.get(`/api/authors/${writer["Ada Writer"]}`).expect(200)).body.author;
      expect(after.following).toBe(true);
    });

    it("answers 404 for an unknown or non-numeric writer", async () => {
      for (const bad of [999999, "abc", "-3"]) {
        await request(app).get(`/api/authors/${bad}`).expect(404);
      }
    });

    it("lists the same ACTIVE books as the catalogue author filter", async () => {
      const res = await request(app).get(`/api/books?author=${writer["Ada Writer"]}`).expect(200);
      const bookIds = res.body.items.map((b) => b.id).sort((x, y) => x - y);
      expect(bookIds).toEqual([ids.a1, ids.a2].sort((x, y) => x - y));
      expect(bookIds).not.toContain(ids.a3);
    });

    it("leaves the existing writer list untouched", async () => {
      const all = (await request(app).get("/api/authors").expect(200)).body.items;
      expect(all.map((a) => a.name)).toEqual(["Ada Writer", "Ben Writer"]); // Quiet Writer has no active books
      const filtered = (await request(app).get("/api/authors?q=ben").expect(200)).body.items;
      expect(filtered.map((a) => a.name)).toEqual(["Ben Writer"]);
    });
  });

  describe("ownership and cleanup (FR-090, SC-022)", () => {
    it("never shows or changes another member's followed writers", async () => {
      const a = await member();
      const b = await member();
      await follow(a, writer["Ada Writer"]).expect(201);
      expect(await list(b)).toEqual([]);
      await unfollow(b, writer["Ada Writer"]).expect(204);
      expect((await list(a)).map((i) => i.id)).toEqual([writer["Ada Writer"]]);
      expect((await b.agent.get(`/api/authors/${writer["Ada Writer"]}`)).body.author.following).toBe(false);
    });

    it("removes a member's follows when the member is deleted", async () => {
      const m = await member();
      await follow(m, writer["Ada Writer"]);
      await db.sql("DELETE FROM members WHERE id = $1", [m.id]);
      expect(await rowsFor(m)).toEqual([]);
    });

    it("returns generic errors without internals", async () => {
      const m = await member();
      const res = await follow(m, "abc");
      expect(JSON.stringify(res.body)).not.toMatch(/select|insert|stack|at \w+ \(/i);
    });
  });
});
