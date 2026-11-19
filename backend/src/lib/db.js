import pg from "pg";
import { env } from "../config/env.js";

let pool;

/** Lazily created so modules that never touch the database (e.g. health) need no DB. */
export function getPool() {
  if (!pool) {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
    pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      options: env.DB_SCHEMA ? `-c search_path=${env.DB_SCHEMA}` : undefined,
    });
  }
  return pool;
}

/** Parameterized queries only. Never build SQL from user input. */
export const query = (text, params) => getPool().query(text, params);

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** Runs fn(client) inside one transaction; rolls back on any error. */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
