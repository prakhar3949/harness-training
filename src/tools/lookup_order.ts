import {z}  from "zod";
import type { Tool } from "./types.ts";
import type { Order } from "../domain/types.js";
import { getOwnedOrder } from "./order_access.js";

export const lookupOrderInputSchema = z.object({
    orderId: z
    .string()
    .min(1, "Order ID is required")
    .describe("The order ID, e.g 'ord_small'"),
});

export type LookupOrderInputSchema = z.infer<typeof lookupOrderInputSchema>;

export type LookupOrderOutput = Order;

export const lookupOrder: Tool<LookupOrderInputSchema, LookupOrderOutput> = {
    name: "lookup_order",
    description: "Looks up one of the current customer's orders by ID. Returns status, items, totals, delivery date and refunded amount. Read-only.",
    inputSchema: lookupOrderInputSchema,
    risk: "read",
    async execute(input, ctx) {
        return getOwnedOrder(ctx, input.orderId);
    }
}