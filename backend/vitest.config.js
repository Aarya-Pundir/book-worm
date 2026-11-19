import { randomBytes } from "node:crypto";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      // Random per run, test-only. Never a real secret.
      SESSION_SECRET: randomBytes(48).toString("base64url"),
    },
  },
});
