import type { Order } from "./types.js";

export const REFUND_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RefundReason =
  | "NOT_DELIVERED"
  | "MISSING_DELIVERY_DATE"
  | "OUTSIDE_WINDOW"
  | "FULLY_REFUNDED"
  | "INVALID_AMOUNT"
  | "EXCEEDS_REMAINING";

export interface RefundEvaluation {
  eligible: boolean;
  maxRefundableCents: number;
  reasons: RefundReason[];
}

/**
 * Pure: no I/O, no Date.now(). `now` is injected.
 *
 * Window rule: whole days elapsed since delivery = floor((now - deliveredAt) / 1 day).
 * Day 30 (30d 0h .. 30d 23h59m) is OK; day 31 and beyond is not.
 */
export function evaluateRefund(
  order: Order,
  requestedCents: number,
  now: Date,
): RefundEvaluation {
  const reasons: RefundReason[] = [];
  const remaining = Math.max(0, order.totalCents - order.refundedCents);

  let refundable = true;

  if (order.status !== "delivered") {
    reasons.push("NOT_DELIVERED");
    refundable = false;
  } else if (!order.deliveredAt) {
    reasons.push("MISSING_DELIVERY_DATE");
    refundable = false;
  } else {
    const daysSince = Math.floor(
      (now.getTime() - Date.parse(order.deliveredAt)) / MS_PER_DAY,
    );
    if (daysSince > REFUND_WINDOW_DAYS) {
      reasons.push("OUTSIDE_WINDOW");
      refundable = false;
    }
  }

  if (remaining === 0) {
    reasons.push("FULLY_REFUNDED");
  } else if (!Number.isInteger(requestedCents) || requestedCents <= 0) {
    reasons.push("INVALID_AMOUNT");
  } else if (requestedCents > remaining) {
    reasons.push("EXCEEDS_REMAINING");
  }

  return {
    eligible: reasons.length === 0,
    maxRefundableCents: refundable ? remaining : 0,
    reasons,
  };
}