import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

const password = "Sup3rSecret";

// Phase 7.5 integration (T108): My Wishlist and My Writers working together with the cart, checkout and the
// MOCK payment gateway. Payment stays PARTIAL; nothing here is a real provider.
describe.skipIf(!hasDb())("wishlist and writers across cart, checkout and payment (temporary schema, MOCK gateway)", () => {
  let db;
  let app;
  let closePool;
  let n = 200;
  let keySeq = 0;
  const ids = {};
  const writer = {};

  const addBook = async (key, { price = 100, stock = 10, active = true, author } = {}) => {
    const { rows } = await db.sql(
      `INSERT INTO books (isbn, title, short_description, description, cover_url, price, format, language, publication_date, is_active, stock_quantity)
       VALUES ($1, $2, 's', 'd', '/covers/x.svg', $3, 'Paperback', 'English', '2020-01-01', $4, $5) RETURNING id::int AS id`,
      [`isbn-li-${key}`, `Book ${key}`, price, active, stock],
    );
    ids[key] = rows[0].id;
    if (author) {
      if (!writer[author]) writer[author] = (await db.sql("INSERT INTO authors (name) VALUES ($1) RETURNING id::int AS id", [author])).rows[0].id;
      await db.sql("INSERT INTO book_authors (book_id, author_id) VALUES ($1, $2)", [ids[key], writer[author]]);
    }
  };

  const member = async () => {
    n += 1;
    const agent = request.agent(app);
    const email = `li${n}@example.com`;
    await agent.post("/api/members/register").send({ name: "List Reader", email, mobile: `9890001${n}`, password, confirmPassword: password }).expect(201);
    await agent.post("/api/members/login").send({ identifier: email, password }).expect(200);
    return { agent, id: (await db.sql("SELECT id::int AS id FROM members WHERE email = $1", [email])).rows[0].id };
  };
  const address = async (m) =>
    (
      await m.agent
        .post("/api/addresses")
        .send({ recipient: "Asha", phone: "9876543210", line1: "12 MG Road", city: "Pune", state: "Maharashtra", pinCode: "411001" })
        .expect(201)
    ).body.address.id;
  const newKey = () => `li-key-${String(++keySeq).padStart(6, "0")}-abcdefghij`;

  beforeAll(async () => {
    db = await createTestSchema();
    await db.sql("INSERT INTO shipping_zones (pin_prefix, zone, delivery_days, charge) VALUES ('4','West',4,59), ('411','Metro',2,40)");
    await db.sql(`INSERT INTO app_config (key, value) VALUES ('free_shipping_threshold','499'), ('gift_point_rupee_value','1'),
      ('gift_point_max_redeem_percent','20'), ('cod_max_order_value','1000'), ('estimated_delivery_days','5'), ('wishlist_max_items','200')`);
    await addBook("one", { price: 100, stock: 10, author: "Ada Writer" });
    await addBook("two", { price: 300, stock: 10, author: "Ada Writer" });
    await addBook("three", { price: 120, stock: 10, author: "Ben Writer" });
    const { createApp } = await import("../../src/app.js");
    const { createLoginLimiter, createRegisterLimiter } = await import("../../src/middleware/rateLimit.js");
    ({ closePool } = await import("../../src/lib/db.js"));
    app = createApp({ memberRouteOptions: { loginLimiter: createLoginLimiter({ max: 1000 }), registerLimiter: createRegisterLimiter({ max: 1000 }) } });
  }, 60000);

  afterAll(async () => {
    await closePool?.();
    await db?.drop();
  });

  it("takes a wishlist book to the cart, through checkout review, to a paid order", async () => {
    const m = await member();
    await m.agent.post("/api/wishlist/items").send({ bookId: ids.one }).expect(201);
    const toCart = await m.agent.post("/api/wishlist/cart").send({ bookIds: [ids.one] }).expect(200);
    expect(toCart.body.added).toHaveLength(1);
    expect(toCart.body.cart.items.map((i) => i.bookId)).toEqual([ids.one]);

    const addressId = await address(m);
    const review = await m.agent.post("/api/checkout/review").send({ addressId }).expect(200);
    expect(JSON.stringify(review.body)).toContain("Book one");

    const placed = await m.agent.post("/api/checkout/order").send({ addressId }).expect(201);
    const number = placed.body.order.orderNumber;
    const paid = await m.agent.post("/api/payments").set("Idempotency-Key", newKey()).send({ orderNumber: number, method: "CARD" }).expect(200);
    expect(paid.body.order.status).toBe("Confirmed");
    expect(paid.body.payment.reference).toMatch(/^MOCK-/);

    // The book stays on the wishlist (D3) and the cart was emptied by the paid order.
    expect((await m.agent.get("/api/wishlist")).body.items.map((i) => i.bookId)).toEqual([ids.one]);
    expect((await m.agent.get("/api/cart")).body.cart.items).toEqual([]);
  });

  it("handles a book deactivated in the middle of the flow without breaking the wishlist or the cart", async () => {
    const m = await member();
    await m.agent.post("/api/wishlist/items").send({ bookId: ids.two }).expect(201);
    await m.agent.post("/api/wishlist/items").send({ bookId: ids.three }).expect(201);
    await m.agent.post("/api/wishlist/cart").send({ bookIds: [ids.two] }).expect(200);

    await db.sql("UPDATE books SET is_active = false WHERE id = $1", [ids.two]);
    try {
      const view = (await m.agent.get("/api/wishlist").expect(200)).body;
      const gone = view.items.find((i) => i.bookId === ids.two);
      expect(Object.keys(gone).sort()).toEqual(["available", "bookId", "coverUrl", "title", "unavailableReason"]);
      expect(view.items.find((i) => i.bookId === ids.three).available).toBe(true);

      // "Add all" skips the deactivated book with a reason and still adds the other one.
      const all = await m.agent.post("/api/wishlist/cart").send({}).expect(200);
      expect(all.body.added.map((a) => a.bookId)).toEqual([ids.three]);
      expect(all.body.skipped).toEqual([expect.objectContaining({ bookId: ids.two, reason: "No longer available" })]);

      // The cart's own rules flag the deactivated book; the wishlist can still remove it.
      const cart = (await m.agent.get("/api/cart").expect(200)).body.cart;
      expect(cart.items.find((i) => i.bookId === ids.two)?.available).toBe(false);
      await m.agent.delete(`/api/wishlist/items/${ids.two}`).expect(204);
    } finally {
      await db.sql("UPDATE books SET is_active = true WHERE id = $1", [ids.two]);
    }
  });

  it("follows a writer, opens their books and wishlists one", async () => {
    const m = await member();
    const ada = writer["Ada Writer"];
    await m.agent.post(`/api/writers/${ada}/follow`).expect(201);
    expect((await m.agent.get(`/api/authors/${ada}`).expect(200)).body.author.following).toBe(true);

    const books = (await m.agent.get(`/api/books?author=${ada}`).expect(200)).body.items;
    expect(books.map((b) => b.id).sort((a, b) => a - b)).toEqual([ids.one, ids.two].sort((a, b) => a - b));

    await m.agent.post("/api/wishlist/items").send({ bookId: books[0].id }).expect(201);
    expect((await m.agent.get("/api/wishlist").expect(200)).body.count).toBe(1);
    expect((await m.agent.get("/api/writers").expect(200)).body.items.map((w) => w.id)).toEqual([ada]);
  });

  it("never lets two members see or change each other's wishlist or followed writers", async () => {
    const a = await member();
    const b = await member();
    await a.agent.post("/api/wishlist/items").send({ bookId: ids.one }).expect(201);
    await a.agent.post(`/api/writers/${writer["Ben Writer"]}/follow`).expect(201);

    expect((await b.agent.get("/api/wishlist").expect(200)).body.items).toEqual([]);
    expect((await b.agent.get("/api/writers").expect(200)).body.items).toEqual([]);
    await b.agent.delete(`/api/wishlist/items/${ids.one}`).expect(204);
    await b.agent.delete(`/api/writers/${writer["Ben Writer"]}/follow`).expect(204);
    const moved = await b.agent.post("/api/wishlist/cart").send({ bookIds: [ids.one] }).expect(200);
    expect(moved.body.added).toEqual([]);
    expect((await b.agent.get("/api/cart").expect(200)).body.cart.items).toEqual([]);

    expect((await a.agent.get("/api/wishlist").expect(200)).body.items.map((i) => i.bookId)).toEqual([ids.one]);
    expect((await a.agent.get("/api/writers").expect(200)).body.items.map((w) => w.id)).toEqual([writer["Ben Writer"]]);
  });
});
