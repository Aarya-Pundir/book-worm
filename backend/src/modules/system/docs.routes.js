import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

// The API contract is the single source of truth in the spec folder; this route serves that file unchanged.
export const OPENAPI_PATH = fileURLToPath(new URL("../../../../specs/001-member-auth-catalogue/contracts/openapi.yaml", import.meta.url));

const router = Router();

router.get("/openapi.yaml", async (_req, res, next) => {
  try {
    const text = await readFile(OPENAPI_PATH, "utf8");
    res.type("application/yaml").send(text);
  } catch (err) {
    // Details stay in the server log; the client only learns that the contract is not available.
    logger.error({ err: err?.message }, "OpenAPI contract could not be read");
    next(new AppError(404, "NOT_FOUND", "Resource not found"));
  }
});

export default router;