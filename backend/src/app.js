import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env.js";
import healthRoutes from "./modules/system/health.routes.js";
import docsRoutes from "./modules/system/docs.routes.js";
import { createMemberRoutes } from "./modules/member/member.routes.js";
import { createCatalogRoutes } from "./modules/catalog/catalog.routes.js";
import { createCartRoutes } from "./modules/order/cart.routes.js";
import { createGiftPointRoutes, createOrderRoutes } from "./modules/order/order.routes.js";
import { createAddressRoutes } from "./modules/shipping/shipping.routes.js";
import { createPaymentRoutes } from "./modules/payment/payment.routes.js";
import { createWishlistRoutes, createWritersRoutes, createWriterPageRoutes } from "./modules/member/wishlist.routes.js";
import { parseCookies } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

/** `memberRouteOptions` lets tests inject small rate limits. */
export function createApp({ memberRouteOptions } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(parseCookies);

  app.use("/api", healthRoutes);
  app.use("/api", docsRoutes);
  app.use("/api/members", createMemberRoutes(memberRouteOptions));
  app.use("/api/cart", createCartRoutes());
  app.use("/api/addresses", createAddressRoutes());
  app.use("/api/gift-points", createGiftPointRoutes());
  app.use("/api/payments", createPaymentRoutes());
  app.use("/api/wishlist", createWishlistRoutes());
  app.use("/api/writers", createWritersRoutes());
  // Before the catalogue routes: GET /api/authors/:id lives here, GET /api/authors (the list) stays in Catalog.
  app.use("/api/authors", createWriterPageRoutes());
  app.use("/api", createOrderRoutes());
  app.use("/api", createCatalogRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
