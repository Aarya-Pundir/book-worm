import crypto from "node:crypto";
import { env } from "../../config/env.js";

/** Guest carts are identified by a random token that lives only in an httpOnly cookie. */
export const CART_COOKIE = "cart_token";
const CART_DAYS = 7;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const newCartToken = () => crypto.randomBytes(32).toString("base64url");

/** Only the hash is stored, so a database leak cannot be replayed as a cart cookie. */
export const hashCartToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** Returns the token if it looks like one we issued, otherwise null. */
export const validCartToken = (value) => (typeof value === "string" && TOKEN_PATTERN.test(value) ? value : null);

export const cartCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: CART_DAYS * 24 * 60 * 60 * 1000,
});

export const clearCartCookieOptions = () => {
  const options = cartCookieOptions();
  delete options.maxAge;
  return options;
};
