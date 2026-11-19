import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

const password = "Sup3rSecret";

describe.skipIf(!hasDb())("addresses, shipping and checkout review (temporary schema)", () => {
  let db;
  let app;
  let closePool;
  let n = 30;
  const ids = {};

  const addBook = async (key, { price = 100, stock = 10, format = "Paperback" } = {}) => {
    const { rows } = await db.sql(
      `INSERT INTO books (isbn, title, short_description, description, cover_url, price, format, language, publication_date, stock_quantity)
       VALUES ($1, $2, 's', 'd', '/covers/fallback.svg', $3, $4, 'English', '2020-01-01', $5) RETURNING id::int AS id`,
      [`isbn-co-${key}`, `Book ${key}`, price, format, stock],
    );
    ids[key] = rows[0].id;
  };

  const goodAddress = { recipient: "Asha Verma", phone: "9876543210", line1: "12 MG Road", city: "Pune", state: "Maharashtra", pinCode: "411001" };

  /** A signed-in browser-like agent. */
  const member = async () => {
    n += 1;
    const agent = request.agent(app);
    const body = { name: "Checkout Reader", email: `co${n}@example.com`, mobile: `98700000${n}`, password, confirmPassword: password };
    await agent.post("/api/members/register").send(body).expect(201);
    await agent.post("/api/members/login").send({ identifier: body.email, password }).expect(200);
    const { rows } = await db.sql("SELECT id::int AS id FROM members WHERE email = $1", [body.email]);
    return { agent, id: rows[0].id };
  };

  const saveAddress = async (agent, over = {}) => (await agent.post("/api/addresses").send({ ...goodAddress, ...over }).expect(201)).body.address;
  const addToCart = (agent, key, quantity = 1) => agent.post("/api/cart/items").send({ bookId: ids[key], quantity }).expect(200);
  const review = (agent, body = {}) => agent.post("/api/checkout/review").send(body);
  const giveBalance = (memberId, points) =>
    db.sql("INSERT INTO gift_point_ledger (member_id, type, points, balance_after, note) VALUES ($1,'EARN',$2,$2,'test')", [memberId, points]);

  beforeAll(async () => {
    db = await createTestSchema();
    await db.sql(`INSERT INTO shipping_zones (pin_prefix, zone, delivery_days, charge) VALUES
      ('4','West',4,59), ('411','Metro',2,40), ('1','North',4,59)`);
    await db.sql(`INSERT INTO app_config (key, value) VALUES
      ('free_shipping_threshold','499'), ('gift_point_rupee_value','1'), ('gift_point_max_redeem_percent','20'),
      ('cod_max_order_value','5000'), ('estimated_delivery_days','5')`);
    await db.sql(`INSERT INTO coupons (code, type, value, valid_from, valid_to, min_order, usage_limit, used_count) VALUES
      ('TEN','PERCENT',10,'2026-01-01','2036-01-01',200,NULL,0),
      ('FLAT50','FLAT',50,'2026-01-01','2036-01-01',0,NULL,0),
      ('OLD','PERCENT',10,'2024-01-01','2024-12-31',0,NULL,0),
      ('USEDUP','FLAT',50,'2026-01-01','2036-01-01',0,1,1)`);
    await addBook("a", { price: 100 });
    await addBook("b", { price: 300 });
    await addBook("ebook", { price: 80, format: "eBook" });
    await addBook("big", { price: 600 });

    const { createApp } = await import("../../src/app.js");
    const { createLoginLimiter, createRegisterLimiter } = await import("../../src/middleware/rateLimit.js");
    ({ closePool } = await import("../../src/lib/db.js"));
    app = createApp({ memberRouteOptions: { loginLimiter: createLoginLimiter({ max: 1000 }), registerLimiter: createRegisterLimiter({ max: 1000 }) } });
  }, 60000);

  afterAll(async () => {
    await closePool?.();
    await db?.drop();
  });

  describe("addresses (FR-053, FR-071)", () => {
    it("requires sign-in", async () => {
      expect((await request(app).get("/api/addresses")).status).toBe(401);
      expect((await request(app).post("/api/checkout/review").send({})).status).toBe(401);
    });

    it("saves, lists, edits and deletes an address; the first one becomes the default", async () => {
      const { agent } = await member();
      const a = await saveAddress(agent);
      expect(a).toMatchObject({ recipient: "Asha Verma", pinCode: "411001", isDefault: true });
      const second = await saveAddress(agent, { recipient: "Second Person", isDefault: true });
      const list = (await agent.get("/api/addresses")).body.items;
      expect(list.find((x) => x.id === second.id).isDefault).toBe(true);
      expect(list.find((x) => x.id === a.id).isDefault).toBe(false);

      const edited = await agent.put(`/api/addresses/${a.id}`).send({ ...goodAddress, city: "Mumbai" });
      expect(edited.status).toBe(200);
      expect(edited.body.address.city).toBe("Mumbai");
      expect((await agent.delete(`/api/addresses/${a.id}`)).status).toBe(204);
      expect((await agent.get("/api/addresses")).body.items).toHaveLength(1);
    });

    it("validates fields and the 6-digit PIN with messages per field", async () => {
      const { agent } = await member();
      for (const pinCode of ["12345", "1234567", "012345", "abcdef", "41100 1"]) {
        const res = await agent.post("/api/addresses").send({ ...goodAddress, pinCode });
        expect(res.status, pinCode).toBe(400);
        expect(res.body.error.fields.pinCode).toBeDefined();
      }
      const bad = await agent.post("/api/addresses").send({ recipient: "", phone: "123", line1: "x", city: "", state: "", pinCode: "" });
      expect(bad.status).toBe(400);
      expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(["recipient", "phone", "line1", "city", "state", "pinCode"]));
    });

    it("never shows or changes another member's address (SC-020)", async () => {
      const one = await member();
      const two = await member();
      const mine = await saveAddress(one.agent);
      expect((await two.agent.get("/api/addresses")).body.items).toEqual([]);
      expect((await two.agent.put(`/api/addresses/${mine.id}`).send(goodAddress)).status).toBe(404);
      expect((await two.agent.delete(`/api/addresses/${mine.id}`)).status).toBe(404);
      expect((await one.agent.get("/api/addresses")).body.items).toHaveLength(1);
    });
  });

  describe("checkout review (FR-054..FR-056, FR-060, SC-017)", () => {
    it("blocks an empty cart", async () => {
      const { agent } = await member();
      const { body } = await review(agent);
      expect(body.review.blockers.map((b) => b.code)).toContain("EMPTY_CART");
    });

    it("needs an address for physical books and shows zone rate, estimate and total", async () => {
      const { agent } = await member();
      await addToCart(agent, "a", 2);
      expect((await review(agent)).body.review.blockers.map((b) => b.code)).toContain("ADDRESS_REQUIRED");

      const addr = await saveAddress(agent);
      const { review: r } = (await review(agent, { addressId: addr.id })).body;
      expect(r.blockers).toEqual([]);
      expect(r.subtotal).toBe(200);
      expect(r.delivery).toMatchObject({ zone: "Metro", deliveryDays: 2, charge: 40, freeShipping: false });
      expect(r.delivery.estimatedDelivery).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.shipping).toBe(40);
      expect(r.total).toBe(240);
    });

    it("charges no shipping at or above the free-shipping threshold", async () => {
      const { agent } = await member();
      await addToCart(agent, "b", 2);
      const addr = await saveAddress(agent);
      const { review: r } = (await review(agent, { addressId: addr.id })).body;
      expect(r.delivery).toMatchObject({ charge: 0, freeShipping: true });
      expect(r.total).toBe(600);
    });

    it("needs no address and no shipping for an eBook-only cart, and offers no Cash on Delivery", async () => {
      const { agent } = await member();
      await addToCart(agent, "ebook");
      const { review: r } = (await review(agent)).body;
      expect(r.blockers).toEqual([]);
      expect(r).toMatchObject({ hasPhysical: false, shipping: 0, total: 80, delivery: null });
      expect(r.paymentMethods.find((m) => m.method === "COD").available).toBe(false);
    });

    it("charges shipping only on physical books in a mixed cart", async () => {
      const { agent } = await member();
      await addToCart(agent, "a");
      await addToCart(agent, "ebook");
      const addr = await saveAddress(agent);
      const { review: r } = (await review(agent, { addressId: addr.id })).body;
      expect(r.shipping).toBe(40);
      expect(r.total).toBe(220);
      expect(r.items.find((i) => i.format === "eBook").estimatedDelivery).toBeNull();
      expect(r.paymentMethods.find((m) => m.method === "COD").available).toBe(false);
    });

    it("rejects an unserviceable PIN with a clear message", async () => {
      const { agent } = await member();
      await addToCart(agent, "a");
      const addr = await saveAddress(agent, { pinCode: "999999" });
      const { review: r } = (await review(agent, { addressId: addr.id })).body;
      expect(r.blockers.map((b) => b.code)).toContain("UNSERVICEABLE_PIN");
      const order = await agent.post("/api/checkout/order").send({ addressId: addr.id });
      expect(order.status).toBe(422);
      expect(order.body.error.code).toBe("UNSERVICEABLE_PIN");
    });

    it("ignores another member's address id", async () => {
      const owner = await member();
      const thief = await member();
      const theirs = await saveAddress(owner.agent);
      await addToCart(thief.agent, "a");
      const { review: r } = (await review(thief.agent, { addressId: theirs.id })).body;
      expect(r.address).toBeNull();
      expect(r.blockers.map((b) => b.code)).toContain("ADDRESS_REQUIRED");
    });

    it("applies valid coupons and explains invalid ones (FR-079)", async () => {
      const { agent } = await member();
      await addToCart(agent, "b");
      const addr = await saveAddress(agent);
      const apply = async (couponCode) => (await review(agent, { addressId: addr.id, couponCode })).body.review;

      expect((await apply("ten")).coupon).toMatchObject({ applied: true, discount: 30 });
      expect((await apply("TEN")).total).toBe(300 - 30 + 40);
      const flat = await apply("FLAT50");
      expect(flat.coupon.discount).toBe(50);
      expect(flat.total).toBe(300 - 50 + 40);
      expect((await apply("OLD")).coupon).toMatchObject({ applied: false, message: expect.stringMatching(/expired/i) });
      expect((await apply("USEDUP")).coupon.message).toMatch(/usage limit/i);
      expect((await apply("NOPE")).coupon.message).toMatch(/not valid/i);
      const cheap = await (async () => {
        const c = await member();
        await addToCart(c.agent, "a");
        const a = await saveAddress(c.agent);
        return (await review(c.agent, { addressId: a.id, couponCode: "TEN" })).body.review;
      })();
      expect(cheap.coupon.applied).toBe(false);
      expect(cheap.coupon.message).toMatch(/at least/i);
    });

    it("limits gift points to the balance and the configured share, and never goes negative (FR-078)", async () => {
      const { agent, id } = await member();
      await giveBalance(id, 500);
      await addToCart(agent, "b", 1);
      const addr = await saveAddress(agent);
      const r = (await review(agent, { addressId: addr.id, redeemPoints: 1000 })).body.review;
      // 20% of 300 = 60 points, below the balance of 500.
      expect(r.points).toMatchObject({ balance: 500, maxRedeemable: 60, redeemed: 60, discount: 60 });
      expect(r.notices.join(" ")).toMatch(/at most 60 points/);
      expect(r.total).toBe(300 - 60 + 40);

      const low = await member();
      await giveBalance(low.id, 10);
      await addToCart(low.agent, "b");
      const addr2 = await saveAddress(low.agent);
      expect((await review(low.agent, { addressId: addr2.id, redeemPoints: 50 })).body.review.points.redeemed).toBe(10);
      expect((await review(low.agent, { redeemPoints: -5 })).status).toBe(400);
    });

    it("flags unavailable items and never trusts a client-sent price", async () => {
      const { agent } = await member();
      await addToCart(agent, "a");
      const addr = await saveAddress(agent);
      const r = (await review(agent, { addressId: addr.id, price: 1, total: 1 })).body.review;
      expect(r.total).toBe(140);
      await db.sql("UPDATE books SET is_active = false WHERE id = $1", [ids.a]);
      const after = (await review(agent, { addressId: addr.id })).body.review;
      expect(after.blockers.map((b) => b.code)).toContain("UNAVAILABLE_ITEMS");
      await db.sql("UPDATE books SET is_active = true WHERE id = $1", [ids.a]);
    });
  });

  describe("placing the order (FR-061)", () => {
    it("creates one Pending Payment order with a price snapshot, and refreshes it instead of duplicating", async () => {
      const { agent } = await member();
      await addToCart(agent, "a", 2);
      const addr = await saveAddress(agent);
      const first = await agent.post("/api/checkout/order").send({ addressId: addr.id });
      expect(first.status).toBe(201);
      expect(first.body.order).toMatchObject({ status: "Pending Payment", subtotal: 200, shippingCharge: 40, total: 240 });
      expect(first.body.order.items).toEqual([expect.objectContaining({ quantity: 2, unitPrice: 100 })]);
      expect(first.body.order.address).toMatchObject({ pinCode: "411001" });

      await db.sql("UPDATE books SET price = 150 WHERE id = $1", [ids.a]);
      const again = await agent.post("/api/checkout/order").send({ addressId: addr.id });
      expect(again.body.order.orderNumber).toBe(first.body.order.orderNumber);
      expect(again.body.order.items[0].unitPrice).toBe(150);
      expect(again.body.order.total).toBe(340);
      await db.sql("UPDATE books SET price = 100 WHERE id = $1", [ids.a]);

      const count = await db.sql("SELECT count(*)::int AS n FROM orders WHERE status = 'Pending Payment'");
      expect(count.rows[0].n).toBeGreaterThan(0);
    });

    it("holds no stock and uses no coupon or points while the order is only Pending Payment", async () => {
      const { agent, id } = await member();
      await giveBalance(id, 100);
      await addToCart(agent, "a");
      const addr = await saveAddress(agent);
      const before = (await db.sql("SELECT stock_quantity FROM books WHERE id = $1", [ids.a])).rows[0].stock_quantity;
      await agent.post("/api/checkout/order").send({ addressId: addr.id, couponCode: "FLAT50", redeemPoints: 10 }).expect(201);
      expect((await db.sql("SELECT stock_quantity FROM books WHERE id = $1", [ids.a])).rows[0].stock_quantity).toBe(before);
      expect((await db.sql("SELECT used_count FROM coupons WHERE code = 'FLAT50'")).rows[0].used_count).toBe(0);
      expect((await agent.get("/api/gift-points")).body.balance).toBe(100);
    });

    it("keeps orders private: another member gets 404 for the order number (FR-071, SC-020)", async () => {
      const owner = await member();
      const other = await member();
      await addToCart(owner.agent, "ebook");
      const placed = await owner.agent.post("/api/checkout/order").send({});
      expect(placed.status).toBe(201);
      const number = placed.body.order.orderNumber;
      expect((await owner.agent.get(`/api/orders/${number}`)).status).toBe(200);
      expect((await other.agent.get(`/api/orders/${number}`)).status).toBe(404);
      expect((await other.agent.get("/api/orders/NOPE")).status).toBe(404);
    });
  });
});
