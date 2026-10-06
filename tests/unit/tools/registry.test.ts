import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../../src/tools/registry.js";
import type { Tool } from "../../../src/tools/types.js";
import { lookupOrder } from "../../../src/tools/lookup_order.js";
import { checkRefundPolicy } from "../../../src/tools/check_refund_policy.js";
import { issueRefund } from "../../../src/tools/issue_refund.js";
import { escalateToHuman } from "../../../src/tools/escalate_to_human.js";
import { makeCtx } from "./helpers.js";

const makeRegistry = () =>
    new ToolRegistry()
        .register(lookupOrder)
        .register(checkRefundPolicy)
        .register(issueRefund)
        .register(escalateToHuman);

// A tool that crashes with a non-domain error, carrying a "secret" in its message.
const emptyInput = z.object({});
const brokenTool: Tool<z.infer<typeof emptyInput>, never> = {
    name: "broken",
    description: "Always crashes. Test only.",
    inputSchema: emptyInput,
    risk: "read",
    async execute() {
        throw new Error("connection string: postgres://admin:hunter2@db");
    },
};

describe("ToolRegistry – registration", () => {
    it("lists every registered tool", () => {
        expect(makeRegistry().list().map((t) => t.name)).toEqual([
            "lookup_order", "check_refund_policy", "issue_refund", "escalate_to_human",
        ]);
    });

    it("rejects duplicate tool names", () => {
        expect(() => makeRegistry().register(lookupOrder)).toThrow("already registered");
    });

    it("returns undefined for an unknown tool", () => {
        expect(makeRegistry().get("nope")).toBeUndefined();
    });
});

describe("ToolRegistry – model schemas", () => {
    it("matches the snapshot (review any change: it's what the model sees)", () => {
        expect(makeRegistry().toModelSchemas()).toMatchSnapshot();
    });

    it("marks fields with defaults as optional for the model", () => {
        const schemas = makeRegistry().toModelSchemas();
        const byName = (n: string) => schemas.find((s) => s.name === n)?.inputSchema;

        expect(byName("escalate_to_human")?.required).not.toContain("urgency");
        expect(byName("issue_refund")?.required).toEqual(
            expect.arrayContaining(["orderId", "refundCents", "reason"]));
    });
});

describe("ToolRegistry – execute", () => {
    it("runs a tool and wraps the result", async () => {
        const result = await makeRegistry().execute("lookup_order", { orderId: "ord_small" }, makeCtx());
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data).toMatchObject({ id: "ord_small" });
    });

    it("passes parsed input, so schema defaults apply", async () => {
        const result = await makeRegistry().execute(
            "escalate_to_human", { summary: "Customer needs help with an order" }, makeCtx());
        expect(result).toEqual({ ok: true, data: { ticketId: "tkt_1" } });
    });

    it("rejects an unknown tool and lists the real ones", async () => {
        const result = await makeRegistry().execute("refund_everything", {}, makeCtx());
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("lookup_order");
    });

    it("returns a readable error for { orderId: 42 }, without throwing", async () => {
        const result = await makeRegistry().execute("issue_refund", { orderId: 42 }, makeCtx());
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("orderId");
            expect(result.error).toContain("refundCents"); // missing fields are reported too
        }
    });

    it.each([null, undefined, "ord_small", 42])("never throws on garbage input: %s", async (raw) => {
        const result = await makeRegistry().execute("lookup_order", raw, makeCtx());
        expect(result.ok).toBe(false);
    });

    it("turns a DomainError into an error result with its message", async () => {
        const result = await makeRegistry().execute(
            "lookup_order", { orderId: "ord_other_customer" }, makeCtx());
        expect(result).toEqual({ ok: false, error: expect.stringContaining("not found") });
    });

    it("hides unexpected errors from the model but still logs them", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const registry = new ToolRegistry().register(brokenTool);

        const result = await registry.execute("broken", {}, makeCtx());

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).not.toContain("hunter2");
            expect(result.error).toContain("failed unexpectedly");
        }
        expect(log).toHaveBeenCalledOnce();
        log.mockRestore();
    });
});
