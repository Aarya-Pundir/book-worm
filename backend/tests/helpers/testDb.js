import "dotenv/config";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { migrateUp } from "../../db/migrate.js";

export const hasDb = () => {
  const url = process.env.DATABASE_URL;
  return Boolean(url) && !url.includes("DB_USER") && !url.includes("DB_PASSWORD");
};

/**
 * Creates a throw-away schema with all migrations applied and points the app at it via
 * DB_SCHEMA. Must run BEFORE the app modules are imported (env is read at import time).
 * The real tables and data are never touched.
 */
export async function createTestSchema() {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`SET search_path TO ${schema}`);
  await migrateUp(admin);
  process.env.DB_SCHEMA = schema;

  return {
    schema,
    /** Direct SQL against the temp schema (for arranging test data). */
    sql: (text, params) => admin.query(text, params),
    async drop() {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    },
  };
}
