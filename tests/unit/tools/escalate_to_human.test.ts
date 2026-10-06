import { describe, it, expect } from "vitest";
import { escalateToHuman } from "../../../tools/escalate_to_human.js";
import { makeCtx } from "./helpers.js";

describe("escalate_to_human", () => {
    it("is a write tool", () => {
        expect(escalateToHuman.risk).toBe("write");
    });

    it("creates a ticket and returns its id", async () => {
        const result = await escalateToHuman.execute(
            { summary: "Customer wants a refund after 45 days", urgency: "normal" }, makeCtx());
        expect(result).toEqual({ ticketId: "tkt_1" });
    });

    it("creates a new ticket on each call", async () => {
        const ctx = makeCtx();
        const input = { summary: "Customer is upset about a late delivery", urgency: "high" as const };
        await escalateToHuman.execute(input, ctx);
        expect(await escalateToHuman.execute(input, ctx)).toEqual({ ticketId: "tkt_2" });
    });

    it("defaults urgency to normal", () => {
        const parsed = escalateToHuman.inputSchema.safeParse({ summary: "Customer needs help with an order" });
        expect(parsed.success && parsed.data.urgency).toBe("normal");
    });

    it("ignores a customerId sent by the model", () => {
        // The ticket owner must come from ctx; full check lands with store.listTickets in F13.
        const parsed = escalateToHuman.inputSchema.safeParse({
            summary: "Customer needs help with an order",
            customerId: "cust_2",
        });
        expect(parsed.success).toBe(true);
        expect(parsed.success && "customerId" in parsed.data).toBe(false);
    });

    it.each([
        ["a summary that is too short", { summary: "help" }],
        ["an unknown urgency", { summary: "Customer needs help with an order", urgency: "urgent" }],
        ["a missing summary", { urgency: "high" }],
    ])("schema rejects %s", (_label, input) => {
        expect(escalateToHuman.inputSchema.safeParse(input).success).toBe(false);
    });
});

