import {z}  from "zod";
import type { Tool } from "./types.ts";
import { evaluateRefund } from "../domain/policy.js";
import { DomainError, type Refund } from "../domain/types.js";
import { getOwnedOrder } from "./order_access.js";

// issue_refund: a write tool, so it's stricter
export const issueRefundInput = z.object({
  orderId: z.string().min(1, "Order ID is required").describe("The order ID, e.g. 'ord_small'"),
  refundCents: z
    .number().int()
    .positive()
    .describe("Refund amount in cents, confirmed with the customer."),
  reason: z
    .string()
    .min(1)
    .describe("Short reason for the refund, shown in the audit trail"),
});

export type IssueRefundInput = z.infer<typeof issueRefundInput>;

export const issueRefund: Tool<IssueRefundInput, Refund> = {
    name: "issue_refund",
    description: "Issues a refund on an order. Use check_refund_policy first and confirm the amount with the customer before calling this.",
    inputSchema: issueRefundInput,
    risk: "write",
    async execute(input, ctx) {
        const order = getOwnedOrder(ctx, input.orderId);
        // Re-check policy at the moment of acting; never trust an earlier check passed in by the LLM.
        const evaluation = evaluateRefund(order, input.refundCents, ctx.now());
        if (!evaluation.eligible) {
            throw new DomainError(
                "REFUND_NOT_ELIGIBLE",
                `Refund not allowed: ${evaluation.reasons.join(", ")}. Max refundable: ${evaluation.maxRefundableCents} cents.`,
            );
        }
        return ctx.store.recordRefund(order.id, input.refundCents, input.reason);
    },
};