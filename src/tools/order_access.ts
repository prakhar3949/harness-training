import { DomainError, type Order } from "../domain/types.js";
import type { ToolContext } from "./types.ts";

/**
 * Fetches an order the current customer owns. A missing order and someone
 * else's order give the same error, so callers can't probe which IDs exist.
 */
export function getOwnedOrder(ctx: ToolContext, orderId: string): Order {
    const order = ctx.store.getOrder(orderId);
    if (!order || order.customerId !== ctx.customerId) {
        throw new DomainError("ORDER_NOT_FOUND", `Order ${orderId} not found. Ask the customer to double-check the ID.`);
    }
    return order;
}
