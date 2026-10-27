import { z } from "zod";

const usage = z.object({ inputTokens: z.number(), outputTokens: z.number() });
const stamp = { runId: z.string(), seq: z.number().int().nonnegative(), ts: z.string() };

/** One schema for every event: the TypeScript types are inferred from it, and saved traces are validated with it. */
export const traceEventSchema = z.union([
  z.object({ ...stamp, type: z.literal("run_start"), customerId: z.string(), maxSteps: z.number(), tools: z.array(z.string()) }),
  z.object({ ...stamp, type: z.literal("model_call"), messageCount: z.number(), latencyMs: z.number(), ok: z.literal(true), usage }),
  z.object({ ...stamp, type: z.literal("model_call"), messageCount: z.number(), latencyMs: z.number(), ok: z.literal(false), error: z.string() }),
  z.object({
    ...stamp,
    type: z.literal("model_response"),
    stopReason: z.string(),
    text: z.string(),
    toolCalls: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
  z.object({ ...stamp, type: z.literal("tool_call"), name: z.string(), input: z.unknown(), latencyMs: z.number(), ok: z.literal(true), output: z.unknown() }),
  z.object({
    ...stamp,
    type: z.literal("tool_call"),
    name: z.string(),
    input: z.unknown(),
    latencyMs: z.number(),
    ok: z.literal(false),
    error: z.string(),
    detail: z.string().optional(),
  }),
  // Declared now, emitted by guardrails (F7) and context management (F8).
  z.object({ ...stamp, type: z.literal("guardrail"), rule: z.string(), decision: z.enum(["deny", "needs_approval"]), reason: z.string() }),
  z.object({ ...stamp, type: z.literal("context"), action: z.string(), tokensBefore: z.number(), tokensAfter: z.number() }),
  z.object({ ...stamp, type: z.literal("run_end"), stopReason: z.string(), steps: z.number(), usage }),
]);

export type TraceEvent = z.infer<typeof traceEventSchema>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What emitters pass in; the tracer adds runId, seq and ts. */
export type TraceEventInput = DistributiveOmit<TraceEvent, "runId" | "seq" | "ts">;