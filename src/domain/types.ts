export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  totalCents: number;
  status: OrderStatus;
  deliveredAt?: string; // ISO date; only set when status === "delivered"
  refundedCents: number;
}

export interface OrderItem {
  sku: string;
  name: string;
  priceCents: number;
  qty: number;
}

export type OrderStatus = "delivered" | "shipped" | "cancelled" ;

export interface Refund {
  id: string;
  orderId: string;
  cents: number;
  reason: string;
}

export interface Ticket {
  id: string;
  customerId: string;
  summary: string;
  urgency: "low" | "normal" | "high";
  createdAt: string; // ISO date
}

export type DomainErrorCode =
  | "ORDER_NOT_FOUND"
  | "INVALID_AMOUNT"
  | "ORDER_NOT_DELIVERED"
  | "OVER_REFUND"
  |"REFUND_NOT_ELIGIBLE";
 
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
