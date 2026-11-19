import { describe, expect, it } from "vitest";
import { cancelCheck, pointsEarned, returnCheck, returnShare } from "../../src/modules/order/order.rules.js";
import { RETURN_STEPS, SHIPMENT_STEPS, checkForwardMove, dueIndex } from "../../src/modules/shipping/shipment.rules.js";

const HOUR = 3600 * 1000;
const at = (ms) => new Date(Date.UTC(2026, 10, 1) + ms);
const confirmed = { status: "Confirmed", confirmedAt: at(0) };

describe("cancelCheck (FR-065)", () => {
  it("allows a confirmed, undispatched order inside the window", () => {
    expect(cancelCheck({ order: confirmed, shipment: { status: "Preparing" }, now: at(47 * HOUR), windowHours: 48 }).allowed).toBe(true);
  });
  it("declines after the window or once dispatched, with a reason", () => {
    const late = cancelCheck({ order: confirmed, shipment: { status: "Preparing" }, now: at(49 * HOUR), windowHours: 48 });
    expect(late).toMatchObject({ allowed: false });
    expect(late.reason).toMatch(/48-hour/);
    expect(cancelCheck({ order: confirmed, shipment: { status: "Dispatched" }, now: at(HOUR), windowHours: 48 }).reason).toMatch(/dispatched/);
    expect(cancelCheck({ order: { ...confirmed, status: "Dispatched" }, now: at(HOUR), windowHours: 48 }).allowed).toBe(false);
  });
  it("honours a configured window", () => {
    expect(cancelCheck({ order: confirmed, now: at(5 * HOUR), windowHours: 4 }).allowed).toBe(false);
    expect(cancelCheck({ order: confirmed, now: at(5 * HOUR), windowHours: 6 }).allowed).toBe(true);
  });
  it("declines unpaid, cancelled and delivered orders", () => {
    for (const status of ["Pending Payment", "Cancelled", "Delivered", "Returned"]) {
      expect(cancelCheck({ order: { ...confirmed, status }, now: at(HOUR), windowHours: 48 }).allowed).toBe(false);
    }
  });
});

describe("returnCheck (FR-067)", () => {
  const delivered = { status: "Delivered", deliveredAt: at(0) };
  it("allows a delivered physical order inside the window", () => {
    expect(returnCheck({ order: delivered, hasPhysical: true, now: at(6 * 24 * HOUR), windowDays: 7 }).allowed).toBe(true);
  });
  it("declines late, digital, repeated and undelivered returns", () => {
    expect(returnCheck({ order: delivered, hasPhysical: true, now: at(8 * 24 * HOUR), windowDays: 7 }).reason).toMatch(/7-day/);
    expect(returnCheck({ order: delivered, hasPhysical: false, now: at(HOUR), windowDays: 7 }).reason).toMatch(/eBooks/);
    expect(returnCheck({ order: delivered, hasPhysical: true, hasReturn: true, now: at(HOUR), windowDays: 7 }).allowed).toBe(false);
    expect(returnCheck({ order: { ...delivered, status: "Confirmed" }, hasPhysical: true, now: at(HOUR), windowDays: 7 }).allowed).toBe(false);
  });
});

describe("returnShare and pointsEarned", () => {
  it("refunds everything, shipping included, when all books are physical", () => {
    expect(returnShare({ subtotalCents: 30000, physicalCents: 30000, totalCents: 34000, shippingCents: 4000, pointsRedeemed: 60 })).toEqual({ refundCents: 34000, points: 60 });
  });
  it("shares the goods value in proportion for a mixed order and keeps shipping", () => {
    const r = returnShare({ subtotalCents: 18000, physicalCents: 10000, totalCents: 20200, shippingCents: 4000, pointsRedeemed: 18 });
    expect(r.refundCents).toBe(Math.floor((16200 * 10000) / 18000));
    expect(r.points).toBe(10);
  });
  it("earns a percentage of the goods paid, never on shipping, rounded down", () => {
    expect(pointsEarned({ totalCents: 34000, shippingCents: 4000, earnPercent: 10, pointValueCents: 100 })).toBe(30);
    expect(pointsEarned({ totalCents: 1999, shippingCents: 0, earnPercent: 5, pointValueCents: 100 })).toBe(0);
    expect(pointsEarned({ totalCents: 5000, shippingCents: 0, earnPercent: 5, pointValueCents: 0 })).toBe(0);
  });
});

describe("shipment rules (FR-059a)", () => {
  it("finds the latest step whose timer passed", () => {
    expect(dueIndex(0, [2, 5, 10])).toBe(0);
    expect(dueIndex(2 * 60000, [2, 5, 10])).toBe(1);
    expect(dueIndex(6 * 60000, [2, 5, 10])).toBe(2);
    expect(dueIndex(99 * 60000, [2, 5, 10])).toBe(3);
  });
  it("only moves forward, may skip ahead, and never leaves Delivered or a cancelled shipment", () => {
    expect(checkForwardMove(SHIPMENT_STEPS, "Preparing", "In Transit")).toEqual(["Dispatched", "In Transit"]);
    expect(() => checkForwardMove(SHIPMENT_STEPS, "In Transit", "Preparing")).toThrow(/forward/);
    expect(() => checkForwardMove(SHIPMENT_STEPS, "Delivered", "In Transit")).toThrow();
    expect(() => checkForwardMove(SHIPMENT_STEPS, "Dispatched", "Dispatched")).toThrow();
    expect(() => checkForwardMove(SHIPMENT_STEPS, "Preparing", "Dispatched", { closed: true })).toThrow(/cancelled/);
    expect(() => checkForwardMove(SHIPMENT_STEPS, "Preparing", "Nowhere")).toThrow();
    expect(checkForwardMove(RETURN_STEPS, "Requested", "Received")).toEqual(["Picked Up", "Received"]);
  });
});
