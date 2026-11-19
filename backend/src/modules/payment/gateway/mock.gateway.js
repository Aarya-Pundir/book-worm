import { env } from "../../../config/env.js";

/**
 * TEMPORARY MOCK PAYMENT GATEWAY (PENDING ADMIN APPROVAL: provider and lifecycle).
 *
 * Contract every gateway must follow, so a real provider can replace this without changing other modules:
 *   authorize({ method, amountCents, reference, maskedIndicator?, simulate? })
 *     -> Promise<{ approved: boolean, gatewayRef?: string, failureReason?: string }>
 *   refund({ amountCents, reference, gatewayRef }) is optional and returns the same shape.
 *   It may throw; the payment service treats a throw as a failed, safe outcome (FR-080).
 *
 * SECURITY (FR-073, SC-021): this interface deliberately has NO field for a card number, expiry, security code,
 * UPI id or bank credentials. Nothing sensitive can reach the gateway, the database or the logs through it.
 * A real integration must use the provider's hosted fields or tokens, never raw card data on our servers.
 *
 * `simulate` ('decline' | 'error') exists only so the sandbox can show failure handling. It is ignored in production.
 */
export class MockPaymentGateway {
  async authorize({ method, amountCents, reference, simulate }) {
    if (!["CARD", "UPI", "NET_BANKING"].includes(method)) {
      return { approved: false, failureReason: "This payment method is not supported." };
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return { approved: false, failureReason: "The payment amount is not valid." };
    }
    if (env.NODE_ENV !== "production") {
      if (simulate === "decline") return { approved: false, failureReason: "The payment was declined (sandbox). Please try again or use another method." };
      if (simulate === "error") throw new Error("Simulated gateway outage");
    }
    return { approved: true, gatewayRef: `MOCK-${reference}` };
  }

  /**
   * Returns money to the original payment. Optional for a gateway: without it a refund stays PENDING (safe).
   * Idempotent by `reference`, so asking twice can never refund twice. No card data is involved.
   */
  async refund({ amountCents, reference }) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) return { approved: false, failureReason: "The refund amount is not valid." };
    return { approved: true, gatewayRef: `MOCK-${reference}` };
  }
}
