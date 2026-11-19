import { AppError } from "../../lib/errors.js";

/** Pure shipment rules (FR-057, FR-059a). No database access here. */

export const SHIPMENT_STEPS = ["Preparing", "Dispatched", "In Transit", "Delivered"];
export const RETURN_STEPS = ["Requested", "Picked Up", "Received"];

const MINUTE = 60 * 1000;

/**
 * Index of the latest step whose timer has passed. `minutes` are the delays after the start for steps 1..n
 * (cumulative, not per step). Step 0 is the starting status and is always reached.
 */
export function dueIndex(elapsedMs, minutes) {
  let due = 0;
  minutes.forEach((m, i) => {
    if (elapsedMs >= m * MINUTE) due = i + 1;
  });
  return due;
}

/** When step `index` is reached according to its timer. */
export const dueTime = (startedAt, minutes, index) => new Date(new Date(startedAt).getTime() + minutes[index - 1] * MINUTE);

/**
 * An override may only move forward (it may skip ahead for a demo). It can never go backwards, repeat a status,
 * leave Delivered/Received, or touch a cancelled shipment (FR-059a).
 */
export function checkForwardMove(steps, from, to, { closed = false } = {}) {
  if (closed) throw new AppError(409, "SHIPMENT_CLOSED", "This shipment was cancelled and can no longer change.");
  const target = steps.indexOf(to);
  if (target === -1) throw new AppError(400, "VALIDATION_ERROR", "Choose a valid status", { status: "Choose a valid status" });
  const current = steps.indexOf(from);
  if (target <= current) {
    throw new AppError(409, "INVALID_TRANSITION", `A shipment cannot move from ${from} to ${to}. Statuses only move forward.`);
  }
  return steps.slice(current + 1, target + 1);
}
