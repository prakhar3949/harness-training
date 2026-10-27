import { describe, it, expect } from "vitest";
import { MemoryTracer, serializeEvent } from "../../../src/telemetry/tracer.js";
import { parseTrace, summarize } from "../../../src/telemetry/summarize.js";

const options = { runId: "run_1", now: () => new Date("2026-09-30T12:00:00.000Z") };

describe("MemoryTracer", () => {
  it("stamps runId, a seq from 0, and the clock's time", () => {
    const tracer = new MemoryTracer(options);
    tracer.emit({ type: "run_start", customerId: "cust_1", maxSteps: 5, tools: [] });
    tracer.emit({ type: "run_end", stopReason: "final_answer", steps: 0, usage: { inputTokens: 0, outputTokens: 0 } });
    expect(tracer.events.map(({ runId, seq, ts }) => ({ runId, seq, ts }))).toEqual([
      { runId: "run_1", seq: 0, ts: "2026-09-30T12:00:00.000Z" },
      { runId: "run_1", seq: 1, ts: "2026-09-30T12:00:00.000Z" },
    ]);
  });
});

describe("serializeEvent", () => {
  it("redacts apiKey fields and anything shaped like a Claude or Gemini key", () => {
    const tracer = new MemoryTracer(options);
    tracer.emit({
      type: "tool_call",
      name: "x",
      input: { apiKey: "plain-secret", note: "keys sk-ant-api03-SECRETSECRET and AIzaSyA1234567890abcdefghijkl" },
      latencyMs: 0,
      ok: true,
      output: { api_key: "other-secret" },
    });
    const [event] = tracer.events;
    if (!event) throw new Error("no event recorded");

    const line = serializeEvent(event);

    expect(line).not.toMatch(/plain-secret|other-secret|sk-ant|AIza/);
    expect(line.match(/\[REDACTED\]/g)).toHaveLength(4);
  });
});

describe("parseTrace", () => {
  it("names the bad line", () => {
    expect(() => parseTrace('{"type":"run_start"}\nnot json')).toThrow(/Line 1 is not a trace event/);
    expect(() => parseTrace("not json")).toThrow(/Line 1 is not valid JSON/);
  });
});

describe("summarize", () => {
  it("prints totals and one line per event", () => {
    const tracer = new MemoryTracer(options);
    tracer.emit({ type: "run_start", customerId: "cust_1", maxSteps: 5, tools: ["lookup_order"] });
    tracer.emit({ type: "tool_call", name: "lookup_order", input: {}, latencyMs: 3, ok: false, error: "Order ord_x not found" });
    tracer.emit({ type: "run_end", stopReason: "final_answer", steps: 1, usage: { inputTokens: 10, outputTokens: 4 } });

    const text = summarize(tracer.events);

    expect(text).toContain("stop: final_answer");
    expect(text).toContain("tool calls: 1 (1 failed)");
    expect(text).toContain("tokens: in 10, out 4");
    expect(text).toContain("lookup_order FAILED: Order ord_x not found");
    expect(text.split("\n")).toHaveLength(6 + 1 + 3);
  });

  it("says when a run did not finish", () => {
    const tracer = new MemoryTracer(options);
    tracer.emit({ type: "run_start", customerId: "cust_1", maxSteps: 5, tools: [] });
    expect(summarize(tracer.events)).toContain("no run_end");
  });
  
  it("keeps each event on one line, even when an error spans several", () => {
    const tracer = new MemoryTracer(options);
    tracer.emit({ type: "tool_call", name: "issue_refund", input: {}, latencyMs: 0, ok: false, error: "Invalid input:\n✖ expected number" });

    const lines = summarize(tracer.events).split("\n");

    expect(lines.at(-1)).toContain("issue_refund FAILED: Invalid input: ✖ expected number");
    expect(lines).toHaveLength(6 + 1 + 1);
  });
});
