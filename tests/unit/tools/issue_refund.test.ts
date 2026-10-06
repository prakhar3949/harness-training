import { describe, it, expect } from "vitest";
import { issueRefund } from "../../../tools/issue_refund.js";
import { SEED_NOW } from "../../../src/domain/store.js";
import { makeCtx } from "./helpers.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("issue_refund", () => {
    it("is a write tool", () => {
        expect(issueRefund.risk).toBe("write");
    });

    it("records a refund and returns it", async () => {
        const ctx = makeCtx();
        const refund = await issueRefund.execute(
            { orderId: "ord_small", refundCents: 1000, reason: "arrived chipped" }, ctx);

        expect(refund).toEqual({ id: "ref_1", orderId: "ord_small", cents: 1000, reason: "arrived chipped" });
        expect(ctx.store.getOrder("ord_small")?.refundedCents).toBe(1000);
    });

    it("refuses an ineligible refund and records nothing", async () => {
        const ctx = makeCtx();
        await expect(issueRefund.execute(
            { orderId: "ord_day31", refundCents: 100, reason: "late" }, ctx))
            .rejects.toMatchObject({ code: "REFUND_NOT_ELIGIBLE" });

        expect(ctx.store.getOrder("ord_day31")?.refundedCents).toBe(0);
    });

    it("explains the refusal so the model can tell the customer", async () => {
        await expect(issueRefund.execute(
            { orderId: "ord_partial_refund", refundCents: 4501, reason: "too much" }, makeCtx()))
            .rejects.toThrow(/EXCEEDS_REMAINING.*4500/);
    });

    it("re-checks policy at the moment of acting (no double refund)", async () => {
        const ctx = makeCtx(); // shared on purpose: the second call must see the first refund
        const input = { orderId: "ord_small", refundCents: 2499, reason: "damaged" };

        await issueRefund.execute(input, ctx);
        await expect(issueRefund.execute(input, ctx)).rejects.toThrow(/FULLY_REFUNDED/);
    });

    it("uses the clock from ctx", async () => {
        const later = makeCtx({ now: () => new Date(SEED_NOW.getTime() + 40 * MS_PER_DAY) });
        await expect(issueRefund.execute(
            { orderId: "ord_small", refundCents: 100, reason: "late" }, later))
            .rejects.toThrow(/OUTSIDE_WINDOW/);
    });

    it("cannot refund another customer's order", async () => {
        const ctx = makeCtx();
        await expect(issueRefund.execute(
            { orderId: "ord_other_customer", refundCents: 100, reason: "x" }, ctx))
            .rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });

        expect(ctx.store.getOrder("ord_other_customer")?.refundedCents).toBe(0);
    });

    it.each([
        ["zero amount", { refundCents: 0, reason: "x" }],
        ["negative amount", { refundCents: -5, reason: "x" }],
        ["fractional cents", { refundCents: 1.5, reason: "x" }],
        ["amount as string", { refundCents: "100", reason: "x" }],
        ["missing reason", { refundCents: 100 }],
        ["empty reason", { refundCents: 100, reason: "" }],
    ])("schema rejects %s", (_label, fields) => {
        expect(issueRefund.inputSchema.safeParse({ orderId: "ord_small", ...fields }).success).toBe(false);
    });
});
