import {z} from "zod";
import type { Tool } from "./types.ts";

const escalateInput = z.object({
  summary: z.string().min(10).describe("What the customer needs, in one or two sentences"),
  urgency: z.enum(["low", "normal", "high"]).default("normal"),
});

type EscalateInput = z.infer<typeof escalateInput>;

type EscalateOutput = {ticketId: string};

export const escalateToHuman: Tool<EscalateInput, EscalateOutput> = {
    name: "escalate_to_human",
    description: "Hands the conversation to a human support agent by creating a ticket. " +
    "Use when the request is outside refund policy, the customer is upset, " +
    "or you are unsure. Returns a ticketId. Does not issue refunds or change orders.",
    inputSchema: escalateInput,
    risk: "write",
    async execute(input, ctx) {
        const ticket = ctx.store.createTicket(
            ctx.customerId,
            input.summary,
            input.urgency,
            ctx.now().toISOString(),
        );
        return { ticketId: ticket.id };
    },
};