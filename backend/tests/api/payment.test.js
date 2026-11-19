import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

const password = "Sup3rSecret";

describe.skipIf(!hasDb())("payment and order confirmation (temporary schema, MOCK gateway)", () => {
  let db;
  let app;
  let closePool;
  let gateway;
  let n = 60;
  let keySeq = 0;
  const ids = {};

  const addBook = async (key, { price = 100, stock = 10, format = "Paperback" } = {}) => {
    const { rows } = await db.sql(
      `INSERT INTO books (isbn, title, short_description, description, cover_url, price, format, language, publication_date, stock_quantity)
       VALUES ($1, $2, 's', 'd', '/covers/fallback.svg', $3, $4, 'English', '2020-01-01', $5) RETURNING id::int AS id`,
      [`isbn-pay-${key}`, `Book ${key}`, price, format, stock],
    );
    ids[key] = rows[0].id;
  };

  const newKey = () => `test-key-${String(++keySeq).padStart(6, "0")}-abcdefghij`;
  const stockOf = async (key) => (await db.sql("SELECT stock_quantity FROM books WHERE id = $1", [ids[key]])).rows[0].stock_quantity;
  const paymentRows = async (orderNumber) =>
    (await db.sql("SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.order_number = $1 ORDER BY p.id", [orderNumber])).rows;
  const orderRow = async (orderNumber) => (await db.sql("SELECT * FROM orders WHERE order_number = $1", [orderNumber])).rows[0];

  const member = async () => {
    n += 1;
    const agent = request.agent(app);
    const body = { name: "Pay Reader", email: `pay${n}@example.com`, mobile: `98600000${n}`, password, confirmPassword: password };
    await agent.post("/api/members/register").send(body).expect(201);
    await agent.post("/api/members/login").send({ identifier: body.email, password }).expect(200);
    const { rows } = await db.sql("SELECT id::int AS id FROM members WHERE email = $1", [body.email]);
    return { agent, id: rows[0].id };
  };

  /** Signs in, fills the cart and places a Pending Payment order. */
  async function orderFor({ books = [["a", 1]], coupon, points, withMember } = {}) {
    const m = withMember ?? (await member());
    for (const [key, qty] of books) await m.agent.post("/api/cart/items").send({ bookId: ids[key], quantity: qty }).expect(200);
    let addressId;
    if (books.some(([key]) => key !== "ebook")) {
      const addr = await m.agent
        .post("/api/addresses")
        .send({ recipient: "Asha", phone: "9876543210", line1: "12 MG Road", city: "Pune", state: "Maharashtra", pinCode: "411001" })
        .expect(201);
      addressId = addr.body.address.id;
    }
    const placed = await m.agent.post("/api/checkout/order").send({ addressId, couponCode: coupon, redeemPoints: points }).expect(201);
    return { ...m, order: placed.body.order, number: placed.body.order.orderNumber };
  }

  const pay = (agent, number, over = {}, key = newKey()) =>
    agent.post("/api/payments").set("Idempotency-Key", key).send({ orderNumber: number, method: "CARD", ...over });

  beforeAll(async () => {
    db = await createTestSchema();
    await db.sql("INSERT INTO shipping_zones (pin_prefix, zone, delivery_days, charge) VALUES ('4','West',4,59), ('411','Metro',2,40)");
    await db.sql(`INSERT INTO app_config (key, value) VALUES ('free_shipping_threshold','499'), ('gift_point_rupee_value','1'),
      ('gift_point_max_redeem_percent','20'), ('cod_max_order_value','1000'), ('estimated_delivery_days','5')`);
    await db.sql(`INSERT INTO coupons (code, type, value, valid_from, valid_to, min_order, usage_limit, used_count) VALUES
      ('FLAT50','FLAT',50,'2026-01-01','2036-01-01',0,NULL,0), ('ONE','FLAT',20,'2026-01-01','2036-01-01',0,1,0)`);
    await addBook("a", { price: 100, stock: 1000 });
    await addBook("b", { price: 300, stock: 10 });
    await addBook("ebook", { price: 80, stock: 10, format: "eBook" });
    await addBook("last", { price: 100, stock: 1 });
    await addBook("pricey", { price: 1500, stock: 10 });

    const { createApp } = await import("../../src/app.js");
    const { createLoginLimiter, createRegisterLimiter } = await import("../../src/middleware/rateLimit.js");
    gateway = await import("../../src/modules/payment/gateway/index.js");
    ({ closePool } = await import("../../src/lib/db.js"));
    app = createApp({ memberRouteOptions: { loginLimiter: createLoginLimiter({ max: 1000 }), registerLimiter: createRegisterLimiter({ max: 1000 }) } });
  }, 60000);

  afterAll(async () => {
    await closePool?.();
    await db?.drop();
  });

  describe("successful online payment (SC-014)", () => {
    it("confirms the order only after the gateway approves, stores a confirmation, takes stock and empties the cart", async () => {
      const { agent, number } = await orderFor({ books: [["a", 2]] });
      const before = await stockOf("a");
      expect((await orderRow(number)).status).toBe("Pending Payment");

      const res = await pay(agent, number, { method: "UPI" });
      expect(res.status).toBe(200);
      expect(res.body.order).toMatchObject({ orderNumber: number, status: "Confirmed", total: 240 });
      expect(res.body.payment).toMatchObject({ method: "UPI", amount: 240, status: "AUTHORIZED" });
      expect(res.body.payment.reference).toMatch(/^MOCK-/);

      expect(await stockOf("a")).toBe(before - 2);
      expect((await orderRow(number)).confirmed_at).not.toBeNull();
      expect((await agent.get("/api/cart")).body.cart.items).toEqual([]);
      const stored = await agent.get(`/api/payments/${number}`);
      expect(stored.body.payment).toMatchObject({ status: "AUTHORIZED", amount: 240 });
    });

    it("keeps the purchase price after a later catalogue price change (FR-070)", async () => {
      const { agent, number } = await orderFor({ books: [["b", 1]] });
      await pay(agent, number).expect(200);
      await db.sql("UPDATE books SET price = 999 WHERE id = $1", [ids.b]);
      const order = (await agent.get(`/api/orders/${number}`)).body.order;
      expect(order.items[0].unitPrice).toBe(300);
      expect(order.total).toBe(340); // 300 + 40 shipping (below free-shipping threshold)
      await db.sql("UPDATE books SET price = 300 WHERE id = $1", [ids.b]);
    });
  });

  describe("failed payment (FR-075, SC-014)", () => {
    it("leaves the order unconfirmed, releases stock, coupon and points, and lets the member retry", async () => {
      const m = await member();
      await db.sql("INSERT INTO gift_point_ledger (member_id, type, points, balance_after, note) VALUES ($1,'EARN',100,100,'test')", [m.id]);
      const { agent, number } = await orderFor({ books: [["a", 1]], coupon: "FLAT50", points: 10, withMember: m });
      const stockBefore = await stockOf("a");

      const failed = await pay(agent, number, { simulate: "decline" });
      expect(failed.status).toBe(402);
      expect(failed.body.error.code).toBe("PAYMENT_FAILED");
      expect(failed.body.error.message).toMatch(/declined/i);

      const order = await orderRow(number);
      expect(order.status).toBe("Pending Payment");
      expect(order.confirmed_at).toBeNull();
      expect(order.stock_held).toBe(false);
      expect(await stockOf("a")).toBe(stockBefore);
      expect((await db.sql("SELECT used_count FROM coupons WHERE code = 'FLAT50'")).rows[0].used_count).toBe(0);
      expect((await agent.get("/api/gift-points")).body.balance).toBe(100);
      expect((await paymentRows(number)).map((p) => p.status)).toEqual(["FAILED"]);
      // The cart is untouched, so nothing is re-entered (FR-075).
      expect((await agent.get("/api/cart")).body.cart.itemCount).toBe(1);

      const retry = await pay(agent, number, { method: "NET_BANKING" });
      expect(retry.status).toBe(200);
      expect(retry.body.order.status).toBe("Confirmed");
      expect(await stockOf("a")).toBe(stockBefore - 1);
      expect((await db.sql("SELECT used_count FROM coupons WHERE code = 'FLAT50'")).rows[0].used_count).toBe(1);
      expect((await agent.get("/api/gift-points")).body.balance).toBe(90);
    });

    it("treats a gateway outage or malformed answer as a safe failure, never a confirmation (FR-080)", async () => {
      const { agent, number } = await orderFor({ books: [["a", 1]] });
      const stockBefore = await stockOf("a");
      const outage = await pay(agent, number, { simulate: "error" });
      expect(outage.status).toBe(402);
      expect(outage.body.error.message).toMatch(/not been charged/i);
      expect(JSON.stringify(outage.body)).not.toMatch(/outage|stack/i);

      const original = gateway.getGateway();
      for (const bad of [undefined, null, {}, { approved: "yes" }, { approved: true }, { approved: true, gatewayRef: "" }]) {
        gateway.setGateway({ authorize: async () => bad });
        const res = await pay(agent, number);
        expect(res.status, JSON.stringify(bad)).toBe(402);
      }
      gateway.setGateway(original);
      expect((await orderRow(number)).status).toBe("Pending Payment");
      expect(await stockOf("a")).toBe(stockBefore);
    });
  });

  describe("idempotency (FR-074, SC-015)", () => {
    it("charges once when the same request is submitted twice in a row", async () => {
      const { agent, number } = await orderFor({ books: [["a", 1]] });
      const key = newKey();
      const first = await pay(agent, number, {}, key);
      const second = await pay(agent, number, {}, key);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.payment.reference).toBe(first.body.payment.reference);
      expect(second.body.replayed).toBe(true);
      expect(await paymentRows(number)).toHaveLength(1);
    });

    it("results in exactly one charge and one confirmed order when submitted at the same time", async () => {
      const { agent, number } = await orderFor({ books: [["a", 1]] });
      const stockBefore = await stockOf("a");
      const key = newKey();
      const results = await Promise.all([1, 2, 3, 4].map(() => pay(agent, number, {}, key)));
      const rows = await paymentRows(number);
      expect(rows.filter((r) => r.status === "AUTHORIZED")).toHaveLength(1);
      expect(rows).toHaveLength(1);
      expect(results.some((r) => r.status === 200)).toBe(true);
      expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
      expect(await stockOf("a")).toBe(stockBefore - 1);
    });

    it("never charges twice with different keys for the same order", async () => {
      const { agent, number } = await orderFor({ books: [["a", 1]] });
      const stockBefore = await stockOf("a");
      await Promise.all([1, 2, 3].map(() => pay(agent, number)));
      const confirmed = (await paymentRows(number)).filter((p) => ["AUTHORIZED", "PAY_ON_DELIVERY_PENDING", "PAID"].includes(p.status));
      expect(confirmed).toHaveLength(1);
      expect(await stockOf("a")).toBe(stockBefore - 1);
      // A later submit with a new key reports the existing payment instead of charging again.
      const later = await pay(agent, number);
      expect(later.status).toBe(200);
      expect(later.body.replayed).toBe(true);
      expect((await paymentRows(number)).filter((p) => p.status === "AUTHORIZED")).toHaveLength(1);
    });

    it("refuses to reuse a key for another order and rejects a missing or malformed key", async () => {
      const a = await orderFor({ books: [["a", 1]] });
      const key = newKey();
      await pay(a.agent, a.number, {}, key).expect(200);
      await a.agent.post("/api/cart/items").send({ bookId: ids.b, quantity: 1 }).expect(200);
      const addressId = (await a.agent.get("/api/addresses")).body.items[0].id;
      const second = (await a.agent.post("/api/checkout/order").send({ addressId })).body.order;
      const reuse = await pay(a.agent, second.orderNumber, {}, key);
      expect(reuse.status).toBe(409);
      expect(reuse.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

      const none = await a.agent.post("/api/payments").send({ orderNumber: second.orderNumber, method: "CARD" });
      expect(none.status).toBe(400);
      expect((await pay(a.agent, second.orderNumber, {}, "short")).status).toBe(400);
    });
  });

  describe("Cash on Delivery (FR-072a, SC-015a)", () => {
    it("confirms on accepting the terms with payment Pay on Delivery - Pending", async () => {
      const { agent, number } = await orderFor({ books: [["a", 1]] });
      const without = await pay(agent, number, { method: "COD" });
      expect(without.status).toBe(400);
      expect(without.body.error.fields.acceptCodTerms).toBeDefined();
      expect((await orderRow(number)).status).toBe("Pending Payment");

      const res = await pay(agent, number, { method: "COD", acceptCodTerms: true });
      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe("Confirmed");
      expect(res.body.payment).toMatchObject({ method: "COD", status: "PAY_ON_DELIVERY_PENDING" });
      expect((await agent.get("/api/cart")).body.cart.items).toEqual([]);
    });

    it("is refused for eBooks, mixed carts, and orders above the configured maximum", async () => {
      const ebook = await orderFor({ books: [["ebook", 1]] });
      const e = await pay(ebook.agent, ebook.number, { method: "COD", acceptCodTerms: true });
      expect(e.status).toBe(422);
      expect(e.body.error.code).toBe("METHOD_UNAVAILABLE");

      const mixed = await orderFor({ books: [["a", 1], ["ebook", 1]] });
      expect((await pay(mixed.agent, mixed.number, { method: "COD", acceptCodTerms: true })).status).toBe(422);

      const big = await orderFor({ books: [["pricey", 1]] });
      const over = await pay(big.agent, big.number, { method: "COD", acceptCodTerms: true });
      expect(over.status).toBe(422);
      expect(over.body.error.message).toMatch(/up to/i);
      expect((await orderRow(big.number)).status).toBe("Pending Payment");
    });
  });

  describe("stock, price and coupon races (FR-069)", () => {
    it("does not confirm when the last copy was bought by someone else, and tells the member", async () => {
      const one = await orderFor({ books: [["last", 1]] });
      const two = await orderFor({ books: [["last", 1]] });
      await pay(one.agent, one.number).expect(200);
      expect(await stockOf("last")).toBe(0);

      const lost = await pay(two.agent, two.number);
      expect(lost.status).toBe(409);
      expect(lost.body.error.code).toBe("ITEM_UNAVAILABLE");
      expect(lost.body.error.message).toMatch(/no longer available/i);
      expect((await orderRow(two.number)).status).toBe("Pending Payment");
      expect(await stockOf("last")).toBe(0);
      expect((await paymentRows(two.number)).filter((p) => p.status === "AUTHORIZED")).toHaveLength(0);
    });

    it("lets only one of two simultaneous buyers take the last copy, and never oversells", async () => {
      await db.sql("UPDATE books SET stock_quantity = 1 WHERE id = $1", [ids.last]);
      const one = await orderFor({ books: [["last", 1]] });
      const two = await orderFor({ books: [["last", 1]] });
      const [r1, r2] = await Promise.all([pay(one.agent, one.number), pay(two.agent, two.number)]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      expect(await stockOf("last")).toBe(0);
    });

    it("refuses to pay when the catalogue price changed since the order was placed", async () => {
      const { agent, number } = await orderFor({ books: [["a", 1]] });
      await db.sql("UPDATE books SET price = 120 WHERE id = $1", [ids.a]);
      const res = await pay(agent, number);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("PRICE_CHANGED");
      expect((await orderRow(number)).status).toBe("Pending Payment");
      await db.sql("UPDATE books SET price = 100 WHERE id = $1", [ids.a]);
    });

    it("lets a limited coupon be used only once and rolls back the whole payment if it was taken", async () => {
      const one = await orderFor({ books: [["a", 1]], coupon: "ONE" });
      const two = await orderFor({ books: [["a", 1]], coupon: "ONE" });
      await pay(one.agent, one.number).expect(200);
      const stockBefore = await stockOf("a");
      const res = await pay(two.agent, two.number);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("COUPON_INVALID");
      expect(await stockOf("a")).toBe(stockBefore);
      expect((await db.sql("SELECT used_count FROM coupons WHERE code = 'ONE'")).rows[0].used_count).toBe(1);
    });
  });

  describe("gift points ledger (FR-078, SC-019)", () => {
    it("records a REDEEM entry, keeps the balance equal to the ledger sum, and never goes negative", async () => {
      const m = await member();
      await db.sql("INSERT INTO gift_point_ledger (member_id, type, points, balance_after, note) VALUES ($1,'EARN',200,200,'test')", [m.id]);
      const { agent, number } = await orderFor({ books: [["b", 1]], points: 40, withMember: m });
      await pay(agent, number).expect(200);
      const history = (await agent.get("/api/gift-points")).body;
      expect(history.balance).toBe(160);
      expect(history.history[0]).toMatchObject({ type: "REDEEM", points: -40, balanceAfter: 160, orderNumber: number });
      const sum = (await db.sql("SELECT sum(points)::int AS s FROM gift_point_ledger WHERE member_id = $1", [m.id])).rows[0].s;
      expect(sum).toBe(history.balance);
      expect(sum).toBeGreaterThanOrEqual(0);
    });

    it("refuses payment if the points were spent elsewhere in the meantime", async () => {
      const m = await member();
      await db.sql("INSERT INTO gift_point_ledger (member_id, type, points, balance_after, note) VALUES ($1,'EARN',50,50,'test')", [m.id]);
      const { agent, number } = await orderFor({ books: [["b", 1]], points: 40, withMember: m });
      await db.sql("INSERT INTO gift_point_ledger (member_id, type, points, balance_after, note) VALUES ($1,'REDEEM',-30,20,'spent elsewhere')", [m.id]);
      const res = await pay(agent, number);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INSUFFICIENT_POINTS");
      expect((await orderRow(number)).status).toBe("Pending Payment");
    });
  });

  describe("security and privacy (FR-071, FR-073, SC-020, SC-021)", () => {
    it("requires sign-in", async () => {
      expect((await request(app).post("/api/payments").send({ orderNumber: "x", method: "CARD" })).status).toBe(401);
    });

    it("never lets a member pay for or read another member's order", async () => {
      const owner = await orderFor({ books: [["a", 1]] });
      const other = await member();
      const res = await pay(other.agent, owner.number);
      expect(res.status).toBe(404);
      expect((await other.agent.get(`/api/payments/${owner.number}`)).status).toBe(404);
      expect((await orderRow(owner.number)).status).toBe("Pending Payment");
    });

    it("refuses card numbers, security codes and other credentials, and stores none", async () => {
      const { agent, number } = await orderFor({ books: [["a", 1]] });
      for (const extra of [{ cardNumber: "4111111111111111" }, { cvv: "123" }, { card: { number: "4111111111111111", cvv: "123" } }, { upiId: "me@bank" }, { expiry: "12/30" }]) {
        const res = await pay(agent, number, extra);
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).not.toMatch(/4111|123|me@bank|12\/30/);
      }
      expect(await paymentRows(number)).toHaveLength(0);
      await pay(agent, number, { method: "CARD" }).expect(200);
      const dump = JSON.stringify((await db.sql("SELECT * FROM payments")).rows);
      expect(dump).not.toMatch(/4111111111111111|cvv|\b\d{13,19}\b/i);
    });

    it("rejects an invalid method and an unknown order without leaking details", async () => {
      const { agent, number } = await orderFor({ books: [["a", 1]] });
      expect((await pay(agent, number, { method: "BITCOIN" })).status).toBe(400);
      expect((await pay(agent, "BW-DOES-NOT-EXIST")).status).toBe(404);
      const bad = await agent.post("/api/payments").set("Idempotency-Key", newKey()).send([1, 2, 3]);
      expect(bad.status).toBe(400);
    });

    it("cannot pay for an order twice after it is confirmed, and cannot pay a cancelled order", async () => {
      const { agent, number } = await orderFor({ books: [["a", 1]] });
      await pay(agent, number).expect(200);
      const stockAfter = await stockOf("a");
      const again = await pay(agent, number);
      expect(again.status).toBe(200);
      expect(again.body.replayed).toBe(true);
      expect(await stockOf("a")).toBe(stockAfter);

      const second = await orderFor({ books: [["a", 1]] });
      await db.sql("UPDATE orders SET status = 'Cancelled' WHERE order_number = $1", [second.number]);
      const cancelled = await pay(second.agent, second.number);
      expect(cancelled.status).toBe(409);
      expect(cancelled.body.error.code).toBe("ORDER_NOT_PAYABLE");
    });
  });

  describe("payment gateway is swappable", () => {
    it("uses whatever gateway is registered and sends it no card data", async () => {
      const original = gateway.getGateway();
      const seen = [];
      gateway.setGateway({ authorize: async (args) => (seen.push(args), { approved: true, gatewayRef: "FAKE-REAL-PROVIDER-1" }) });
      const { agent, number } = await orderFor({ books: [["a", 1]] });
      const res = await pay(agent, number, { method: "CARD" });
      gateway.setGateway(original);
      expect(res.body.payment.reference).toBe("FAKE-REAL-PROVIDER-1");
      expect(Object.keys(seen[0]).sort()).toEqual(["amountCents", "method", "reference", "simulate"]);
      expect(seen[0].amountCents).toBe(14000);
      expect(() => gateway.setGateway({})).toThrow();
    });
  });
});
