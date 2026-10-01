/**
 * Unit tests for the refund policy (src/domain/policy.ts).
 *
 * evaluateRefund is a pure function: same inputs → same output, no side
 * effects. So we test it by passing an order, an amount and a fixed "now",
 * then checking the result. No store and no real clock are needed.
 */
import { describe, it, expect } from "vitest";
import { evaluateRefund, REFUND_WINDOW_DAYS, type RefundReason } from "../../../src/domain/policy.js";
import { seedOrders, SEED_NOW } from "../../../src/domain/store.js";
import type { Order } from "../../../src/domain/types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Look up one seed order by id.
 * Throws if it's missing, so a renamed seed shows up as a clear error
 * instead of a confusing "cannot read property of undefined".
 */
function seed(id: string): Order {
  const order = seedOrders(SEED_NOW).find((o) => o.id === id);
  if (!order) throw new Error(`seed order ${id} missing`);
  return order;
}

// ---------------------------------------------------------------------------
// Acceptance criterion 1: every seed order goes through evaluateRefund.
// This is a *table-driven* test: one row per case and one shared test body.
// Adding a case means adding a row, not writing a new test.
// ---------------------------------------------------------------------------
describe("evaluateRefund – every seed order", () => {
  // [orderId, requestedCents, eligible, maxRefundableCents, reasons]
  const cases: [string, number, boolean, number, RefundReason[]][] = [
    // Delivered, in window, requesting the full amount → OK
    ["ord_small",          2499,  true,  2499,  []],
    ["ord_large",          15597, true,  15597, []],
    // Delivered exactly 30 days ago → last eligible day
    ["ord_day30",          5900,  true,  5900,  []],
    // 31 days → window closed; max is 0 because nothing can be refunded
    ["ord_day31",          3500,  false, 0,     ["OUTSIDE_WINDOW"]],
    // In window, but everything is already refunded → remaining is 0
    ["ord_full_refund",    1,     false, 0,     ["EXCEEDS_REMAINING"]],
    // 6000 total − 1500 refunded = 4500 left: exactly 4500 is OK, 1 cent more is not
    ["ord_partial_refund", 4500,  true,  4500,  []],
    ["ord_partial_refund", 4501,  false, 4500,  ["EXCEEDS_REMAINING"]],
    // Not delivered → never refundable, whatever the amount
    ["ord_shipped",        100,   false, 0,     ["NOT_DELIVERED"]],
    ["ord_cancelled",      100,   false, 0,     ["NOT_DELIVERED"]],
    // The policy doesn't check *who* is asking. Ownership is checked later
    // (tool/guardrail layer), so another customer's order is still "eligible" here.
    ["ord_other_customer", 4998,  true,  4998,  []],
  ];

  // it.each runs the body once per row; %s / %i fill in the test name.
  it.each(cases)(
    "%s requesting %i → eligible=%s, max=%i",
    (id, requested, eligible, max, reasons) => {
      const result = evaluateRefund(seed(id), requested, SEED_NOW);
      // toEqual compares the whole object, so an unexpected extra reason fails too.
      expect(result).toEqual({ eligible, maxRefundableCents: max, reasons });
    },
  );
});

// ---------------------------------------------------------------------------
// Boundary tests: bugs tend to sit right at the edge (> vs >=, rounding).
// Instead of relying on seed dates, we move "now" to exact offsets from the
// delivery time, which lets us test inside a single day too.
// ---------------------------------------------------------------------------
describe("evaluateRefund – 30-day window boundary", () => {
  const order = seed("ord_small");
  const deliveredAt = Date.parse(order.deliveredAt ?? "");
  /** A "now" that is `ms` milliseconds after delivery. */
  const at = (ms: number) => new Date(deliveredAt + ms);

  it(`day ${REFUND_WINDOW_DAYS} exactly is eligible`, () => {
    expect(evaluateRefund(order, 100, at(30 * MS_PER_DAY)).eligible).toBe(true);
  });

  it("last minute of day 30 is still eligible", () => {
    // 30d 23h 59m: floor() still gives 30 whole days
    expect(evaluateRefund(order, 100, at(31 * MS_PER_DAY - 60_000)).eligible).toBe(true);
  });

  it("day 31 is outside the window", () => {
    const result = evaluateRefund(order, 100, at(31 * MS_PER_DAY));
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("OUTSIDE_WINDOW");
    expect(result.maxRefundableCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bad input: amounts must be positive whole cents.
// Covers zero, negative, fractional (money bug) and NaN (parsing bug).
// ---------------------------------------------------------------------------
describe("evaluateRefund – invalid amounts", () => {
  it.each([0, -100, 12.5, Number.NaN])("rejects %s cents", (cents) => {
    const result = evaluateRefund(seed("ord_small"), cents, SEED_NOW);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("INVALID_AMOUNT");
  });
});

// ---------------------------------------------------------------------------
// Purity: the function must not change its input or depend on hidden state.
// ---------------------------------------------------------------------------
describe("evaluateRefund – purity", () => {
  it("does not mutate the order", () => {
    const order = seed("ord_partial_refund");
    const before = structuredClone(order); // deep snapshot to compare against
    evaluateRefund(order, 1000, SEED_NOW);
    expect(order).toEqual(before);
  });

  it("same inputs give the same output", () => {
    const order = seed("ord_large");
    expect(evaluateRefund(order, 500, SEED_NOW)).toEqual(evaluateRefund(order, 500, SEED_NOW));
  });
});
