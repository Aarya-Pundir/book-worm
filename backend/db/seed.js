import "dotenv/config";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import bcrypt from "bcrypt";
import pg from "pg";
import {
  APP_CONFIG,
  AUTHORS,
  BOOKS,
  CATEGORY_NAMES,
  COUPONS,
  PUBLISHERS,
  SAMPLE_ADMIN,
  SAMPLE_MEMBERS,
  SAMPLE_ORDER_COUNT,
  SHIPPING_ZONES,
  STORE_NAME,
  WELCOME_POINTS,
  slugify,
} from "./seed-data.js";
import { coverUrlFor } from "./covers.js";

/**
 * Idempotent seed (SC-012): every insert is an upsert or ON CONFLICT DO NOTHING,
 * so running it repeatedly creates no duplicates and keeps existing data.
 * Returns generated passwords for NEWLY created members only; callers print them to
 * the local console and must never write them to files or logs.
 */
export async function seed(client, { bcryptRounds = 12 } = {}) {
  const newCredentials = [];
  await client.query("BEGIN");
  try {
    // Categories: the 19 stored genres in the exact FR-021 order ("All" is UI-only).
    for (const [i, name] of CATEGORY_NAMES.entries()) {
      await client.query(
        `INSERT INTO categories (name, slug, sort_order) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET slug = EXCLUDED.slug, sort_order = EXCLUDED.sort_order`,
        [name, slugify(name), i + 1],
      );
    }

    for (const name of AUTHORS) {
      await client.query("INSERT INTO authors (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
    }
    // PENDING ADMIN APPROVAL: Brand vs Publisher naming. The table is `publishers`.
    for (const name of PUBLISHERS) {
      await client.query("INSERT INTO publishers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
    }

    for (const b of BOOKS) {
      const { rows } = await client.query(
        `INSERT INTO books
           (isbn, title, short_description, description, cover_url, price, format, language,
            publication_date, popularity_score, is_active, stock_quantity, publisher_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                 (SELECT id FROM publishers WHERE name = $13))
         ON CONFLICT (isbn) DO UPDATE SET
           title = EXCLUDED.title, short_description = EXCLUDED.short_description,
           description = EXCLUDED.description, cover_url = EXCLUDED.cover_url,
           price = EXCLUDED.price, format = EXCLUDED.format, language = EXCLUDED.language,
           publication_date = EXCLUDED.publication_date, popularity_score = EXCLUDED.popularity_score,
           is_active = EXCLUDED.is_active, stock_quantity = EXCLUDED.stock_quantity,
           publisher_id = EXCLUDED.publisher_id
         RETURNING id`,
        [
          b.isbn, b.title, b.shortDescription, b.description, coverUrlFor(b.isbn), b.price, b.format,
          b.language, b.publicationDate, b.popularityScore, b.isActive, b.stockQuantity, b.publisher,
        ],
      );
      const bookId = rows[0].id;
      for (const c of b.categories) {
        await client.query(
          `INSERT INTO book_categories (book_id, category_id)
           SELECT $1, id FROM categories WHERE name = $2 ON CONFLICT DO NOTHING`,
          [bookId, c],
        );
      }
      for (const a of b.authors) {
        await client.query(
          `INSERT INTO book_authors (book_id, author_id)
           SELECT $1, id FROM authors WHERE name = $2 ON CONFLICT DO NOTHING`,
          [bookId, a],
        );
      }
    }

    // PENDING ADMIN APPROVAL: store responsibilities (one provisional row).
    await client.query("INSERT INTO stores (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [STORE_NAME]);

    for (const [key, value] of Object.entries(APP_CONFIG)) {
      await client.query("INSERT INTO app_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [
        key,
        value,
      ]);
    }

    // Zones and sample coupons are configurable data. Existing rows are left untouched.
    for (const z of SHIPPING_ZONES) {
      await client.query(
        `INSERT INTO shipping_zones (pin_prefix, zone, delivery_days, charge) VALUES ($1,$2,$3,$4)
         ON CONFLICT (pin_prefix) DO NOTHING`,
        [z.pinPrefix, z.zone, z.deliveryDays, z.charge],
      );
    }
    for (const c of COUPONS) {
      await client.query(
        `INSERT INTO coupons (code, type, value, valid_from, valid_to, min_order, usage_limit, used_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (code) DO NOTHING`,
        [c.code, c.type, c.value, c.validFrom, c.validTo, c.minOrder, c.usageLimit, c.usedCount ?? 0],
      );
    }
    // Sample members. Existing members are left untouched (no password reset).
    const people = [
      ...SAMPLE_MEMBERS.map((m) => ({ ...m, role: "MEMBER" })),
      { ...SAMPLE_ADMIN, role: "ADMIN" }, // PENDING ADMIN APPROVAL: admin roles
    ];
    for (const p of people) {
      const password = randomBytes(12).toString("base64url");
      const hash = await bcrypt.hash(password, bcryptRounds);
      const { rowCount } = await client.query(
        `INSERT INTO members (name, email, mobile, password_hash, role) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING`,
        [p.name, p.email, p.mobile, hash, p.role],
      );
      if (rowCount === 1) newCredentials.push({ email: p.email, password });
    }

    // Sample orders (read side) for recommendation testing. Deterministic and idempotent.
    const { rows: bookRows } = await client.query("SELECT id, price FROM books WHERE is_active ORDER BY isbn");
    const { rows: memberRows } = await client.query(
      "SELECT id FROM members WHERE role = 'MEMBER' ORDER BY email",
    );
    for (let i = 0; i < SAMPLE_ORDER_COUNT && memberRows.length > 0; i += 1) {
      const orderNumber = `BW-SEED-${String(i + 1).padStart(4, "0")}`;
      const picks = [0, 1, 2].map((k) => bookRows[(i * 17 + k * 5) % bookRows.length]);
      const total = picks.reduce((s, b) => s + Number(b.price), 0);
      const { rows } = await client.query(
        `INSERT INTO orders (order_number, member_id, status, total, confirmed_at, delivered_at) VALUES ($1,$2,'Delivered',$3, now(), now())
         ON CONFLICT (order_number) DO NOTHING RETURNING id`,
        [orderNumber, memberRows[i % memberRows.length].id, total],
      );
      if (rows.length === 1) {
        for (const b of picks) {
          await client.query(
            "INSERT INTO order_lines (order_id, book_id, quantity, unit_price) VALUES ($1,$2,1,$3)",
            [rows[0].id, b.id, b.price],
          );
        }
      }
    }

    // One-time welcome points (ledger entry) for the first sample member, so redemption can be tried.
    const welcome = await client.query("SELECT id FROM members WHERE role = 'MEMBER' ORDER BY email LIMIT 1");
    if (welcome.rows.length === 1) {
      await client.query(
        `INSERT INTO gift_point_ledger (member_id, type, points, balance_after, note)
         SELECT $1, 'EARN', $2, $2, 'Welcome points (sample data)'
          WHERE NOT EXISTS (SELECT 1 FROM gift_point_ledger WHERE member_id = $1)`,
        [welcome.rows[0].id, WELCOME_POINTS],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  return { newCredentials };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("DB_USER") || url.includes("DB_PASSWORD")) {
    console.error("BLOCKED: DATABASE_URL is not set in backend/.env");
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const { newCredentials } = await seed(client);
    const { rows } = await client.query(
      `SELECT (SELECT count(*) FROM categories) AS categories, (SELECT count(*) FROM books) AS books,
              (SELECT count(*) FROM members) AS members, (SELECT count(*) FROM orders) AS orders`,
    );
    console.log(`Seed complete: ${JSON.stringify(rows[0])}`);
    if (newCredentials.length > 0) {
      console.log("\nSample logins created (shown ONCE, local console only; save them if you need them):");
      for (const c of newCredentials) console.log(`  ${c.email}  ${c.password}`);
    } else {
      console.log("No new members created; existing members and passwords were left unchanged.");
    }
  } catch (err) {
    console.error(`Seed FAILED: ${err.code ?? err.name}: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
