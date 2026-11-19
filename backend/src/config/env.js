import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("127.0.0.1"),
  FRONTEND_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  // Test-only: run the app against a temporary schema instead of the default one.
  DB_SCHEMA: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Report variable names only; never print values (they may be secrets).
  const names = parsed.error.issues.map((i) => i.path.join("."));
  throw new Error(`Invalid environment configuration: ${names.join(", ")}`);
}

export const env = Object.freeze(parsed.data);
