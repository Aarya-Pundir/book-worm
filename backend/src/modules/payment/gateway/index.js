import { MockPaymentGateway } from "./mock.gateway.js";

// The one place that decides which gateway is used. Swapping providers means changing only this file
// (or calling setGateway in tests). PENDING ADMIN APPROVAL: provider and lifecycle.
let gateway = new MockPaymentGateway();

export const getGateway = () => gateway;

export function setGateway(next) {
  if (typeof next?.authorize !== "function") throw new Error("A payment gateway must implement authorize()");
  gateway = next;
}
