import { query } from "../../lib/db.js";

const PUBLIC_COLUMNS = "id, name, email, mobile, role, status";

export async function findById(id) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM members WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findByEmailOrMobile(email, mobile) {
  const { rows } = await query("SELECT email, mobile FROM members WHERE email = $1 OR mobile = $2", [
    email,
    mobile,
  ]);
  return rows;
}

/** Includes password_hash: for credential checks only, never return this to a client. */
export async function findForLogin({ email, mobile }) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM members WHERE ($1::text IS NOT NULL AND email = $1) OR ($2::text IS NOT NULL AND mobile = $2)`,
    [email ?? null, mobile ?? null],
  );
  return rows[0] ?? null;
}

export async function create({ name, email, mobile, passwordHash }) {
  const { rows } = await query(
    `INSERT INTO members (name, email, mobile, password_hash) VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_COLUMNS}`,
    [name, email, mobile, passwordHash],
  );
  return rows[0];
}
