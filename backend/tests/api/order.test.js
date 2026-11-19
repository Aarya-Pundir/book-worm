import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

const password = "Sup3rSecret";
const HOUR = 3600 * 1000;

describe.skipIf(!hasDb())("orders, cancellation, returns, shipments and gift points (temporary schema, MOCK gateway)", () => {
  let db;
  let app;
  let closePool;
  let gateway;
  let lifecycle;
  let n = 100;
  let keySeq = 0;
  const ids = {};

  const addBook = async (key, { price = 100, stock = 1000, format = "Paperback", active = true } = {}) => {
    const { rows } = await db.sql(
      `INSERT INTO books (isbn, title, short_description, description, cover_url, price, format, language, publication_date, stock_quantity, is_active)
       VALUES ($1, $2, 's', 'd', '/covers/fallback.svg', $3, $4, 'English', '2020-01-01', $5, $6) RETURNING id::int AS id`,
      [`isbn-ord-${key}`, `Book ${key}`, price, format, stock, active],
    );
    ids[key] = rows[0].id;
  };

  const stockOf = async (key) => (await db.sql("SELECT stock_quantity FROM books WHERE id = $1", [ids[key]])).rows[0].stock_quantity;
  const orderRow = async (num) => (await db.sql("SELECT * FROM orders WHERE order_number = $1", [num])).rows[0];
  const newKey = () => `ord-key-${String(++keySeq).padStart(6, "0")}-abcdefghij`;

  const register = async (role = "MEMBER") => {
    n += 1;
    const agent = request.agent(app);
    const email = `ord${n}@example.com`;
    await agent.post("/api/members/register").send({ name: "Order Reader", email, mobile: `9870000${n}`, password, confirmPassword: password }).expect(201);
    if (role === "ADMIN") await db.sql("UPDATE members SET role = 'ADMIN' WHERE email = $1", [email]);
    await agent.post("/api/members/login").send({ identifier: email, password }).expect(200);
    const { rows } = await db.sql("SELECT id::int AS id FROM members WHERE email = $1", [email]);
    return { agent, id: rows[0].id };
  };

  const addAddress = async (m) =>
    (await m.agent.post("/api/addresses").send({ recipient: "Asha", phone: "9876543210", line1: "12 MG Road", city: "Pune", state: "Maharashtra", pinCode: "411001" }).expect(201)).body.address.id;

  /** Signs in, orders and pays. Returns the member and the Confirmed order number. */
  async function buy({ books = [["a", 1]], method = "CARD", coupon, points, member } = {}) {
    const m = member ?? (await register());
    for (const [key, qty] of books) await m.agent.post("/api/cart/items").send({ bookId: ids[key], quantity: qty }).expect(200);
    const physical = books.some(([k]) => k !== "ebook");
    const addressId = physical ? await addAddress(m) : undefined;
    const placed = await m.agent.post("/api/checkout/order").send({ addressId, couponCode: coupon, redeemPoints: points }).expect(201);
    const number = placed.body.order.orderNumber;
    const body = { orderNumber: number, method };
    if (method === "COD") body.acceptCodTerms = true;
    await m.agent.post("/api/payments").set("Idempotency-Key", newKey()).send(body).expect(200);
    return { ...m, number };
  }

  /** Moves time: pretends the order was confirmed `hours` ago, so windows and timers can be tested without waiting. */
  const ageOrder = async (number, hours) => {
    const ms = hours * HOUR;
    await db.sql(
      `UPDATE orders SET confirmed_at = confirmed_at - ($2 || ' milliseconds')::interval, created_at = created_at - ($2 || ' milliseconds')::interval
        WHERE order_number = $1`,
      [number, String(ms)],
    );
    await db.sql(
      `UPDATE shipments SET created_at = created_at - ($2 || ' milliseconds')::interval
        WHERE order_id = (SELECT id FROM orders WHERE order_number = $1)`,
      [number, String(ms)],
    );
  };
  const ageDelivery = async (number, days) => {
    await db.sql("UPDATE orders SET delivered_at = delivered_at - ($2 || ' days')::interval WHERE order_number = $1", [number, String(days)]);
  };
  const ageReturn = async (number, minutes) => {
    await db.sql(
      "UPDATE return_shipments SET created_at = created_at - ($2 || ' minutes')::interval WHERE order_id = (SELECT id FROM orders WHERE order_number = $1)",
      [number, String(minutes)],
    );
  };

  const detail = async (m, number) => (await m.agent.get(`/api/orders/${number}`).expect(200)).body.order;
  const override = (admin, number, status, path = "shipment") => admin.agent.post(`/api/admin/orders/${number}/${path}`).send({ status });
  const balance = async (m) => (await m.agent.get("/api/gift-points")).body.balance;
  const grant = (m, points) =>
    db.sql("INSERT INTO gift_point_ledger (member_id, type, points, balance_after, note) VALUES ($1,'EARN',$2,$2,'test')", [m.id, points]);

  beforeAll(async () => {
    db = await createTestSchema();
    await db.sql("INSERT INTO shipping_zones (pin_prefix, zone, delivery_days, charge) VALUES ('411','Metro',2,40)");
    await db.sql(`INSERT INTO app_config (key, value) VALUES ('free_shipping_threshold','499'), ('gift_point_rupee_value','1'),
      ('gift_point_max_redeem_percent','50'), ('gift_point_earn_rate_percent','10'), ('cod_max_order_value','5000'),
      ('cancel_window_hours','48'), ('return_window_days','7'),
      ('shipment_timer_dispatch_minutes','2'), ('shipment_timer_in_transit_minutes','5'), ('shipment_timer_delivered_minutes','10'),
      ('return_timer_pickup_minutes','2'), ('return_timer_received_minutes','5')`);
    await db.sql(`INSERT INTO coupons (code, type, value, valid_from, valid_to, min_order, usage_limit, used_count) VALUES
      ('FLAT50','FLAT',50,'2026-01-01','2036-01-01',0,NULL,0), ('ONE','FLAT',20,'2026-01-01','2036-01-01',0,1,0)`);
    await addBook("a", { price: 100 });
    await addBook("b", { price: 300 });
    await addBook("ebook", { price: 80, format: "eBook" });

    const { createApp } = await import("../../src/app.js");
    const { createLoginLimiter, createRegisterLimiter } = await import("../../src/middleware/rateLimit.js");
    gateway = await import("../../src/modules/payment/gateway/index.js");
    lifecycle = await import("../../src/modules/order/order.lifecycle.js");
    ({ closePool } = await import("../../src/lib/db.js"));
    app = createApp({ memberRouteOptions: { loginLimiter: createLoginLimiter({ max: 1000 }), registerLimiter: createRegisterLimiter({ max: 1000 }) } });
  }, 60000);

  afterAll(async () => {
    await closePool?.();
    await db?.drop();
  });

  describe("My Orders and order details (FR-063, FR-064, SC-020)", () => {
    it("shows only the member's own orders, newest first, never a Pending Payment order", async () => {
      const m = await register();
      const first = await buy({ books: [["a", 1]], member: m });
      const second = await buy({ books: [["b", 1]], member: m });
      await m.agent.post("/api/cart/items").send({ bookId: ids.a, quantity: 1 }).expect(200);
      const addressId = (await m.agent.get("/api/addresses")).body.items[0].id;
      await m.agent.post("/api/checkout/order").send({ addressId }).expect(201); // stays Pending Payment

      const list = (await m.agent.get("/api/orders").expect(200)).body.items;
      expect(list.map((o) => o.orderNumber)).toEqual([second.number, first.number]);
      expect(list[0]).toMatchObject({ status: "Confirmed", total: 340 });
      expect(list[0].items[0]).toMatchObject({ title: "Book b", quantity: 1 });

      const other = await register();
      expect((await other.agent.get("/api/orders").expect(200)).body.items).toEqual([]);
      expect((await request(app).get("/api/orders")).status).toBe(401);
    });

    it("shows items, address, payment, shipment status and an estimated delivery date before dispatch (SC-018)", async () => {
      const m = await buy({ books: [["a", 2]] });
      const o = await detail(m, m.number);
      expect(o).toMatchObject({ status: "Confirmed", total: 240, subtotal: 200, shippingCharge: 40 });
      expect(o.address).toMatchObject({ city: "Pune", pinCode: "411001" });
      expect(o.payment).toMatchObject({ method: "CARD", status: "AUTHORIZED", statusLabel: "Paid" });
      expect(o.shipment).toMatchObject({ status: "Preparing", trackingRef: null, confirmedDate: null });
      expect(o.estimatedDelivery).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(o.confirmedDelivery).toBeNull();
      expect(o.shipment.events.map((e) => e.status)).toEqual(["Preparing"]);
    });

    it("denies access to another member's order, cancel, return and Buy Again (SC-020)", async () => {
      const owner = await buy();
      const other = await register();
      expect((await other.agent.get(`/api/orders/${owner.number}`)).status).toBe(404);
      expect((await other.agent.post(`/api/orders/${owner.number}/cancel`).send({})).status).toBe(404);
      expect((await other.agent.post(`/api/orders/${owner.number}/return`).send({})).status).toBe(404);
      expect((await other.agent.post(`/api/orders/${owner.number}/buy-again`).send({})).status).toBe(404);
      expect((await orderRow(owner.number)).status).toBe("Confirmed");
    });
  });

  describe("cancellation (FR-065, FR-066, SC-016)", () => {
    it("cancels inside the window, releases stock, restores coupon use and points, and starts a refund", async () => {
      const m = await register();
      await grant(m, 100);
      const stockBefore = await stockOf("a");
      const { number } = await buy({ books: [["a", 2]], coupon: "ONE", points: 30, member: m });
      expect(await stockOf("a")).toBe(stockBefore - 2);
      expect(await balance(m)).toBe(70);

      const res = await m.agent.post(`/api/orders/${number}/cancel`).send({ reason: "Changed my mind" });
      expect(res.status).toBe(200);
      expect(res.body.order).toMatchObject({ status: "Cancelled", cancelReason: "Changed my mind" });
      expect(res.body.order.refunds[0]).toMatchObject({ reason: "CANCELLATION", status: "COMPLETED", amount: 190 });
      expect(res.body.order.payment.statusLabel).toBe("Refunded");

      expect(await stockOf("a")).toBe(stockBefore);
      expect((await db.sql("SELECT used_count FROM coupons WHERE code = 'ONE'")).rows[0].used_count).toBe(0);
      expect(await balance(m)).toBe(100);
      const sum = (await db.sql("SELECT sum(points)::int AS s FROM gift_point_ledger WHERE member_id = $1", [m.id])).rows[0].s;
      expect(sum).toBe(100);
      expect((await orderRow(number)).stock_held).toBe(false);
      expect((await detail(m, number)).shipment.status).toBe("Cancelled");
    });

    it("declines after the window with a clear reason, changing nothing", async () => {
      const m = await buy();
      await ageOrder(m.number, 49);
      // 49 hours of timers would already have delivered it; hold the shipment at Preparing to isolate the window rule.
      await db.sql("UPDATE shipments SET created_at = now() WHERE order_id = (SELECT id FROM orders WHERE order_number = $1)", [m.number]);
      const stock = await stockOf("a");
      const res = await m.agent.post(`/api/orders/${m.number}/cancel`).send({});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CANCEL_NOT_ALLOWED");
      expect(res.body.error.message).toMatch(/48-hour cancellation window has passed/);
      expect((await orderRow(m.number)).status).toBe("Confirmed");
      expect(await stockOf("a")).toBe(stock);
      expect((await db.sql("SELECT 1 FROM refunds WHERE order_id = (SELECT id FROM orders WHERE order_number = $1)", [m.number])).rowCount).toBe(0);
    });

    it("declines once the order is dispatched, whether by timer or by an admin", async () => {
      const admin = await register("ADMIN");
      const timer = await buy();
      await ageOrder(timer.number, 3 / 60); // 3 minutes: past the 2-minute dispatch timer
      const byTimer = await timer.agent.post(`/api/orders/${timer.number}/cancel`).send({});
      expect(byTimer.status).toBe(409);
      expect(byTimer.body.error.message).toMatch(/dispatched/);

      const manual = await buy();
      await override(admin, manual.number, "Dispatched").expect(200);
      const byAdmin = await manual.agent.post(`/api/orders/${manual.number}/cancel`).send({});
      expect(byAdmin.status).toBe(409);
      expect((await orderRow(manual.number)).status).toBe("Dispatched");
    });

    it("cannot cancel twice, and a repeated cancel never refunds or restores twice", async () => {
      const m = await register();
      await grant(m, 50);
      const { number } = await buy({ books: [["b", 1]], points: 20, member: m });
      const results = await Promise.all([1, 2, 3].map(() => m.agent.post(`/api/orders/${number}/cancel`).send({})));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      expect(await balance(m)).toBe(50);
      expect((await db.sql("SELECT count(*)::int AS n FROM refunds WHERE order_id = (SELECT id FROM orders WHERE order_number = $1)", [number])).rows[0].n).toBe(1);
    });

    it("keeps a refund PENDING when the gateway fails, and completes it later without refunding twice (FR-077, FR-080)", async () => {
      const original = gateway.getGateway();
      const m = await buy({ books: [["b", 1]] });
      gateway.setGateway({ authorize: original.authorize.bind(original), refund: async () => { throw new Error("gateway down"); } });
      const res = await m.agent.post(`/api/orders/${m.number}/cancel`).send({});
      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe("Cancelled");
      expect(res.body.order.refunds[0].status).toBe("PENDING");
      expect(JSON.stringify(res.body)).not.toMatch(/gateway down/);

      gateway.setGateway(original);
      const { retryPendingRefunds } = await import("../../src/modules/payment/payment.refunds.js");
      await retryPendingRefunds();
      await retryPendingRefunds();
      const refunds = (await detail(m, m.number)).refunds;
      expect(refunds).toHaveLength(1);
      expect(refunds[0].status).toBe("COMPLETED");
    });

    it("needs no money refund for an unpaid Cash on Delivery order, and gives back stock and points", async () => {
      const m = await register();
      await grant(m, 40);
      const stockBefore = await stockOf("a");
      const { number } = await buy({ books: [["a", 1]], method: "COD", points: 10, member: m });
      const res = await m.agent.post(`/api/orders/${number}/cancel`).send({});
      expect(res.status).toBe(200);
      expect(res.body.order.refunds[0]).toMatchObject({ status: "NOT_REQUIRED", amount: 0 });
      expect(res.body.order.payment.statusLabel).toMatch(/Cancelled/);
      expect(await stockOf("a")).toBe(stockBefore);
      expect(await balance(m)).toBe(40);
    });

    it("cannot cancel an order that is still unpaid", async () => {
      const m = await register();
      await m.agent.post("/api/cart/items").send({ bookId: ids.a, quantity: 1 }).expect(200);
      const addressId = await addAddress(m);
      const number = (await m.agent.post("/api/checkout/order").send({ addressId }).expect(201)).body.order.orderNumber;
      const res = await m.agent.post(`/api/orders/${number}/cancel`).send({});
      expect(res.status).toBe(409);
    });
  });

  describe("shipments (FR-057, FR-059, FR-059a, SC-018)", () => {
    it("creates a shipment on confirmation and advances it on timers, recording every change", async () => {
      const m = await buy();
      expect((await db.sql("SELECT count(*)::int AS n FROM shipments WHERE order_id = (SELECT id FROM orders WHERE order_number = $1)", [m.number])).rows[0].n).toBe(1);

      await ageOrder(m.number, 3 / 60); // 3 minutes
      let o = await detail(m, m.number);
      expect(o.status).toBe("Dispatched");
      expect(o.shipment.status).toBe("Dispatched");
      expect(o.shipment.trackingRef).toMatch(/^BWT/);
      expect(o.shipment.confirmedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(o.estimatedDelivery).toBeNull();
      expect(o.confirmedDelivery).toBe(o.shipment.confirmedDate);

      await ageOrder(m.number, 8 / 60); // now 11 minutes in total
      o = await detail(m, m.number);
      expect(o.status).toBe("Delivered");
      expect(o.shipment.events.map((e) => e.status)).toEqual(["Preparing", "Dispatched", "In Transit", "Delivered"]);
      expect(o.shipment.events.every((e) => e.by === "System")).toBe(true);
      expect(o.deliveredAt).not.toBeNull();
    });

    it("lets only an admin override the status, and only forward (FR-059a)", async () => {
      const admin = await register("ADMIN");
      const member = await buy();
      expect((await override(member, member.number, "Delivered")).status).toBe(403);
      expect((await request(app).post(`/api/admin/orders/${member.number}/shipment`).send({ status: "Delivered" })).status).toBe(401);
      expect((await orderRow(member.number)).status).toBe("Confirmed");

      const ok = await override(admin, member.number, "In Transit");
      expect(ok.status).toBe(200);
      expect(ok.body.shipment.status).toBe("In Transit");
      expect(ok.body.shipment.events.map((e) => `${e.status}:${e.by}`)).toEqual(["Preparing:System", "Dispatched:Admin", "In Transit:Admin"]);

      const back = await override(admin, member.number, "Preparing");
      expect(back.status).toBe(409);
      expect(back.body.error.code).toBe("INVALID_TRANSITION");
      expect((await override(admin, member.number, "In Transit")).status).toBe(409);
      expect((await override(admin, member.number, "Teleported")).status).toBe(400);

      await override(admin, member.number, "Delivered").expect(200);
      const afterDelivery = await override(admin, member.number, "Dispatched");
      expect(afterDelivery.status).toBe(409);
      expect((await orderRow(member.number)).status).toBe("Delivered");
    });

    it("never dispatches a cancelled order", async () => {
      const admin = await register("ADMIN");
      const m = await buy();
      await m.agent.post(`/api/orders/${m.number}/cancel`).send({}).expect(200);
      const res = await override(admin, m.number, "Dispatched");
      expect(res.status).toBe(409);
      expect((await orderRow(m.number)).status).toBe("Cancelled");
    });

    it("treats an eBook-only order as delivered once payment is confirmed, with no shipment", async () => {
      const m = await buy({ books: [["ebook", 1]] });
      const o = await detail(m, m.number);
      expect(o.status).toBe("Delivered");
      expect(o.shipment).toBeNull();
      expect(o.actions.cancel.allowed).toBe(false);
      expect(o.actions.return.allowed).toBe(false);
      expect(o.actions.return.reason).toMatch(/eBooks cannot be returned/);
    });
  });

  describe("gift points on delivery (FR-078, SC-019)", () => {
    it("earns points once when the order is delivered, with a ledger entry", async () => {
      const admin = await register("ADMIN");
      const m = await buy({ books: [["b", 1]] }); // total 340, goods 300, 10% => 30 points
      expect(await balance(m)).toBe(0);
      await override(admin, m.number, "Delivered").expect(200);
      expect(await balance(m)).toBe(30);
      const entry = (await m.agent.get("/api/gift-points")).body.history[0];
      expect(entry).toMatchObject({ type: "EARN", points: 30, balanceAfter: 30, orderNumber: m.number });
      await detail(m, m.number);
      await detail(m, m.number);
      expect(await balance(m)).toBe(30);
    });

    it("keeps the balance equal to the ledger sum through earn, redeem, cancel and return", async () => {
      const admin = await register("ADMIN");
      const m = await register();
      await grant(m, 100);
      const first = await buy({ books: [["b", 1]], points: 60, member: m }); // base 300, redeem 60
      await override(admin, first.number, "Delivered").expect(200);
      await m.agent.post(`/api/orders/${first.number}/return`).send({}).expect(200);
      await override(admin, first.number, "Received", "return").expect(200);
      const sum = (await db.sql("SELECT sum(points)::int AS s, min(balance_after)::int AS lowest FROM gift_point_ledger WHERE member_id = $1", [m.id])).rows[0];
      expect(sum.s).toBe(await balance(m));
      expect(sum.lowest).toBeGreaterThanOrEqual(0);
    });
  });

  describe("returns (FR-058, FR-067)", () => {
    async function delivered(over = {}) {
      const admin = await register("ADMIN");
      const m = await buy(over);
      await override(admin, m.number, "Delivered").expect(200);
      return { ...m, admin };
    }

    it("creates a return shipment for a delivered physical order and refunds only after the books are received", async () => {
      const m = await delivered({ books: [["b", 1]] });
      const stockBefore = await stockOf("b");
      const res = await m.agent.post(`/api/orders/${m.number}/return`).send({});
      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe("Return Requested");
      expect(res.body.order.returnShipment).toMatchObject({ status: "Requested" });
      expect(res.body.order.returnShipment.trackingRef).toMatch(/^BWR/);
      expect(res.body.order.refunds).toEqual([]);

      await ageReturn(m.number, 3);
      expect((await detail(m, m.number)).returnShipment.status).toBe("Picked Up");
      expect((await detail(m, m.number)).refunds).toEqual([]);

      await ageReturn(m.number, 5);
      const done = await detail(m, m.number);
      expect(done.status).toBe("Returned");
      expect(done.returnShipment.status).toBe("Received");
      expect(done.refunds).toHaveLength(1);
      expect(done.refunds[0]).toMatchObject({ reason: "RETURN", status: "COMPLETED", amount: 340 });
      expect(done.payment.statusLabel).toBe("Refunded");
      // Inventory rules are pending: a returned book does not change stock automatically.
      expect(await stockOf("b")).toBe(stockBefore);
    });

    it("declines a second return, an eBook return, a return after the window and a return before delivery", async () => {
      const m = await delivered();
      await m.agent.post(`/api/orders/${m.number}/return`).send({}).expect(200);
      expect((await m.agent.post(`/api/orders/${m.number}/return`).send({})).status).toBe(409);

      const late = await delivered();
      await ageDelivery(late.number, 8);
      const lateRes = await late.agent.post(`/api/orders/${late.number}/return`).send({});
      expect(lateRes.status).toBe(409);
      expect(lateRes.body.error.message).toMatch(/7-day return window has passed/);

      const ebook = await buy({ books: [["ebook", 1]] });
      expect((await ebook.agent.post(`/api/orders/${ebook.number}/return`).send({})).status).toBe(409);

      const early = await buy();
      const earlyRes = await early.agent.post(`/api/orders/${early.number}/return`).send({});
      expect(earlyRes.status).toBe(409);
      expect(earlyRes.body.error.message).toMatch(/Only delivered orders/);
    });

    it("refunds only the physical books of a mixed order, proportionally, and restores a share of the points", async () => {
      const admin = await register("ADMIN");
      const m = await register();
      await grant(m, 100);
      // Cannot pay COD for a mixed cart, so use CARD. subtotal 180 (a 100 + ebook 80), shipping 40 on physical 100, points 18.
      const { number } = await buy({ books: [["a", 1], ["ebook", 1]], points: 18, member: m });
      const before = await orderRow(number);
      await override(admin, number, "Delivered").expect(200);
      await m.agent.post(`/api/orders/${number}/return`).send({}).expect(200);
      await override(admin, number, "Received", "return").expect(200);
      const done = await detail(m, number);
      expect(done.status).toBe("Returned");
      const goods = Number(before.total) - Number(before.shipping_charge);
      expect(done.refunds[0].amount).toBeCloseTo((goods * 100) / 180, 1);
      expect(done.refunds[0].amount).toBeLessThan(Number(before.total));
    });

    it("refunds a returned Cash on Delivery order only because the cash was collected on delivery", async () => {
      const admin = await register("ADMIN");
      const m = await buy({ books: [["a", 1]], method: "COD" });
      await override(admin, m.number, "Delivered").expect(200);
      expect((await detail(m, m.number)).payment.statusLabel).toBe("Paid");
      await m.agent.post(`/api/orders/${m.number}/return`).send({}).expect(200);
      await override(admin, m.number, "Received", "return").expect(200);
      const done = await detail(m, m.number);
      expect(done.refunds[0]).toMatchObject({ reason: "RETURN", status: "COMPLETED", amount: 140 });
    });
  });

  describe("Cash on Delivery payment status (FR-072a)", () => {
    it("shows Pay on Delivery - Pending until delivery, then Paid", async () => {
      const admin = await register("ADMIN");
      const m = await buy({ books: [["a", 1]], method: "COD" });
      expect((await detail(m, m.number)).payment).toMatchObject({ status: "PAY_ON_DELIVERY_PENDING", statusLabel: "Pay on Delivery - Pending" });
      await override(admin, m.number, "Delivered").expect(200);
      expect((await detail(m, m.number)).payment).toMatchObject({ status: "PAID", statusLabel: "Paid" });
    });
  });

  describe("Buy Again (FR-068)", () => {
    it("adds available books at today's price and lists the ones that cannot be added", async () => {
      await addBook("gone", { price: 50 });
      const m = await buy({ books: [["a", 2], ["gone", 1]] });
      await db.sql("UPDATE books SET price = 120 WHERE id = $1", [ids.a]);
      await db.sql("UPDATE books SET is_active = FALSE WHERE id = $1", [ids.gone]);

      const res = await m.agent.post(`/api/orders/${m.number}/buy-again`).send({});
      expect(res.status).toBe(200);
      expect(res.body.added).toEqual(["Book a"]);
      expect(res.body.unavailable).toEqual(["Book gone"]);
      expect(res.body.message).toMatch(/Not available right now: Book gone/);
      expect(res.body.cart.items).toHaveLength(1);
      expect(res.body.cart.items[0]).toMatchObject({ title: "Book a", quantity: 2, unitPrice: 120 });
      await db.sql("UPDATE books SET price = 100 WHERE id = $1", [ids.a]);
    });

    it("limits the quantity to stock and reports out-of-stock books", async () => {
      await addBook("scarce", { price: 70, stock: 5 });
      await addBook("empty", { price: 70, stock: 5 });
      const m = await buy({ books: [["scarce", 4], ["empty", 1]] });
      await db.sql("UPDATE books SET stock_quantity = 1 WHERE id = $1", [ids.scarce]);
      await db.sql("UPDATE books SET stock_quantity = 0 WHERE id = $1", [ids.empty]);
      const res = await m.agent.post(`/api/orders/${m.number}/buy-again`).send({});
      expect(res.body.unavailable).toEqual(["Book empty"]);
      expect(res.body.cart.items[0]).toMatchObject({ title: "Book scarce", quantity: 1 });
      expect(res.body.notes.join(" ")).toMatch(/Only 1 copy/);
    });
  });

  describe("safety", () => {
    it("never exposes card data, gateway errors or other members' data in order responses", async () => {
      const m = await buy();
      const body = JSON.stringify(await detail(m, m.number));
      expect(body).not.toMatch(/cardNumber|cvv|idempotency|memberId|stockHeld/i);
    });

    it("a failing order never stops the others in a background sweep", async () => {
      const a = await buy();
      const b = await buy();
      await ageOrder(a.number, 11 / 60);
      await ageOrder(b.number, 11 / 60);
      await lifecycle.syncOrders([999999, (await orderRow(a.number)).id, (await orderRow(b.number)).id]);
      expect((await orderRow(a.number)).status).toBe("Delivered");
      expect((await orderRow(b.number)).status).toBe("Delivered");
    });
  });
});
