import { z } from "zod";
import { normalizeMobile } from "../member/member.schemas.js";

const text = (label, min, max) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const placeName = (label) =>
  text(label, 2, 60).regex(/^[\p{L}][\p{L} .'-]*$/u, `${label} may contain only letters, spaces and . ' -`);

/** Delivery is India only: a 6-digit PIN that does not start with 0 (FR-053). */
export const PIN_PATTERN = /^[1-9][0-9]{5}$/;

export const addressSchema = z.object({
  recipient: text("Recipient name", 2, 100),
  phone: z
    .string({ error: "Phone number is required" })
    .refine((v) => normalizeMobile(v) !== null, "Enter a valid 10-digit mobile number")
    .transform((v) => normalizeMobile(v)),
  line1: text("Address line 1", 3, 150),
  line2: z
    .string()
    .trim()
    .max(150, "Address line 2 must be at most 150 characters")
    .optional()
    .transform((v) => v || undefined),
  city: placeName("City"),
  state: placeName("State"),
  pinCode: z
    .string({ error: "PIN code is required" })
    .trim()
    .regex(PIN_PATTERN, "PIN code must be 6 digits and cannot start with 0"),
  isDefault: z.boolean().optional().default(false),
});

export const idSchema = (label) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .positive(`${label} must be positive`);
