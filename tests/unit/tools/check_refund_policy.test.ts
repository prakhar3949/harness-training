import { describe, it, expect } from "vitest";
import { checkRefundPolicy } from "../../../src/tools/check_refund_policy.js";
import { SEED_NOW } from "../../../src/domain/store.js";
import { makeCtx } from "./helpers.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("check_refund_policy", () => {
    it("is a read tool", () => {
        expect(checkRefundPolicy.risk).toBe("read");
    });

    it("with no amount, checks a full refund of a refundable order", async () => {
        const result = await checkRefundPolicy.execute({ orderId: "ord_small" }, makeCtx());
        expect(result).toEqual({ eligible: true, maxRefundableCents: 2499, reasons: [] });
    });

    it("defaults to the REMAINING balance, not the order total", async () => {
        // 6000 total − 1500 already refunded = 4500 remaining
        const result = await checkRefundPolicy.execute({ orderId: "ord_partial_refund" }, makeCtx());
        expect(result).toEqual({ eligible: true, maxRefundableCents: 4500, reasons: [] });
    });

    it("uses requestedCents when given", async () => {
        const result = await checkRefundPolicy.execute(
            { orderId: "ord_partial_refund", requestedCents: 4501 }, makeCtx());
        expect(result.eligible).toBe(false);
        expect(result.reasons).toEqual(["EXCEEDS_REMAINING"]);
    });

    it("reports a fully refunded order clearly", async () => {
        const result = await checkRefundPolicy.execute({ orderId: "ord_full_refund" }, makeCtx());
        expect(result).toEqual({ eligible: false, maxRefundableCents: 0, reasons: ["FULLY_REFUNDED"] });
    });

    it("uses the clock from ctx, not the system clock", async () => {
        // ord_small was delivered 2 days before SEED_NOW; 40 days later it's outside the window
        const later = makeCtx({ now: () => new Date(SEED_NOW.getTime() + 40 * MS_PER_DAY) });
        const result = await checkRefundPolicy.execute({ orderId: "ord_small" }, later);
        expect(result.reasons).toContain("OUTSIDE_WINDOW");
    });

    it("returns an ineligible result instead of throwing", async () => {
        const result = await checkRefundPolicy.execute({ orderId: "ord_day31" }, makeCtx());
        expect(result).toEqual({ eligible: false, maxRefundableCents: 0, reasons: ["OUTSIDE_WINDOW"] });
    });

    it("refuses another customer's order", async () => {
        await expect(checkRefundPolicy.execute({ orderId: "ord_other_customer" }, makeCtx()))
            .rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    });

    it("schema accepts an order ID alone", () => {
        expect(checkRefundPolicy.inputSchema.safeParse({ orderId: "ord_small" }).success).toBe(true);
    });

    it.each([
        ["zero", 0],
        ["negative", -5],
        ["fractional cents", 1.5],
        ["a string", "100"],
    ])("schema rejects requestedCents that is %s", (_label, requestedCents) => {
        expect(checkRefundPolicy.inputSchema.safeParse({ orderId: "ord_small", requestedCents }).success)
            .toBe(false);
    });
});
