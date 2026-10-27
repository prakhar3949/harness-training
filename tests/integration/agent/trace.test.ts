import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { runAgentLoop } from "../../../src/agent/loop.js";
import { buildSystemPrompt } from "../../../src/agent/prompt.js";
import { InMemoryOrderStore, seedOrders, SEED_CUSTOMER_ID, SEED_NOW } from "../../../src/domain/store.js";
import { ScriptedModel, textResponse, toolCallResponse } from "../../../src/llm/scripted.js";
import { ModelError } from "../../../src/llm/types.js";
import { parseTrace, summarize } from "../../../src/telemetry/summarize.js";
import { JsonlTracer, MemoryTracer, type Tracer } from "../../../src/telemetry/tracer.js";
import { makeRegistry } from "../../unit/tools/helpers.js";

const options = { runId: "run_test", now: () => SEED_NOW };

const refundSmallOrder = () => [
  toolCallResponse("lookup_order", { orderId: "ord_small" }),
  toolCallResponse("check_refund_policy", { orderId: "ord_small" }),
  toolCallResponse("issue_refund", { orderId: "ord_small", refundCents: 2499, reason: "Mug arrived broken" }),
  textResponse("Done: $24.99 is on its way back to you."),
];

function runTraced(tracer: Tracer, script: ConstructorParameters<typeof ScriptedModel>[0] = refundSmallOrder()) {
  return runAgentLoop({
    model: new ScriptedModel(script),
    registry: makeRegistry(),
    systemPrompt: buildSystemPrompt(),
    messages: [{ role: "user", content: [{ type: "text", text: "Please refund ord_small" }] }],
    maxSteps: 10,
    ctx: { store: new InMemoryOrderStore(seedOrders()), now: () => SEED_NOW, customerId: SEED_CUSTOMER_ID, tracer },
  });
}

describe("tracing a run", () => {
  it("records the expected events in order, with seq strictly increasing", async () => {
    const tracer = new MemoryTracer(options);
    await runTraced(tracer);

    expect(tracer.events.map((event) => event.type)).toEqual([
      "run_start",
      "model_call", "model_response", "tool_call",
      "model_call", "model_response", "tool_call",
      "model_call", "model_response", "tool_call",
      "model_call", "model_response",
      "run_end",
    ]);
    tracer.events.forEach((event, index) => expect(event.seq).toBe(index));
    expect(tracer.events.at(-1)).toMatchObject({ type: "run_end", stopReason: "final_answer", steps: 4 });
  });

  it("records a failed tool call as ok:false with the error text", async () => {
    const tracer = new MemoryTracer(options);
    await runTraced(tracer, [toolCallResponse("issue_refund", { orderId: "ord_small", refundCents: "24.99" }), textResponse("Sorry.")]);

    expect(tracer.events.find((event) => event.type === "tool_call")).toMatchObject({
      name: "issue_refund",
      ok: false,
      error: expect.stringContaining("Invalid input for issue_refund"),
    });
  });

  it("records a model failure and still ends the run", async () => {
    const tracer = new MemoryTracer(options);
    await runTraced(tracer, () => {
      throw new ModelError("rate_limit", "slow down");
    });

    expect(tracer.events.map((event) => event.type)).toEqual(["run_start", "model_call", "run_end"]);
    expect(tracer.events[1]).toMatchObject({ ok: false, error: "rate_limit: slow down" });
    expect(tracer.events[2]).toMatchObject({ stopReason: "model_error" });
  });

  it("round-trips through a JSONL file and summarize without data loss", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-"));
    try {
      const file = join(dir, "run.jsonl");
      const memory = new MemoryTracer(options);
      await runTraced(memory);
      await runTraced(new JsonlTracer(file, options));

      const fromFile = parseTrace(readFileSync(file, "utf8"));

      expect(fromFile).toEqual(memory.events);
      expect(summarize(fromFile)).toBe(summarize(memory.events));
      expect(readFileSync(join(dir, "latest.jsonl"), "utf8")).toBe(readFileSync(file, "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
