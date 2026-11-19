import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

async function listMigrations() {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => /^\d+_.+\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort()
    .map((f) => f.replace(/\.sql$/, ""));
}

async function ensureTable(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}

async function applied(client) {
  const { rows } = await client.query("SELECT name FROM schema_migrations ORDER BY name");
  return rows.map((r) => r.name);
}

/** Apply all pending migrations in order, each in its own transaction. Returns the names applied. */
export async function migrateUp(client) {
  await ensureTable(client);
  const done = new Set(await applied(client));
  const ran = [];
  for (const name of await listMigrations()) {
    if (done.has(name)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, `${name}.sql`), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    ran.push(name);
  }
  return ran;
}

/** Roll back the most recent `steps` migrations using their `.down.sql` files. */
export async function migrateDown(client, steps = 1) {
  await ensureTable(client);
  const done = await applied(client);
  const rolledBack = [];
  for (const name of done.reverse().slice(0, steps)) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, `${name}.down.sql`), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("DELETE FROM schema_migrations WHERE name = $1", [name]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    rolledBack.push(name);
  }
  return rolledBack;
}

async function main() {
  const direction = process.argv[2] ?? "up";
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("DB_USER") || url.includes("DB_PASSWORD")) {
    console.error("BLOCKED: DATABASE_URL is not set in backend/.env");
    process.exit(2);
  }
  if (!["up", "down"].includes(direction)) {
    console.error("Usage: node db/migrate.js [up|down]");
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const names = direction === "up" ? await migrateUp(client) : await migrateDown(client);
    console.log(
      names.length
        ? `${direction === "up" ? "Applied" : "Rolled back"}: ${names.join(", ")}`
        : "Nothing to do",
    );
  } catch (err) {
    // Never print the connection string or credentials.
    console.error(`Migration FAILED: ${err.code ?? err.name}: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
