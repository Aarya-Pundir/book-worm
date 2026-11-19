import bcrypt from "bcrypt";
import { AppError, validationError } from "../../lib/errors.js";
import * as repo from "./member.repository.js";
import { fieldErrors, loginSchema, normalizeMobile, registerSchema } from "./member.schemas.js";

const BCRYPT_COST = 12;
const INVALID_CREDENTIALS = new AppError(401, "INVALID_CREDENTIALS", "Invalid email/mobile or password");

// Compared against when no member matches, so response time does not reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

const toPublic = (m) => ({ id: m.id, name: m.name, email: m.email, mobile: m.mobile, role: m.role });

export async function register(input) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  const { name, email, mobile, password } = parsed.data;

  const existing = await repo.findByEmailOrMobile(email, mobile);
  const conflicts = {};
  if (existing.some((r) => r.email === email)) conflicts.email = "This email is already registered";
  if (existing.some((r) => r.mobile === mobile)) conflicts.mobile = "This mobile number is already registered";
  if (Object.keys(conflicts).length) {
    throw new AppError(409, "DUPLICATE_MEMBER", "An account with these details already exists", conflicts);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    return toPublic(await repo.create({ name, email, mobile, passwordHash }));
  } catch (err) {
    // Two simultaneous registrations: the unique constraints are the final guard (FR-003).
    if (err.code === "23505") {
      throw new AppError(409, "DUPLICATE_MEMBER", "An account with these details already exists");
    }
    throw err;
  }
}

export async function login(input) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  const { identifier, password } = parsed.data;

  const lookup = identifier.includes("@")
    ? { email: identifier.toLowerCase() }
    : { mobile: normalizeMobile(identifier) };

  const member = lookup.email || lookup.mobile ? await repo.findForLogin(lookup) : null;
  const ok = await bcrypt.compare(password, member?.password_hash ?? DUMMY_HASH);
  // One generic error for unknown identifier, wrong password and disabled account (FR-006).
  if (!member || !ok || member.status !== "ACTIVE") throw INVALID_CREDENTIALS;
  return toPublic(member);
}

export async function getProfile(id) {
  const member = await repo.findById(id);
  return member && member.status === "ACTIVE" ? toPublic(member) : null;
}
