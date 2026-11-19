import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

// Phase 8 (T072): small units that need no database. Secrets here are throw-away test values.
const TEST_SECRET = "unit-test-secret-that-is-at-least-32-characters-long";

async function freshSession(env) {
  vi.resetModules();
  vi.doMock("../../src/config/env.js", () => ({ env: { NODE_ENV: "test", ...env } }));
  return import("../../src/lib/session.js");
}

describe("session configuration", () => {
  it("refuses to start without a strong signing secret, and never prints the value", async () => {
    const weak = await freshSession({ SESSION_SECRET: "short-secret" });
    expect(() => weak.assertSessionConfig()).toThrow(/at least 32/);
    expect(() => weak.assertSessionConfig()).not.toThrow(/short-secret/);
    const none = await freshSession({});
    expect(() => none.signSession(1)).toThrow();
  });

  it("signs and verifies a session for a member, and rejects other tokens", async () => {
    const s = await freshSession({ SESSION_SECRET: TEST_SECRET });
    const token = s.signSession(42);
    expect(s.verifySession(token)).toBe("42");
    expect(s.verifySession("not.a.token")).toBeNull();
    expect(s.verifySession(jwt.sign({}, "another-secret-that-is-also-32-chars-long!!", { subject: "42" }))).toBeNull();
    // An unsigned token ("alg: none") must never be accepted.
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from('{"sub":"42"}').toString("base64url")}.`;
    expect(s.verifySession(unsigned)).toBeNull();
    // An expired token is rejected.
    expect(s.verifySession(jwt.sign({}, TEST_SECRET, { subject: "42", expiresIn: -10 }))).toBeNull();
  });

  it("uses httpOnly, SameSite=Lax cookies, and Secure in production only", async () => {
    const dev = await freshSession({ SESSION_SECRET: TEST_SECRET, NODE_ENV: "development" });
    expect(dev.cookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    const prod = await freshSession({ SESSION_SECRET: TEST_SECRET, NODE_ENV: "production" });
    expect(prod.cookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
    expect(prod.clearCookieOptions().maxAge).toBeUndefined();
  });
});

describe("mock payment gateway (temporary, PENDING ADMIN APPROVAL: provider)", () => {
  async function gatewayIn(nodeEnv) {
    vi.resetModules();
    vi.doMock("../../src/config/env.js", () => ({ env: { NODE_ENV: nodeEnv } }));
    const { MockPaymentGateway } = await import("../../src/modules/payment/gateway/mock.gateway.js");
    return new MockPaymentGateway();
  }

  it("approves supported methods and refuses unsupported methods and invalid amounts", async () => {
    const g = await gatewayIn("test");
    for (const method of ["CARD", "UPI", "NET_BANKING"]) {
      expect(await g.authorize({ method, amountCents: 100, reference: "R1" })).toEqual({ approved: true, gatewayRef: "MOCK-R1" });
    }
    expect((await g.authorize({ method: "BITCOIN", amountCents: 100, reference: "R" })).approved).toBe(false);
    for (const amountCents of [0, -5, 1.5, "100", null]) {
      expect((await g.authorize({ method: "CARD", amountCents, reference: "R" })).approved).toBe(false);
    }
  });

  it("offers decline and outage simulation outside production only", async () => {
    const dev = await gatewayIn("test");
    expect((await dev.authorize({ method: "CARD", amountCents: 100, reference: "R", simulate: "decline" })).approved).toBe(false);
    await expect(dev.authorize({ method: "CARD", amountCents: 100, reference: "R", simulate: "error" })).rejects.toThrow();
    const prod = await gatewayIn("production");
    expect((await prod.authorize({ method: "CARD", amountCents: 100, reference: "R", simulate: "decline" })).approved).toBe(true);
    await expect(prod.authorize({ method: "CARD", amountCents: 100, reference: "R", simulate: "error" })).resolves.toMatchObject({ approved: true });
  });

  it("refunds a valid amount idempotently by reference and refuses an invalid one", async () => {
    const g = await gatewayIn("test");
    const a = await g.refund({ amountCents: 500, reference: "REFUND-1" });
    const b = await g.refund({ amountCents: 500, reference: "REFUND-1" });
    expect(a).toEqual(b);
    expect((await g.refund({ amountCents: 0, reference: "x" })).approved).toBe(false);
  });

  it("has no field that could carry card data", async () => {
    const source = (await import("node:fs")).readFileSync(new URL("../../src/modules/payment/gateway/mock.gateway.js", import.meta.url), "utf8");
    const signature = source.match(/async authorize\(\{([^}]*)\}\)/)[1];
    expect(signature).not.toMatch(/card|cvv|cvc|expiry|pan|upiId|account/i);
  });
});

describe("error handler", () => {
  async function handle(err) {
    const { errorHandler } = await import("../../src/middleware/errorHandler.js");
    let out = {};
    const res = {
      status(code) {
        out.status = code;
        return this;
      },
      json(body) {
        out.body = body;
        return this;
      },
    };
    errorHandler(err, {}, res, () => {});
    return out;
  }

  it("answers an oversized body with 413 and a generic message", async () => {
    const out = await handle(Object.assign(new Error("request entity too large"), { type: "entity.too.large", status: 413 }));
    expect(out).toEqual({ status: 413, body: { error: { code: "PAYLOAD_TOO_LARGE", message: "Request is too large" } } });
  });

  it("answers an unknown failure with a generic 500 and no details", async () => {
    const out = await handle(new Error("password=hunter2 at C:\\secret\\path"));
    expect(out.status).toBe(500);
    expect(JSON.stringify(out.body)).not.toMatch(/hunter2|secret|path|Error/);
  });
});
