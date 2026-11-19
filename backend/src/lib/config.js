import { query } from "./db.js";

/** Reads a configurable rule from app_config. Falls back when missing or not a non-negative number. */
export async function getConfigNumber(key, fallback, db = { query }) {
  const { rows } = await db.query("SELECT value FROM app_config WHERE key = $1", [key]);
  const n = Number(rows[0]?.value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
