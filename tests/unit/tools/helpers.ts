import { InMemoryOrderStore, seedOrders, SEED_NOW, SEED_CUSTOMER_ID } from "../../../src/domain/store.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { lookupOrder } from "../../../src/tools/lookup_order.js";
import { checkRefundPolicy } from "../../../src/tools/check_refund_policy.js";
import { issueRefund } from "../../../src/tools/issue_refund.js";
import { escalateToHuman } from "../../../src/tools/escalate_to_human.js";
import type { ToolContext } from "../../../src/tools/types.js";

/** A registry with all four Refund Desk tools, as unit and integration tests use it. */
export function makeRegistry(): ToolRegistry {
    return new ToolRegistry()
        .register(lookupOrder)
        .register(checkRefundPolicy)
        .register(issueRefund)
        .register(escalateToHuman);
}

/** Fresh seeded store per call, so tests never share refund/ticket state. */
export function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
        store: new InMemoryOrderStore(seedOrders()),
        now: () => SEED_NOW,
        customerId: SEED_CUSTOMER_ID,
        ...overrides,
    };
}