/** Money is handled in integer paise so totals never drift (SC-017). Prices arrive from NUMERIC as numbers. */
export const toCents = (amount) => Math.round(Number(amount) * 100);
export const toMoney = (cents) => cents / 100;
export const rupees = (amount) => `₹${Number(amount).toFixed(2)}`;
