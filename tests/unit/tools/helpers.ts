import { InMemoryOrderStore, seedOrders, SEED_NOW, SEED_CUSTOMER_ID } from "../../../src/domain/store.js";
import type { ToolContext } from "../../../src/tools/types.ts";

/** Fresh seeded store per call, so tests never share refund/ticket state. */
export function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
        store: new InMemoryOrderStore(seedOrders()),
        now: () => SEED_NOW,
        customerId: SEED_CUSTOMER_ID,
        ...overrides,
    };
}