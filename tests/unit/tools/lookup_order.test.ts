import { describe, it, expect } from "vitest";
import { lookupOrder } from "../../../tools/lookup_order.js";
import { makeCtx } from "./helpers.js";

describe("lookup_order", () => {
    it("is a read tool", () => {
        expect(lookupOrder.name).toBe("lookup_order");
        expect(lookupOrder.risk).toBe("read");
    });

    it("returns the full order the customer owns", async () => {
        const order = await lookupOrder.execute({ orderId: "ord_small" }, makeCtx());
        expect(order).toMatchObject({
            id: "ord_small",
            status: "delivered",
            totalCents: 2499,
            refundedCents: 0,
        });
        expect(order.items).toHaveLength(1);
    });

    it("refuses another customer's order", async () => {
        await expect(lookupOrder.execute({ orderId: "ord_other_customer" }, makeCtx()))
            .rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    });

    it.each([
        ["empty string", { orderId: "" }],
        ["missing orderId", {}],
        ["number instead of string", { orderId: 42 }],
    ])("schema rejects %s", (_label, input) => {
        expect(lookupOrder.inputSchema.safeParse(input).success).toBe(false);
    });

    it("changing the returned order does not change the store", async () => {
        const ctx = makeCtx(); // same store for both calls on purpose
        const first = await lookupOrder.execute({ orderId: "ord_small" }, ctx);
        first.status = "cancelled";
        const again = await lookupOrder.execute({ orderId: "ord_small" }, ctx);
        expect(again.status).toBe("delivered");
    });
});
