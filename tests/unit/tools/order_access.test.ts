import { describe, it, expect } from "vitest";
import { getOwnedOrder } from "../../../src/tools/order_access.js";
import { DomainError } from "../../../src/domain/types.js";
import { makeCtx } from "./helpers.js";

/** Runs fn and returns what it threw, so we can inspect code + message. */
function thrownBy(fn: () => unknown): DomainError {
    try {
        fn();
    } catch (err) {
        if (err instanceof DomainError) return err;
        throw err;
    }
    throw new Error("expected a DomainError, but nothing was thrown");
}

describe("getOwnedOrder", () => {
    it("returns an order the customer owns", () => {
        const order = getOwnedOrder(makeCtx(), "ord_small");
        expect(order.id).toBe("ord_small");
        expect(order.customerId).toBe("cust_1");
    });

    it("refuses another customer's order", () => {
        const err = thrownBy(() => getOwnedOrder(makeCtx(), "ord_other_customer"));
        expect(err.code).toBe("ORDER_NOT_FOUND");
    });
    it("refuses a non-existent order", () => {
        const err = thrownBy(() => getOwnedOrder(makeCtx(), "ord_nope"));
        expect(err.code).toBe("ORDER_NOT_FOUND");
    });
    it("gives no hint about whether a refused order exists", () => {
        const other = thrownBy(() => getOwnedOrder(makeCtx(), "ord_other_customer"));
        const missing = thrownBy(() => getOwnedOrder(makeCtx(), "ord_nope"));
        expect(other.message.replace("ord_other_customer", "<id>"))
         .toBe(missing.message.replace("ord_nope", "<id>"));
    });
    it("lets the owner see their own order", () => {
        const order = getOwnedOrder(makeCtx({ customerId: "cust_2" }), "ord_other_customer");
        expect(order.customerId).toBe("cust_2");
    });
});