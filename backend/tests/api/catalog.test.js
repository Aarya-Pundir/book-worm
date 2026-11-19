import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import pg from "pg";
import { createTestSchema, hasDb } from "../helpers/testDb.js";
import { CATEGORY_NAMES } from "../../db/seed-data.js";

describe.skipIf(!hasDb())("catalogue API (temporary schema)", () => {
  let db;
  let app;
  let closePool;

  const get = (path) => request(app).get(path);

  beforeAll(async () => {
    db = await createTestSchema();
    // Seed inside the temp schema using the same client search_path.
    const { seed } = await import("../../db/seed.js");
    const seeder = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await seeder.connect();
    await seeder.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
    await seed(seeder, { bcryptRounds: 4 });
    await seeder.end();

    const { createApp } = await import("../../src/app.js");
    const { createLoginLimiter, createRegisterLimiter } = await import("../../src/middleware/rateLimit.js");
    ({ closePool } = await import("../../src/lib/db.js"));
    app = createApp({
      memberRouteOptions: {
        loginLimiter: createLoginLimiter({ max: 1000 }),
        registerLimiter: createRegisterLimiter({ max: 1000 }),
      },
    });
  }, 120000);

  afterAll(async () => {
    await closePool?.();
    await db?.drop();
  });

  it("lists the 19 stored genres in order for the sidebar (All is UI-only)", async () => {
    const res = await get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body.items.map((c) => c.name)).toEqual(CATEGORY_NAMES);
    expect(res.body.items.every((c) => c.bookCount > 0)).toBe(true);
  });

  it("returns paginated active books and never exposes inactive ones", async () => {
    const res = await get("/api/books?pageSize=12");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(12);
    expect(res.body.pageSize).toBe(12);
    const inactive = await db.sql("SELECT count(*)::int AS n FROM books WHERE NOT is_active");
    const all = await db.sql("SELECT count(*)::int AS n FROM books");
    expect(res.body.total).toBe(all.rows[0].n - inactive.rows[0].n);
    const inactiveIds = (await db.sql("SELECT id::int FROM books WHERE NOT is_active")).rows.map((r) => r.id);
    const last = await get(`/api/books?pageSize=50&page=${Math.ceil(res.body.total / 50)}`);
    for (const b of [...res.body.items, ...last.body.items]) expect(inactiveIds).not.toContain(b.id);
  });

  it("page 2 differs from page 1 and respects the page size", async () => {
    const p1 = await get("/api/books?pageSize=10&page=1&sort=price_asc");
    const p2 = await get("/api/books?pageSize=10&page=2&sort=price_asc");
    const ids1 = p1.body.items.map((b) => b.id);
    expect(p2.body.items).toHaveLength(10);
    expect(p2.body.items.every((b) => !ids1.includes(b.id))).toBe(true);
    expect(p2.body.items[0].price).toBeGreaterThanOrEqual(p1.body.items[9].price);
  });

  it("genre filter returns only that genre, and books in two genres appear under both (FR-025)", async () => {
    const multi = await db.sql(
      `SELECT bc.book_id::int AS id FROM book_categories bc JOIN books b ON b.id = bc.book_id AND b.is_active
        GROUP BY bc.book_id HAVING count(*) > 1 LIMIT 1`,
    );
    const bookId = multi.rows[0].id;
    const detail = await get(`/api/books/${bookId}`);
    expect(detail.body.book.categories.length).toBeGreaterThan(1);
    for (const c of detail.body.book.categories) {
      const res = await get(`/api/books?category=${c.slug}&pageSize=50`);
      expect(res.status).toBe(200);
      expect(res.body.items.every((b) => b.categories.some((x) => x.slug === c.slug))).toBe(true);
      const ids = [];
      for (let p = 1; p <= res.body.totalPages; p += 1) {
        ids.push(...(await get(`/api/books?category=${c.slug}&pageSize=50&page=${p}`)).body.items.map((b) => b.id));
      }
      expect(ids).toContain(bookId);
    }
  });

  it("every one of the 19 genres returns books (SC-005)", async () => {
    const cats = (await get("/api/categories")).body.items;
    for (const c of cats) {
      const res = await get(`/api/books?category=${c.slug}`);
      expect(res.body.total).toBeGreaterThan(0);
    }
  });

  it("combines genre, language, format, price range, search, sort and page: every result meets all criteria (SC-006)", async () => {
    const res = await get(
      "/api/books?category=fantasy&language=English&minPrice=100&maxPrice=700&sort=price_desc&pageSize=5&q=a",
    );
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    let prev = Infinity;
    for (const b of res.body.items) {
      expect(b.categories.some((c) => c.slug === "fantasy")).toBe(true);
      expect(b.language).toBe("English");
      expect(b.price).toBeGreaterThanOrEqual(100);
      expect(b.price).toBeLessThanOrEqual(700);
      expect(`${b.title} ${b.authors.map((a) => a.name).join(" ")}`.toLowerCase()).toContain("a");
      expect(b.price).toBeLessThanOrEqual(prev);
      prev = b.price;
    }
    // Format filter on top of the same set.
    const fmt = await get("/api/books?category=fantasy&format=Hardcover&pageSize=50");
    expect(fmt.body.items.every((b) => b.format === "Hardcover")).toBe(true);
  });

  it("searches by title and author with partial, case-insensitive matching", async () => {
    const sample = (await db.sql(
      `SELECT b.title, a.name AS author FROM books b JOIN book_authors ba ON ba.book_id = b.id
         JOIN authors a ON a.id = ba.author_id WHERE b.is_active LIMIT 1`,
    )).rows[0];
    const byTitle = await get(`/api/books?q=${encodeURIComponent(sample.title.slice(2, 9).toUpperCase())}&pageSize=50`);
    expect(byTitle.body.items.some((b) => b.title === sample.title)).toBe(true);
    const byAuthor = await get(`/api/books?q=${encodeURIComponent(sample.author.split(" ")[1].toLowerCase())}&pageSize=50`);
    expect(byAuthor.body.items.some((b) => b.authors.some((a) => a.name === sample.author))).toBe(true);
  });

  it("treats % and _ in search text literally", async () => {
    const res = await get("/api/books?q=%25");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("filters by author and publisher ids and keeps them separate from genre (FR-036)", async () => {
    const authors = (await get("/api/authors")).body.items;
    const publishers = (await get("/api/publishers")).body.items;
    expect(authors.length).toBeGreaterThan(0);
    expect(publishers.length).toBeGreaterThan(0);
    const byAuthor = await get(`/api/books?author=${authors[0].id}&pageSize=50`);
    expect(byAuthor.body.items.every((b) => b.authors.some((a) => a.id === authors[0].id))).toBe(true);
    const byPublisher = await get(`/api/books?publisher=${publishers[0].id}&pageSize=50`);
    expect(byPublisher.body.items.every((b) => b.publisher.id === publishers[0].id)).toBe(true);
    const found = await get(`/api/authors?q=${encodeURIComponent(authors[0].name.slice(0, 3))}`);
    expect(found.body.items.some((a) => a.id === authors[0].id)).toBe(true);
  });

  it("lists the languages of active books for the language filter", async () => {
    const res = await get("/api/languages");
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(expect.arrayContaining(["English", "Hindi"]));
  });

  it("sorts newest first and by popularity", async () => {
    const newest = (await get("/api/books?sort=newest&pageSize=20")).body.items;
    const dates = (await db.sql("SELECT id::int, publication_date::text AS d FROM books")).rows;
    const byId = Object.fromEntries(dates.map((r) => [r.id, r.d]));
    for (let i = 1; i < newest.length; i += 1) expect(byId[newest[i - 1].id] >= byId[newest[i].id]).toBe(true);
    const pop = (await get("/api/books?sort=popularity&pageSize=20")).body.items;
    const scores = Object.fromEntries((await db.sql("SELECT id::int, popularity_score AS s FROM books")).rows.map((r) => [r.id, r.s]));
    for (let i = 1; i < pop.length; i += 1) expect(scores[pop[i - 1].id]).toBeGreaterThanOrEqual(scores[pop[i].id]);
  });

  it("returns an empty list (not an error) when nothing matches", async () => {
    const res = await get("/api/books?q=zzzzqqqq");
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("rejects invalid filters with field messages (FR-034)", async () => {
    const range = await get("/api/books?minPrice=500&maxPrice=100");
    expect(range.status).toBe(400);
    expect(range.body.error.fields.minPrice).toMatch(/cannot be higher/i);
    const bad = await get("/api/books?format=Audio&sort=nonsense&page=0&pageSize=500&minPrice=abc");
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(["format", "minPrice", "page", "pageSize", "sort"]);
  });

  it("book details include related books and a labelled estimate; unknown or inactive ids give 404", async () => {
    const id = (await get("/api/books?format=Paperback&pageSize=1")).body.items[0].id;
    const res = await get(`/api/books/${id}`);
    expect(res.status).toBe(200);
    const book = res.body.book;
    expect(book).toMatchObject({ id, inStock: expect.any(Boolean) });
    expect(book.description.length).toBeGreaterThan(0);
    expect(book.estimatedDelivery).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(book.related.length).toBeGreaterThan(0);
    expect(book.related.every((r) => r.id !== id)).toBe(true);

    expect((await get("/api/books/99999999")).status).toBe(404);
    expect((await get("/api/books/abc")).status).toBe(404);
    const inactive = (await db.sql("SELECT id::int FROM books WHERE NOT is_active LIMIT 1")).rows[0].id;
    expect((await get(`/api/books/${inactive}`)).status).toBe(404);
  });

  it("eBooks have no delivery estimate", async () => {
    const res = await get("/api/books?format=eBook&pageSize=5");
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((b) => b.estimatedDelivery === null)).toBe(true);
  });

  it("featured: bestsellers by popularity, new launches newest first", async () => {
    const best = (await get("/api/books/featured?type=bestsellers&limit=6")).body.items;
    const news = (await get("/api/books/featured?type=new&limit=6")).body.items;
    expect(best).toHaveLength(6);
    expect(news).toHaveLength(6);
    const rows = (await db.sql("SELECT id::int, popularity_score AS s, publication_date::text AS d FROM books")).rows;
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    for (let i = 1; i < best.length; i += 1) expect(by[best[i - 1].id].s).toBeGreaterThanOrEqual(by[best[i].id].s);
    for (let i = 1; i < news.length; i += 1) expect(by[news[i - 1].id].d >= by[news[i].id].d).toBe(true);
    expect((await get("/api/books/featured?type=bogus")).status).toBe(400);
  });

  describe("Recommended for You", () => {
    const registerAndLogin = async (email, mobile) => {
      const agent = request.agent(app);
      const password = "Sup3rSecret";
      await agent.post("/api/members/register").send({ name: "Rec Tester", email, mobile, password, confirmPassword: password });
      await agent.post("/api/members/login").send({ identifier: email, password });
      const me = await agent.get("/api/members/me");
      return { agent, id: me.body.member.id };
    };

    it("guests and members without orders get popular books, not described as personalised", async () => {
      const guest = await get("/api/books/recommended");
      expect(guest.status).toBe(200);
      expect(guest.body.personalised).toBe(false);
      expect(guest.body.items.length).toBeGreaterThan(0);
      const { agent } = await registerAndLogin("noorders@example.com", "9222222201");
      const res = await agent.get("/api/books/recommended");
      expect(res.body.personalised).toBe(false);
    });

    it("uses only the member's own order history, excluding books already bought", async () => {
      const { agent, id } = await registerAndLogin("buyer@example.com", "9222222202");
      const romance = (await db.sql(
        `SELECT b.id::int FROM books b JOIN book_categories bc ON bc.book_id = b.id
           JOIN categories c ON c.id = bc.category_id WHERE c.slug = 'romance' AND b.is_active ORDER BY b.id LIMIT 1`,
      )).rows[0].id;
      const order = await db.sql(
        "INSERT INTO orders (order_number, member_id, status, total) VALUES ('BW-TEST-0001', $1, 'Delivered', 100) RETURNING id",
        [id],
      );
      await db.sql("INSERT INTO order_lines (order_id, book_id, quantity, unit_price) VALUES ($1, $2, 1, 100)", [order.rows[0].id, romance]);

      const res = await agent.get("/api/books/recommended?limit=12");
      expect(res.body.personalised).toBe(true);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items.map((b) => b.id)).not.toContain(romance);
      expect(res.body.items.every((b) => b.categories.some((c) => c.slug === "romance"))).toBe(true);
    });

    it("never leaks another customer's purchases (FR-019)", async () => {
      // 'buyer' above has a Romance-only order; a different member without orders must be unaffected.
      const { agent } = await registerAndLogin("bystander@example.com", "9222222203");
      const res = await agent.get("/api/books/recommended");
      expect(res.body.personalised).toBe(false);
      const popular = (await get("/api/books/recommended")).body.items.map((b) => b.id);
      expect(res.body.items.map((b) => b.id)).toEqual(popular);
      expect(JSON.stringify(res.body)).not.toMatch(/member|order|email/i);
    });
  });
});
