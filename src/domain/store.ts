import { DomainError, type Order, type Refund, type Ticket } from "./types.js";

export interface OrderStore {
  getOrder(id: string): Order | undefined;
  listOrdersByCustomer(customerId: string): Order[];
  recordRefund(orderId: string, cents: number, reason: string): Refund;
  createTicket(customerId: string, summary: string, urgency: Ticket["urgency"],createdAt: string): Ticket;
}

export class InMemoryOrderStore implements OrderStore {
  private orders = new Map<string, Order>();
  private refunds: Refund[] = [];
  private nextRefundSeq = 1;
  private tickets: Ticket[] = [];
  private nextTicketSeq = 1;

  constructor(orders: Order[] = []) {
    // Deep-copy so stores never share state with each other or the caller.
    for (const o of orders) this.orders.set(o.id, structuredClone(o));
  }

  getOrder(id: string): Order | undefined {
    const o = this.orders.get(id);
    return o ? structuredClone(o) : undefined;
  }

  listOrdersByCustomer(customerId: string): Order[] {
    return [...this.orders.values()]
      .filter((o) => o.customerId === customerId)
      .map((o) => structuredClone(o));
  }

  recordRefund(orderId: string, cents: number, reason: string): Refund {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new DomainError("ORDER_NOT_FOUND", `Order ${orderId} not found`);
    }
    if (!Number.isInteger(cents) || cents <= 0) {
      throw new DomainError("INVALID_AMOUNT", "Refund must be a positive integer number of cents");
    }
    if (order.status !== "delivered") {
      throw new DomainError("ORDER_NOT_DELIVERED", `Order ${orderId} is ${order.status}`);
    }
    const remaining = order.totalCents - order.refundedCents;
    if (cents > remaining) {
      throw new DomainError(
        "OVER_REFUND",
        `Refund of ${cents}c exceeds remaining balance of ${remaining}c on ${orderId}`,
      );
    }

    // NB: the 30-day window is policy (needs a clock) and is enforced by
    // evaluateRefund, not here. The store only guards data invariants.
    order.refundedCents += cents;
    const refund: Refund = { id: `ref_${this.nextRefundSeq++}`, orderId, cents, reason };
    this.refunds.push(refund);
    return { ...refund };
  }

  createTicket(customerId: string, summary: string, urgency: Ticket["urgency"], createdAt: string,): Ticket{ 
  const ticket: Ticket = { id: `tkt_${this.nextTicketSeq++}`, customerId, summary, urgency, createdAt };
  this.tickets.push(ticket);
  return { ...ticket };
  }
  
}

// ---------------------------------------------------------------------------
// Seed data. Dates are derived from an explicit `now`, so tests stay deterministic.
// ---------------------------------------------------------------------------

export const SEED_NOW = new Date("2026-09-30T12:00:00.000Z");
export const SEED_CUSTOMER_ID = "cust_1";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const daysAgo = (now: Date, n: number) => new Date(now.getTime() - n * MS_PER_DAY).toISOString();

export function seedOrders(now: Date = SEED_NOW): Order[] {
  return [
    { // 1. small delivered
      id: "ord_small",
      customerId: "cust_1",
      items: [{ sku: "MUG-01", name: "Ceramic Mug", priceCents: 2499, qty: 1 }],
      totalCents: 2499,
      status: "delivered",
      deliveredAt: daysAgo(now, 2),
      refundedCents: 0,
    },
    { // 2. large (> $100)
      id: "ord_large",
      customerId: "cust_1",
      items: [
        { sku: "HDPH-9", name: "Headphones", priceCents: 12999, qty: 1 },
        { sku: "CBL-2", name: "USB-C Cable", priceCents: 1299, qty: 2 },
      ],
      totalCents: 15597,
      status: "delivered",
      deliveredAt: daysAgo(now, 10),
      refundedCents: 0,
    },
    { // 3. boundary: exactly day 30 -> still eligible
      id: "ord_day30",
      customerId: "cust_1",
      items: [{ sku: "BKP-4", name: "Backpack", priceCents: 5900, qty: 1 }],
      totalCents: 5900,
      status: "delivered",
      deliveredAt: daysAgo(now, 30),
      refundedCents: 0,
    },
    { // 4. boundary: day 31 -> outside the window
      id: "ord_day31",
      customerId: "cust_1",
      items: [{ sku: "LMP-3", name: "Desk Lamp", priceCents: 3500, qty: 1 }],
      totalCents: 3500,
      status: "delivered",
      deliveredAt: daysAgo(now, 31),
      refundedCents: 0,
    },
    { // 5. already fully refunded
      id: "ord_full_refund",
      customerId: "cust_1",
      items: [{ sku: "TEE-L", name: "T-Shirt (L)", priceCents: 2000, qty: 1 }],
      totalCents: 2000,
      status: "delivered",
      deliveredAt: daysAgo(now, 5),
      refundedCents: 2000,
    },
    { // 6. partially refunded
      id: "ord_partial_refund",
      customerId: "cust_1",
      items: [{ sku: "SOCK-3", name: "Sock 3-pack", priceCents: 1500, qty: 4 }],
      totalCents: 6000,
      status: "delivered",
      deliveredAt: daysAgo(now, 7),
      refundedCents: 1500,
    },
    { // 7. shipped, not delivered
      id: "ord_shipped",
      customerId: "cust_1",
      items: [{ sku: "KB-75", name: "Keyboard", priceCents: 8900, qty: 1 }],
      totalCents: 8900,
      status: "shipped",
      refundedCents: 0,
    },
    { // 8. cancelled
      id: "ord_cancelled",
      customerId: "cust_1",
      items: [{ sku: "MSE-1", name: "Mouse", priceCents: 2900, qty: 1 }],
      totalCents: 2900,
      status: "cancelled",
      refundedCents: 0,
    },
    { // 9. different customer
      id: "ord_other_customer",
      customerId: "cust_2",
      items: [{ sku: "MUG-01", name: "Ceramic Mug", priceCents: 2499, qty: 2 }],
      totalCents: 4998,
      status: "delivered",
      deliveredAt: daysAgo(now, 3),
      refundedCents: 0,
    },
  ];
}