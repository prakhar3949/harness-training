/**
 * Unit tests for the in-memory order store and seed data (src/domain/store.ts).
 *
 * The store guards *data* invariants: the order exists, the amount is valid,
 * no over-refund. Time-based *policy* (the 30-day window) lives in
 * evaluateRefund and is tested in policy.test.ts.
 */
import { describe, it, expect } from "vitest";
import { InMemoryOrderStore, seedOrders, SEED_NOW, SEED_CUSTOMER_ID } from "../../../src/domain/store.js";
import { DomainError, type DomainErrorCode } from "../../../src/domain/types.js";

/** A fresh store per test, so no test can leak state into another. */
const newStore = () => new InMemoryOrderStore(seedOrders(SEED_NOW));

/**
 * Asserts that `fn` throws a DomainError with the given `code`.
 *
 * `expect(fn).toThrow()` alone would pass for *any* error, even a TypeError
 * from a typo, so we also check the error's class and code.
 */
function expectDomainError(fn: () => unknown, code: DomainErrorCode) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(code);
    return; // threw the right error → pass
  }
  // Reaching this line means fn() didn't throw at all → fail
  throw new Error(`expected DomainError ${code}, but nothing was thrown`);
}

// ---------------------------------------------------------------------------
// Seed data sanity checks: if the fixtures are wrong, every other test is too.
// ---------------------------------------------------------------------------
describe("seedOrders", () => {
  it("returns at least 8 orders with unique ids", () => {
    const orders = seedOrders(SEED_NOW);
    expect(orders.length).toBeGreaterThanOrEqual(8);
    // A Set drops duplicates, so if its size matches the array, all ids are unique
    expect(new Set(orders.map((o) => o.id)).size).toBe(orders.length);
  });

  it("uses integer cents and totals that match the items", () => {
    for (const o of seedOrders(SEED_NOW)) {
      const itemsTotal = o.items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
      expect(Number.isInteger(o.totalCents)).toBe(true);
      expect(Number.isInteger(o.refundedCents)).toBe(true);
      expect(o.totalCents).toBe(itemsTotal); // catches hand-typed total mistakes
    }
  });
});

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------
describe("InMemoryOrderStore – reads", () => {
  it("getOrder returns the order, or undefined if missing", () => {
    const store = newStore();
    // ?. because getOrder can return undefined (strict mode makes us handle it)
    expect(store.getOrder("ord_small")?.totalCents).toBe(2499);
    expect(store.getOrder("nope")).toBeUndefined();
  });

  it("listOrdersByCustomer only returns that customer's orders", () => {
    const store = newStore();
    const mine = store.listOrdersByCustomer(SEED_CUSTOMER_ID);
    expect(mine.length).toBeGreaterThan(0); // guards against "empty list passes every()"
    expect(mine.every((o) => o.customerId === SEED_CUSTOMER_ID)).toBe(true);
    expect(mine.map((o) => o.id)).not.toContain("ord_other_customer");
  });
});

// ---------------------------------------------------------------------------
// recordRefund: the happy path first, then every way it should refuse.
// ---------------------------------------------------------------------------
describe("InMemoryOrderStore – recordRefund", () => {
  it("records a valid refund and updates refundedCents", () => {
    const store = newStore();
    // Refund exactly the remaining 4500 (6000 total − 1500 already refunded)
    const refund = store.recordRefund("ord_partial_refund", 4500, "damaged");
    // toMatchObject checks only these fields; the generated id is checked separately
    expect(refund).toMatchObject({ orderId: "ord_partial_refund", cents: 4500, reason: "damaged" });
    expect(refund.id).toMatch(/^ref_/);
    expect(store.getOrder("ord_partial_refund")?.refundedCents).toBe(6000); // now fully refunded
  });

  it("refund ids are unique", () => {
    const store = newStore();
    const a = store.recordRefund("ord_large", 100, "x");
    const b = store.recordRefund("ord_large", 100, "y");
    expect(a.id).not.toBe(b.id);
  });

  // Acceptance criterion 2: over-refund throws DomainError
  it("throws OVER_REFUND when exceeding the remaining balance", () => {
    const store = newStore();
    expectDomainError(() => store.recordRefund("ord_partial_refund", 4501, "x"), "OVER_REFUND");
    // A failed operation must leave the data untouched (no half-applied refund)
    expect(store.getOrder("ord_partial_refund")?.refundedCents).toBe(1500);
  });

  it("throws OVER_REFUND on an already fully refunded order", () => {
    expectDomainError(() => newStore().recordRefund("ord_full_refund", 1, "x"), "OVER_REFUND");
  });

  it("throws OVER_REFUND across multiple refunds that add up too high", () => {
    // Each refund alone is fine; together they exceed 2499
    const store = newStore();
    store.recordRefund("ord_small", 2000, "x");
    expectDomainError(() => store.recordRefund("ord_small", 500, "y"), "OVER_REFUND");
  });

  it("throws ORDER_NOT_FOUND for an unknown order", () => {
    expectDomainError(() => newStore().recordRefund("nope", 100, "x"), "ORDER_NOT_FOUND");
  });

  it.each([0, -1, 10.5])("throws INVALID_AMOUNT for %s cents", (cents) => {
    expectDomainError(() => newStore().recordRefund("ord_small", cents, "x"), "INVALID_AMOUNT");
  });

  it.each(["ord_shipped", "ord_cancelled"])("throws ORDER_NOT_DELIVERED for %s", (id) => {
    expectDomainError(() => newStore().recordRefund(id, 100, "x"), "ORDER_NOT_DELIVERED");
  });
});

// ---------------------------------------------------------------------------
// Acceptance criterion 3: stores don't share state.
// Objects in JS are passed by reference, so without the structuredClone
// copies in the store, two stores (or a store and its caller) would edit the
// same order objects.
// ---------------------------------------------------------------------------
describe("InMemoryOrderStore – state isolation", () => {
  it("two stores from seedOrders() don't share state", () => {
    const a = newStore();
    const b = newStore();
    a.recordRefund("ord_small", 1000, "x");
    expect(a.getOrder("ord_small")?.refundedCents).toBe(1000);
    expect(b.getOrder("ord_small")?.refundedCents).toBe(0); // b is unaffected
  });

  it("two stores from the SAME array don't share state", () => {
    // Harder case: both stores get the very same object references.
    // Only the constructor's deep copy keeps them separate.
    const orders = seedOrders(SEED_NOW);
    const a = new InMemoryOrderStore(orders);
    const b = new InMemoryOrderStore(orders);
    a.recordRefund("ord_small", 1000, "x");
    expect(b.getOrder("ord_small")?.refundedCents).toBe(0);
    // The caller's original array is untouched too
    expect(orders.find((o) => o.id === "ord_small")?.refundedCents).toBe(0);
  });

  it("mutating a returned order doesn't change the store", () => {
    // getOrder returns a copy, so editing it can't bypass recordRefund's checks
    const store = newStore();
    const order = store.getOrder("ord_small");
    if (order) order.refundedCents = 999;
    expect(store.getOrder("ord_small")?.refundedCents).toBe(0);
  });
});
