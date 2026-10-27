import { z } from "zod";
import { traceEventSchema, type TraceEvent } from "./types.js";

/** Parses a JSONL trace and validates every line (GP-06). Throws with the line number on bad input. */
export function parseTrace(text: string): TraceEvent[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.map((line, index) => {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error(`Line ${index + 1} is not valid JSON`);
    }
    const parsed = traceEventSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`Line ${index + 1} is not a trace event:\n${z.prettifyError(parsed.error)}`);
    return parsed.data;
  });
}

/** A header with totals, then one line per event with its time offset from the start of the run. */
export function summarize(events: TraceEvent[]): string {
  const first = events[0];
  const end = events.find((event) => event.type === "run_end");
  const toolCalls = events.filter((event) => event.type === "tool_call");
  const failed = toolCalls.filter((event) => !event.ok).length;
  const start = first ? Date.parse(first.ts) : 0;
  const last = events.at(-1);

  const header = [
    `run ${first?.runId ?? "(empty trace)"}`,
    `stop: ${end?.stopReason ?? "(no run_end: the run did not finish)"}`,
    `steps: ${end?.steps ?? "?"}`,
    `tool calls: ${toolCalls.length} (${failed} failed)`,
    `tokens: in ${end?.usage.inputTokens ?? 0}, out ${end?.usage.outputTokens ?? 0}`,
    `wall time: ${last ? Date.parse(last.ts) - start : 0} ms`,
  ];
  const timeline = events.map(
    (event) => `${`+${Date.parse(event.ts) - start}ms`.padStart(9)}  #${String(event.seq).padEnd(3)} ${event.type.padEnd(15)} ${describeEvent(event)}`,
  );
  return [...header, "", ...timeline].join("\n");
}

function describeEvent(event: TraceEvent): string {
  switch (event.type) {
    case "run_start":
      return `customer ${event.customerId}, max ${event.maxSteps} steps, tools: ${event.tools.join(", ")}`;
    case "model_call":
      return event.ok
        ? `${event.messageCount} messages → in ${event.usage.inputTokens}, out ${event.usage.outputTokens} tokens (${event.latencyMs} ms)`
        : `FAILED ${event.error} (${event.latencyMs} ms)`;
    case "model_response":
      return event.toolCalls.length > 0 ? `asks for ${event.toolCalls.map((call) => call.name).join(", ")}` : `says "${shorten(event.text)}"`;
    case "tool_call":
      return event.ok ? `${event.name} ok (${event.latencyMs} ms)` : `${event.name} FAILED: ${shorten(event.error)}`;
    case "guardrail":
      return `${event.rule}: ${event.decision} (${event.reason})`;
    case "context":
      return `${event.action}: ${event.tokensBefore} → ${event.tokensAfter} tokens`;
    case "run_end":
      return `${event.stopReason} after ${event.steps} steps`;
  }
}

function shorten(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}
