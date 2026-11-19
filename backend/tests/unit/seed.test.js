import "dotenv/config";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDown, migrateUp } from "../../db/migrate.js";
import { seed } from "../../db/seed.js";
import { CATEGORY_NAMES } from "../../db/seed-data.js";

const url = process.env.DATABASE_URL;
const hasDb = Boolean(url) && !url.includes("DB_USER") && !url.includes("DB_PASSWORD");

// Runs inside a throw-away schema so the real tables and data are never touched.
describe.skipIf(!hasDb)("migrations and seed (temporary schema)", () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let client;

  const count = async (table) =>
    Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await migrateUp(client);
    await seed(client, { bcryptRounds: 4 });
  }, 60000);

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  });

  it("creates exactly the 19 stored genres in the FR-021 order, without duplicates", async () => {
    const { rows } = await client.query("SELECT name FROM categories ORDER BY sort_order");
    expect(rows.map((r) => r.name)).toEqual(CATEGORY_NAMES);
    expect(new Set(rows.map((r) => r.name)).size).toBe(rows.length);
    expect(rows.map((r) => r.name)).not.toContain("All");
    // 19 stored + the UI-only "All" option = the 20 options in FR-021.
    expect(rows.length + 1).toBe(20);
  });

  it("gives every category at least one active book (SC-005)", async () => {
    const { rows } = await client.query(
      `SELECT c.name FROM categories c
       WHERE NOT EXISTS (
         SELECT 1 FROM book_categories bc JOIN books b ON b.id = bc.book_id
         WHERE bc.category_id = c.id AND b.is_active)`,
    );
    expect(rows).toEqual([]);
  });

  it("seeds 200+ books with some in multiple genres and a few inactive", async () => {
    expect(await count("books")).toBeGreaterThanOrEqual(200);
    const multi = await client.query(
      "SELECT 1 FROM book_categories GROUP BY book_id HAVING count(*) > 1",
    );
    expect(multi.rowCount).toBeGreaterThan(0);
    const inactive = await client.query("SELECT 1 FROM books WHERE NOT is_active");
    expect(inactive.rowCount).toBeGreaterThan(0);
  });

  it("enforces the data-model constraints", async () => {
    await expect(
      client.query("UPDATE books SET price = -1 WHERE id = (SELECT min(id) FROM books)"),
    ).rejects.toThrow();
    await expect(
      client.query("UPDATE books SET format = 'Audio' WHERE id = (SELECT min(id) FROM books)"),
    ).rejects.toThrow();
    await expect(
      client.query(
        "INSERT INTO members (name, email, mobile, password_hash) VALUES ('X','Upper@Example.com','9111111111','h')",
      ),
    ).rejects.toThrow();
    await expect(
      client.query(
        "INSERT INTO members (name, email, mobile, password_hash) VALUES ('X','x@example.com','12345','h')",
      ),
    ).rejects.toThrow();
  });

  it("is idempotent: running the seed again changes no counts (SC-012)", async () => {
    const tables = [
      "categories", "authors", "publishers", "books", "book_categories", "book_authors",
      "members", "orders", "order_lines", "app_config", "stores", "shipping_zones", "coupons", "gift_point_ledger",
      "wishlist_items", "followed_authors",
    ];
    const before = {};
    for (const t of tables) before[t] = await count(t);
    const second = await seed(client, { bcryptRounds: 4 });
    for (const t of tables) expect(await count(t)).toBe(before[t]);
    expect(second.newCredentials).toEqual([]);
  }, 60000);

  it("seeds the wishlist size limit but no wishlist or followed-writer rows (Phase 7.5)", async () => {
    expect(await count("wishlist_items")).toBe(0);
    expect(await count("followed_authors")).toBe(0);
    const { rows } = await client.query("SELECT value FROM app_config WHERE key = 'wishlist_max_items'");
    expect(rows).toEqual([{ value: "200" }]);
  });

  it("enforces one wishlist row and one follow per member, and removes them with the member (T085)", async () => {
    const m = (
      await client.query(
        "INSERT INTO members (name, email, mobile, password_hash) VALUES ('W','wl-schema@example.com','9222222222','h') RETURNING id",
      )
    ).rows[0].id;
    const book = (await client.query("SELECT id FROM books ORDER BY id LIMIT 1")).rows[0].id;
    const author = (await client.query("SELECT id FROM authors ORDER BY id LIMIT 1")).rows[0].id;

    await client.query("INSERT INTO wishlist_items (member_id, book_id) VALUES ($1, $2)", [m, book]);
    await expect(client.query("INSERT INTO wishlist_items (member_id, book_id) VALUES ($1, $2)", [m, book])).rejects.toThrow();
    await expect(client.query("INSERT INTO wishlist_items (member_id, book_id) VALUES ($1, 999999999)", [m])).rejects.toThrow();
    await client.query("INSERT INTO followed_authors (member_id, author_id) VALUES ($1, $2)", [m, author]);
    await expect(client.query("INSERT INTO followed_authors (member_id, author_id) VALUES ($1, $2)", [m, author])).rejects.toThrow();
    await expect(client.query("INSERT INTO followed_authors (member_id, author_id) VALUES ($1, 999999999)", [m])).rejects.toThrow();

    await client.query("DELETE FROM members WHERE id = $1", [m]);
    expect(await count("wishlist_items")).toBe(0);
    expect(await count("followed_authors")).toBe(0);
  });

  it("rolls the two Phase 7.5 migrations back on their own and re-applies them (T083, T084)", async () => {
    const exists = async (table) =>
      (await client.query("SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2", [schema, table])).rowCount === 1;
    const authorsBefore = await count("authors");
    expect(await migrateDown(client, 2)).toEqual(["007_followed_writers", "006_wishlist"]);
    expect(await exists("wishlist_items")).toBe(false);
    expect(await exists("followed_authors")).toBe(false);
    // Earlier tables and data are untouched by the rollback.
    expect(await exists("orders")).toBe(true);
    expect(await count("authors")).toBe(authorsBefore);
    expect(await migrateUp(client)).toEqual(["006_wishlist", "007_followed_writers"]);
    expect(await exists("wishlist_items")).toBe(true);
    expect(await exists("followed_authors")).toBe(true);
  });

  it("rolls the whole chain back (fulfilment, checkout, cart, pending-admin) and re-applies it cleanly", async () => {
    // Remove seeded rows depending on 002 placeholders first (down only drops the objects).
    const rolled = await migrateDown(client, 6);
    expect(rolled).toEqual(["007_followed_writers", "006_wishlist", "005_fulfilment", "004_checkout", "003_cart", "002_pending_admin_placeholders"]);
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'books' AND column_name = 'stock_quantity'`,
      [schema],
    );
    expect(cols.rowCount).toBe(0);
    expect(await migrateUp(client)).toEqual([
      "002_pending_admin_placeholders", "003_cart", "004_checkout", "005_fulfilment", "006_wishlist", "007_followed_writers",
    ]);
  });
});