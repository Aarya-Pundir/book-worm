import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { assertSessionConfig } from "./lib/session.js";
import { runBackgroundSweep } from "./modules/order/order.lifecycle.js";
import { retryPendingRefunds } from "./modules/payment/payment.refunds.js";

assertSessionConfig(); // fail fast if SESSION_SECRET is missing or too short
const app = createApp();

app.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT }, "Book Worm API listening");
});

// Simulated carrier and refund retries (FR-059a, FR-077). Orders also update the moment a member opens them, so this
// only keeps things moving when nobody is looking. A failure is logged and never stops the server.
const sweep = setInterval(() => {
  Promise.all([runBackgroundSweep(), retryPendingRefunds()]).catch((err) => logger.error({ event: "sweep.failed", err: err?.message }, "Background sweep failed"));
}, 30_000);
sweep.unref();
