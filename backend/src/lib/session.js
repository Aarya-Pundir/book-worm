import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const SESSION_COOKIE = "session";
const SESSION_HOURS = 8;
const MIN_SECRET_LENGTH = 32;

/** Fail fast at startup if the signing secret is missing or weak. Never prints the value. */
export function assertSessionConfig() {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters. Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" and put it in backend/.env`,
    );
  }
}

export function signSession(memberId) {
  assertSessionConfig();
  return jwt.sign({}, env.SESSION_SECRET, {
    algorithm: "HS256",
    subject: String(memberId),
    expiresIn: `${SESSION_HOURS}h`,
  });
}

/** Returns the member id from a valid token, or null. */
export function verifySession(token) {
  try {
    assertSessionConfig();
    const payload = jwt.verify(token, env.SESSION_SECRET, { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_HOURS * 60 * 60 * 1000,
});

export const clearCookieOptions = () => {
  const options = cookieOptions();
  delete options.maxAge;
  return options;
};
