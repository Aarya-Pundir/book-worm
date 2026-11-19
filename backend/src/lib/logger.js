import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  redact: {
    paths: [
      "password",
      "confirmPassword",
      "token",
      "authorization",
      "req.headers.authorization",
      "req.headers.cookie",
      "cardNumber",
      "cvv",
      "card",
      "upiId",
      "*.password",
      "*.token",
      "*.cardNumber",
      "*.cvv",
      "*.card",
      "*.upiId",
    ],
    censor: "[REDACTED]",
  },
});
