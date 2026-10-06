import {z} from "zod";
import type { Tool } from "./types.ts";
import { evaluateRefund, type RefundEvaluation } from "../domain/policy.js";
import {getOwnedOrder} from "./order_access.js";

const checkRefundPolicyInput = z.object({
    orderId: z
    .string()
    .min(1, "Order ID is required")
    .describe("The order ID, e.g 'ord_small'"),
    requestedCents: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Refund amount in cents. Omit to check a full refund of the remaining balance."),
});

type CheckRefundPolicyInput = z.infer<typeof checkRefundPolicyInput>;

type CheckRefundPolicyOutput = RefundEvaluation;

export const checkRefundPolicy: Tool<CheckRefundPolicyInput, CheckRefundPolicyOutput> = {
    name: "check_refund_policy",
    description: "Checks if an order is eligible for a refund under the 30-day policy, and the maximum refundable amount. Does NOT issue a refund.",
    inputSchema: checkRefundPolicyInput,
    risk: "read",
    async execute(input, ctx) {
        const order = getOwnedOrder(ctx, input.orderId);
        const requested = input.requestedCents ?? order.totalCents - order.refundedCents;
        return evaluateRefund(order, requested, ctx.now());
    },
}