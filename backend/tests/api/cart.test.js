import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestSchema, hasDb } from "../helpers/testDb.js";

const password = "Sup3rSecret";

describe.skipIf(!hasDb())("cart API (temporary schema)", () => {
  let db;
  let app;
  let closePool;
  const ids = {};

  const addBook = async (key, { price = 100, stock = 5, active = true, format = "Paperback" } = {}) => {
    const { rows } = await db.sql(
      `INSERT INTO books (isbn, title, short_description, description, cover_url, price, format, language, publication_date, is_active, stock_quantity)
       VALUES ($1, $2, 's', 'd', '/covers/fallback.svg', $3, $4, 'English', '2020-01-01', $5, $6) RETURNING id::int AS id`,
      [`isbn-${key}`, `Book ${key}`, price, format, active, stock],
    );
    ids[key] = rows[0].id;
  };

  const guestCartCount = async () =>
    (await db.sql("SELECT count(*)::int AS n FROM carts WHERE guest_token_hash IS NOT NULL")).rows[0].n;

  /** A supertest agent keeps cookies, like a browser. */
  const visitor = () => request.agent(app);

  const register = async (agent, n) => {
    const body = {
      name: "Cart Reader",
      email: `cart${n}@example.com`,
      mobile: `98765432${String(n).padStart(2, "0")}`,
      password,
      confirmPassword: password,
    };
    await agent.post("/api/members/register").send(body).expect(201);
    return body;
  };
  const signIn = (agent, body) => agent.post("/api/members/login").send({ identifier: body.email, password });

  beforeAll(async () => {
    db = await createTestSchema();
    await addBook("a", { price: 100, stock: 5 });
    await addBook("b", { price: 250.5, stock: 3 });
    await addBook("soldout", { stock: 0 });
    await addBook("inactive", { stock: 4, active: false });
    await addBook("ebook", { price: 50, stock: 10, format: "eBook" });
    await db.sql("INSERT INTO app_config (key, value) VALUES ('estimated_delivery_days', '5')");

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

  it("shows an empty cart to a visitor who has not added anything, without issuing a cookie", async () => {
    const res = await request(app).get("/api/cart");
    expect(res.status).toBe(200);
    expect(res.body.cart).toMatchObject({ items: [], itemCount: 0, subtotal: 0 });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("lets a guest add a book, keeps it across requests, and stores only a hash of the token", async () => {
    const guest = visitor();
    const add = await guest.post("/api/cart/items").send({ bookId: ids.a, quantity: 2 });
    expect(add.status).toBe(200);
    const cookie = add.headers["set-cookie"].join(";");
    expect(cookie).toMatch(/cart_token=/);
    expect(cookie).toMatch(/HttpOnly/i);

    const view = await guest.get("/api/cart");
    expect(view.body.cart.items).toHaveLength(1);
    expect(view.body.cart).toMatchObject({ itemCount: 2, subtotal: 200 });

    const token = /cart_token=([^;]+)/.exec(cookie)[1];
    const { rows } = await db.sql("SELECT guest_token_hash FROM carts WHERE guest_token_hash IS NOT NULL");
    expect(rows.some((r) => r.guest_token_hash === token)).toBe(false);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.guest_token_hash))).toBe(true);
  });

  it("adds to an existing line instead of duplicating it", async () => {
    const guest = visitor();
    await guest.post("/api/cart/items").send({ bookId: ids.a, quantity: 1 });
    const res = await guest.post("/api/cart/items").send({ bookId: ids.a, quantity: 2 });
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.items[0].quantity).toBe(3);
  });

  it("limits a request for more copies than are available and says so (FR-050)", async () => {
    const guest = visitor();
    const res = await guest.post("/api/cart/items").send({ bookId: ids.b, quantity: 10 });
    expect(res.status).toBe(200);
    expect(res.body.cart.items[0].quantity).toBe(3);
    expect(res.body.message).toMatch(/Only 3 copies are available/);

    const more = await guest.post("/api/cart/items").send({ bookId: ids.b, quantity: 1 });
    expect(more.body.cart.items[0].quantity).toBe(3);
    expect(more.body.message).toBeDefined();
  });

  it("rejects out-of-stock, inactive and unknown books", async () => {
    const guest = visitor();
    const soldOut = await guest.post("/api/cart/items").send({ bookId: ids.soldout, quantity: 1 });
    expect(soldOut.status).toBe(409);
    expect(soldOut.body.error.code).toBe("OUT_OF_STOCK");
    expect((await guest.post("/api/cart/items").send({ bookId: ids.inactive, quantity: 1 })).status).toBe(404);
    expect((await guest.post("/api/cart/items").send({ bookId: 999999, quantity: 1 })).status).toBe(404);
    expect((await guest.get("/api/cart")).body.cart.items).toEqual([]);
  });

  it("validates input and returns field errors", async () => {
    const guest = visitor();
    for (const body of [
      {},
      { bookId: "abc", quantity: 1 },
      { bookId: ids.a, quantity: 0 },
      { bookId: ids.a, quantity: -2 },
      { bookId: ids.a, quantity: 1.5 },
      { bookId: ids.a, quantity: 1000 },
    ]) {
      const res = await guest.post("/api/cart/items").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(Object.keys(res.body.error.fields).length).toBeGreaterThan(0);
    }
  });

  it("updates a quantity, limits it to stock, and removes a line", async () => {
    const guest = visitor();
    await guest.post("/api/cart/items").send({ bookId: ids.a, quantity: 1 });

    const up = await guest.patch(`/api/cart/items/${ids.a}`).send({ quantity: 4 });
    expect(up.status).toBe(200);
    expect(up.body.cart.items[0].quantity).toBe(4);
    expect(up.body.cart.subtotal).toBe(400);

    const capped = await guest.patch(`/api/cart/items/${ids.a}`).send({ quantity: 50 });
    expect(capped.body.cart.items[0].quantity).toBe(5);
    expect(capped.body.message).toBeDefined();

    expect((await guest.patch(`/api/cart/items/${ids.a}`).send({ quantity: 0 })).status).toBe(400);
    expect((await guest.patch(`/api/cart/items/${ids.b}`).send({ quantity: 1 })).status).toBe(404);

    const removed = await guest.delete(`/api/cart/items/${ids.a}`);
    expect(removed.status).toBe(200);
    expect(removed.body.cart.items).toEqual([]);
    expect((await guest.delete(`/api/cart/items/${ids.a}`)).status).toBe(200);
  });

  it("recomputes prices on the server and warns when a price changed (FR-049)", async () => {
    await addBook("price", { price: 100, stock: 9 });
    const guest = visitor();
    // A client cannot choose the price: extra fields are ignored.
    await guest.post("/api/cart/items").send({ bookId: ids.price, quantity: 2, price: 1 });
    const first = await guest.get("/api/cart");
    expect(first.body.cart.items[0].unitPrice).toBe(100);
    expect(first.body.cart.items[0].priceChanged).toBe(false);

    await db.sql("UPDATE books SET price = 120.25 WHERE id = $1", [ids.price]);
    const second = await guest.get("/api/cart");
    const line = second.body.cart.items[0];
    expect(line).toMatchObject({ unitPrice: 120.25, previousPrice: 100, priceChanged: true });
    expect(line.warnings.join(" ")).toMatch(/price changed/i);
    expect(second.body.cart).toMatchObject({ subtotal: 240.5, hasWarnings: true });
  });

  it("reports unavailable and reduced items when stock changes after adding (FR-049, FR-050)", async () => {
    await addBook("stock", { price: 10, stock: 6 });
    await addBook("gone", { price: 10, stock: 6 });
    const guest = visitor();
    await guest.post("/api/cart/items").send({ bookId: ids.stock, quantity: 5 });
    await guest.post("/api/cart/items").send({ bookId: ids.gone, quantity: 1 });

    await db.sql("UPDATE books SET stock_quantity = 2 WHERE id = $1", [ids.stock]);
    await db.sql("UPDATE books SET is_active = false WHERE id = $1", [ids.gone]);
    const { body } = await guest.get("/api/cart");
    const reduced = body.cart.items.find((i) => i.bookId === ids.stock);
    const gone = body.cart.items.find((i) => i.bookId === ids.gone);
    expect(reduced).toMatchObject({ quantity: 2, available: true });
    expect(reduced.warnings.join(" ")).toMatch(/Only 2 copies/);
    expect(gone).toMatchObject({ available: false, quantity: 0 });
    expect(body.cart.subtotal).toBe(20);
    expect(body.cart.itemCount).toBe(2);
  });

  it("gives an estimated delivery date for physical books only", async () => {
    const guest = visitor();
    await guest.post("/api/cart/items").send({ bookId: ids.ebook, quantity: 1 });
    expect((await guest.get("/api/cart")).body.cart.estimatedDelivery).toBeNull();
    await guest.post("/api/cart/items").send({ bookId: ids.a, quantity: 1 });
    expect((await guest.get("/api/cart")).body.cart.estimatedDelivery).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("merges the guest cart into the member's cart on sign-in without losing items (FR-051)", async () => {
    const agent = visitor();
    const member = await register(agent, 11);
    // The member already has 2 copies of book A from an earlier visit.
    await signIn(agent, member).expect(200);
    await agent.post("/api/cart/items").send({ bookId: ids.a, quantity: 2 });
    await agent.post("/api/members/logout").expect(204);

    // Signed out, the same browser is a guest: add A again plus B.
    await agent.post("/api/cart/items").send({ bookId: ids.a, quantity: 2 });
    await agent.post("/api/cart/items").send({ bookId: ids.b, quantity: 1 });
    const guestCarts = await guestCartCount();

    const login = await signIn(agent, member);
    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"].join(";")).toMatch(/cart_token=;/);
    expect(await guestCartCount()).toBe(guestCarts - 1);

    const { body } = await agent.get("/api/cart");
    const byBook = Object.fromEntries(body.cart.items.map((i) => [i.bookId, i.quantity]));
    expect(byBook).toEqual({ [ids.a]: 4, [ids.b]: 1 });
  });

  it("limits merged quantities to stock", async () => {
    const agent = visitor();
    const member = await register(agent, 12);
    await signIn(agent, member).expect(200);
    await agent.post("/api/cart/items").send({ bookId: ids.b, quantity: 2 });
    await agent.post("/api/members/logout").expect(204);
    await agent.post("/api/cart/items").send({ bookId: ids.b, quantity: 3 });
    await signIn(agent, member).expect(200);
    const { body } = await agent.get("/api/cart");
    expect(body.cart.items[0].quantity).toBe(3);
  });

  it("keeps a member's cart across sessions and keeps carts separate", async () => {
    const one = visitor();
    const memberOne = await register(one, 13);
    await signIn(one, memberOne).expect(200);
    await one.post("/api/cart/items").send({ bookId: ids.a, quantity: 1 });

    const again = visitor();
    await signIn(again, memberOne).expect(200);
    expect((await again.get("/api/cart")).body.cart.itemCount).toBe(1);

    const two = visitor();
    const memberTwo = await register(two, 14);
    await signIn(two, memberTwo).expect(200);
    expect((await two.get("/api/cart")).body.cart.items).toEqual([]);

    // A guest never sees a member's cart.
    expect((await request(app).get("/api/cart")).body.cart.items).toEqual([]);
  });

  it("ignores a forged or malformed guest token", async () => {
    for (const token of ["x", "A".repeat(43), "../../etc/passwd"]) {
      const res = await request(app).get("/api/cart").set("Cookie", `cart_token=${encodeURIComponent(token)}`);
      expect(res.status).toBe(200);
      expect(res.body.cart.items).toEqual([]);
    }
  });

  it("does not leak internal details in errors", async () => {
    const res = await request(app).post("/api/cart/items").send({ bookId: ids.soldout, quantity: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|select |sql/i);
  });

  describe("inactive books (T078, T079)", () => {
    it("returns 404 when adding an inactive or unknown book, and leaves no line or cart behind", async () => {
      const guest = visitor();
      const inactive = await guest.post("/api/cart/items").send({ bookId: ids.inactive, quantity: 1 });
      expect(inactive.status).toBe(404);
      expect(inactive.body.error.code).toBe("NOT_FOUND");
      expect((await guest.post("/api/cart/items").send({ bookId: 999999, quantity: 1 })).status).toBe(404);
      expect((await guest.get("/api/cart")).body.cart.items).toEqual([]);
    });

    it("returns 404 when updating the quantity of a book that became inactive, and keeps the stored quantity", async () => {
      await addBook("deact-update", { price: 20, stock: 8 });
      const guest = visitor();
      await guest.post("/api/cart/items").send({ bookId: ids["deact-update"], quantity: 2 });
      await db.sql("UPDATE books SET is_active = false WHERE id = $1", [ids["deact-update"]]);

      const res = await guest.patch(`/api/cart/items/${ids["deact-update"]}`).send({ quantity: 5 });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      const { rows } = await db.sql("SELECT quantity FROM cart_items WHERE book_id = $1", [ids["deact-update"]]);
      expect(rows.map((r) => r.quantity)).toEqual([2]);
    });

    it("still lets the visitor remove an inactive book from the cart", async () => {
      await addBook("deact-remove", { price: 20, stock: 8 });
      const guest = visitor();
      await guest.post("/api/cart/items").send({ bookId: ids["deact-remove"], quantity: 1 });
      await db.sql("UPDATE books SET is_active = false WHERE id = $1", [ids["deact-remove"]]);
      const res = await guest.delete(`/api/cart/items/${ids["deact-remove"]}`);
      expect(res.status).toBe(200);
      expect(res.body.cart.items).toEqual([]);
    });

    it("revalidates on retrieval: an inactive book is unavailable, excluded from totals and flagged, for guests and members", async () => {
      await addBook("deact-view", { price: 30, stock: 8 });
      await addBook("still-active", { price: 10, stock: 8 });

      const check = async (agent) => {
        await agent.post("/api/cart/items").send({ bookId: ids["deact-view"], quantity: 2 });
        await agent.post("/api/cart/items").send({ bookId: ids["still-active"], quantity: 3 });
        const before = (await agent.get("/api/cart")).body.cart;
        expect(before).toMatchObject({ itemCount: 5, subtotal: 90, hasWarnings: false });

        await db.sql("UPDATE books SET is_active = false WHERE id = $1", [ids["deact-view"]]);
        const after = (await agent.get("/api/cart")).body.cart;
        const gone = after.items.find((i) => i.bookId === ids["deact-view"]);
        const live = after.items.find((i) => i.bookId === ids["still-active"]);
        expect(gone).toMatchObject({ available: false, quantity: 0, maxQuantity: 0, lineTotal: 0 });
        expect(gone.warnings.join(" ")).toMatch(/no longer available/i);
        expect(live).toMatchObject({ available: true, quantity: 3, lineTotal: 30 });
        expect(after).toMatchObject({ itemCount: 3, subtotal: 30, hasWarnings: true });

        // Reactivate so the next visitor starts from the same state.
        await db.sql("UPDATE books SET is_active = true WHERE id = $1", [ids["deact-view"]]);
        await agent.delete(`/api/cart/items/${ids["deact-view"]}`);
        await agent.delete(`/api/cart/items/${ids["still-active"]}`);
      };

      await check(visitor());
      const member = visitor();
      await signIn(member, await register(member, 21)).expect(200);
      await check(member);
    });

    it("does not carry an inactive book into the member cart on sign-in", async () => {
      await addBook("deact-merge", { price: 15, stock: 8 });
      const agent = visitor();
      const member = await register(agent, 22);
      await agent.post("/api/cart/items").send({ bookId: ids["deact-merge"], quantity: 1 });
      await agent.post("/api/cart/items").send({ bookId: ids.a, quantity: 1 });
      await db.sql("UPDATE books SET is_active = false WHERE id = $1", [ids["deact-merge"]]);
      await signIn(agent, member).expect(200);
      const { body } = await agent.get("/api/cart");
      expect(body.cart.items.map((i) => i.bookId)).toEqual([ids.a]);
    });

    it("keeps active in-stock books working and still returns 409 for out-of-stock books", async () => {
      const guest = visitor();
      const add = await guest.post("/api/cart/items").send({ bookId: ids.a, quantity: 2 });
      expect(add.status).toBe(200);
      const upd = await guest.patch(`/api/cart/items/${ids.a}`).send({ quantity: 3 });
      expect(upd.status).toBe(200);
      expect(upd.body.cart.items[0]).toMatchObject({ quantity: 3, available: true });

      const soldOutAdd = await guest.post("/api/cart/items").send({ bookId: ids.soldout, quantity: 1 });
      expect(soldOutAdd.status).toBe(409);
      expect(soldOutAdd.body.error.code).toBe("OUT_OF_STOCK");

      // An active book whose stock drops to 0 after adding: update is 409, not 404.
      await addBook("sell-out", { price: 12, stock: 4 });
      await guest.post("/api/cart/items").send({ bookId: ids["sell-out"], quantity: 1 });
      await db.sql("UPDATE books SET stock_quantity = 0 WHERE id = $1", [ids["sell-out"]]);
      const soldOutUpdate = await guest.patch(`/api/cart/items/${ids["sell-out"]}`).send({ quantity: 2 });
      expect(soldOutUpdate.status).toBe(409);
      expect(soldOutUpdate.body.error.code).toBe("OUT_OF_STOCK");
    });
  });
});
