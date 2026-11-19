import { query } from "../../lib/db.js";

const COLUMNS = `id::int AS id, recipient, phone, line1, line2, city, state, pin_code AS "pinCode", is_default AS "isDefault"`;

// Every query is scoped by member_id, so one member can never read or change another's address (FR-071).
export async function listAddresses(memberId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM addresses WHERE member_id = $1 ORDER BY is_default DESC, id DESC`,
    [memberId],
  );
  return rows;
}

export async function findAddress(memberId, id, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM addresses WHERE member_id = $1 AND id = $2`, [memberId, id]);
  return rows[0] ?? null;
}

export async function countAddresses(memberId, db = { query }) {
  const { rows } = await db.query("SELECT count(*)::int AS n FROM addresses WHERE member_id = $1", [memberId]);
  return rows[0].n;
}

export async function insertAddress(memberId, a, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO addresses (member_id, recipient, phone, line1, line2, city, state, pin_code, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${COLUMNS}`,
    [memberId, a.recipient, a.phone, a.line1, a.line2 ?? null, a.city, a.state, a.pinCode, a.isDefault],
  );
  return rows[0];
}

export async function updateAddress(memberId, id, a, db = { query }) {
  const { rows } = await db.query(
    `UPDATE addresses SET recipient = $3, phone = $4, line1 = $5, line2 = $6, city = $7, state = $8,
            pin_code = $9, is_default = $10, updated_at = now()
      WHERE member_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
    [memberId, id, a.recipient, a.phone, a.line1, a.line2 ?? null, a.city, a.state, a.pinCode, a.isDefault],
  );
  return rows[0] ?? null;
}

export async function deleteAddress(memberId, id, db = { query }) {
  const { rowCount } = await db.query("DELETE FROM addresses WHERE member_id = $1 AND id = $2", [memberId, id]);
  return rowCount > 0;
}

export async function clearDefault(memberId, exceptId, db = { query }) {
  await db.query("UPDATE addresses SET is_default = FALSE WHERE member_id = $1 AND id <> $2", [memberId, exceptId]);
}

/** Longest matching PIN prefix wins. Prefixes are digits only (CHECK constraint), so LIKE is safe here. */
export async function findZone(pinCode, db = { query }) {
  const { rows } = await db.query(
    `SELECT zone, delivery_days AS "deliveryDays", charge::float8 AS charge
       FROM shipping_zones WHERE $1 LIKE pin_prefix || '%'
      ORDER BY length(pin_prefix) DESC LIMIT 1`,
    [pinCode],
  );
  return rows[0] ?? null;
}
