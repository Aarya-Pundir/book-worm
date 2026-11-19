import { z } from "zod";

/** Normalise an Indian mobile number to 10 digits, or return null if it is not valid. */
export function normalizeMobile(input) {
  if (typeof input !== "string") return null;
  let digits = input.replace(/[\s()-]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (/^91\d{10}$/.test(digits)) digits = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

const name = z
  .string({ error: "Name is required" })
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be at most 100 characters");

const email = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

const mobile = z
  .string({ error: "Mobile number is required" })
  .transform((v, ctx) => {
    const n = normalizeMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" });
      return z.NEVER;
    }
    return n;
  });

const password = z
  .string({ error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters") // bcrypt only uses the first 72 bytes
  .refine((v) => /[a-z]/.test(v), "Password needs a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Password needs an uppercase letter")
  .refine((v) => /\d/.test(v), "Password needs a digit");

export const registerSchema = z
  .object({
    name,
    email,
    mobile,
    password,
    confirmPassword: z.string({ error: "Please confirm your password" }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
    // Zod skips object-level checks when another field already failed; report the mismatch anyway.
    when: (payload) =>
      typeof payload.value?.password === "string" && typeof payload.value?.confirmPassword === "string",
  });

export const loginSchema = z.object({
  identifier: z.string({ error: "Email or mobile number is required" }).trim().min(1, "Email or mobile number is required").max(254),
  password: z.string({ error: "Password is required" }).min(1, "Password is required").max(200),
});

export { fieldErrors } from "../../lib/validation.js";
