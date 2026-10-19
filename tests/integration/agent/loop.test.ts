import { describe, it, expect } from "vitest";
import { runAgentLoop } from "../../../src/agent/loop.js";
import { buildSystemPrompt } from "../../../src/agent/prompt.js";
import { InMemoryOrderStore, seedOrders, SEED_CUSTOMER_ID, SEED_NOW } from "../../../src/domain/store.js";
import { ScriptedModel, textResponse, toolCallResponse } from "../../../src/llm/scripted.js";
import { ModelError, type ContentBlock, type Message, type ModelResponse } from "../../../src/llm/types.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { lookupOrder } from "../../../src/tools/lookup_order.js";
import { checkRefundPolicy } from "../../../src/tools/check_refund_policy.js";
import { issueRefund } from "../../../src/tools/issue_refund.js";
import { escalateToHuman } from "../../../src/tools/escalate_to_human.js";

const userSays = (text: string): Message[] => [{ role: "user", content: [{ type: "text", text }] }];

function setup(script: ConstructorParameters<typeof ScriptedModel>[0], messages = userSays("Please refund ord_small")) {
  const store = new InMemoryOrderStore(seedOrders());
  const model = new ScriptedModel(script);
  const registry = new ToolRegistry()
    .register(lookupOrder)
    .register(checkRefundPolicy)
    .register(issueRefund)
    .register(escalateToHuman);
  const run = (maxSteps = 10) =>
    runAgentLoop({
      model,
      registry,
      systemPrompt: buildSystemPrompt(),
      messages,
      maxSteps,
      ctx: { store, now: () => SEED_NOW, customerId: SEED_CUSTOMER_ID },
    });
  return { store, model, messages, run };
}

function toolResults(messages: Message[]) {
  return messages.flatMap((m) => m.content).filter((b) => b.type === "tool_result");
}

/** Every assistant tool_use is answered by the next message, with the same ids in the same order. */
function expectWellFormed(messages: Message[]) {
  messages.forEach((message, i) => {
    const ids = message.content.filter((b) => b.type === "tool_use").map((b) => b.id);
    if (ids.length === 0) return;
    const answered = (messages[i + 1]?.content ?? []).filter((b) => b.type === "tool_result").map((b) => b.toolUseId);
    expect(answered).toEqual(ids);
  });
}

describe("runAgentLoop", () => {
  it("refunds a small delivered order: lookup → policy → refund → final text", async () => {
    const { store, messages, run } = setup([
      toolCallResponse("lookup_order", { orderId: "ord_small" }),
      toolCallResponse("check_refund_policy", { orderId: "ord_small" }),
      toolCallResponse("issue_refund", { orderId: "ord_small", refundCents: 2499, reason: "Mug arrived broken" }),
      textResponse("Done: $24.99 is on its way back to you."),
    ]);

    const result = await run();

    expect(result.stopReason).toBe("final_answer");
    expect(result.finalText).toBe("Done: $24.99 is on its way back to you.");
    expect(result.steps).toBe(4);
    expect(store.listRefunds()).toEqual([{ id: "ref_1", orderId: "ord_small", cents: 2499, reason: "Mug arrived broken" }]);
    expect(toolResults(result.messages).every((r) => !r.isError)).toBe(true);
    expect(messages).toHaveLength(1); // the caller's array was not mutated
  });

  it("explains and records no refund for an order outside the window (day 31)", async () => {
    const { store, run } = setup(
      [
        toolCallResponse("lookup_order", { orderId: "ord_day31" }),
        toolCallResponse("check_refund_policy", { orderId: "ord_day31" }),
        textResponse("Sorry, that order is past the 30-day refund window."),
      ],
      userSays("Refund ord_day31 please"),
    );

    const result = await run();

    expect(result.stopReason).toBe("final_answer");
    expect(store.listRefunds()).toEqual([]);
    const policy = toolResults(result.messages)[1];
    expect(policy?.content).toContain("OUTSIDE_WINDOW");
  });

  it("stops at max_steps when the model never stops calling tools, with messages well-formed", async () => {
    const { run } = setup((req) => toolCallResponse("lookup_order", { orderId: "ord_small" }, `call_${req.messages.length}`));

    const result = await run(3);

    expect(result.stopReason).toBe("max_steps");
    expect(result.steps).toBe(3);
    expect(result.messages).toHaveLength(1 + 3 * 2);
    expect(result.messages.at(-1)?.role).toBe("user");
    expectWellFormed(result.messages);
  });

  it("feeds a bad-args tool error back, and the model corrects itself", async () => {
    const { store, run } = setup([
      toolCallResponse("issue_refund", { orderId: "ord_small", refundCents: "24.99" }),
      toolCallResponse("issue_refund", { orderId: "ord_small", refundCents: 2499, reason: "Broken" }),
      textResponse("Refunded $24.99."),
    ]);

    const result = await run();

    const [bad, good] = toolResults(result.messages);
    expect(bad?.isError).toBe(true);
    expect(bad?.content).toMatch(/Invalid input for issue_refund/);
    expect(good?.isError).toBeUndefined();
    expect(store.listRefunds()).toHaveLength(1);
    expect(result.stopReason).toBe("final_answer");
  });

  it("returns model_error when the model throws ModelError, without crashing", async () => {
    const { run } = setup(() => {
      throw new ModelError("rate_limit", "slow down");
    });

    const result = await run();

    expect(result.stopReason).toBe("model_error");
    expect(result.steps).toBe(0);
    expect(result.messages).toHaveLength(1);
  });

  it("runs and answers two tool calls from one turn", async () => {
    const twoCalls: ModelResponse = {
      content: [
        { type: "tool_use", id: "a", name: "lookup_order", input: { orderId: "ord_small" } },
        { type: "tool_use", id: "b", name: "lookup_order", input: { orderId: "ord_large" } },
      ],
      stopReason: "tool_use",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    const { run } = setup([twoCalls, textResponse("Found both orders.")]);

    const result = await run();

    const answers = result.messages[2]?.content ?? [];
    expect(answers.map((b) => b.type === "tool_result" && b.toolUseId)).toEqual(["a", "b"]);
    expect(toolResults(result.messages).every((r) => !r.isError)).toBe(true);
    expectWellFormed(result.messages);
  });

  it("keeps thinking blocks in the assistant message", async () => {
    const thinking: ContentBlock = { type: "thinking", thinking: "", signature: "sig" };
    const { run } = setup([
      { ...toolCallResponse("lookup_order", { orderId: "ord_small" }), content: [thinking, { type: "tool_use", id: "t1", name: "lookup_order", input: { orderId: "ord_small" } }] },
      textResponse("Here it is."),
    ]);

    const result = await run();

    expect(result.messages[1]?.content[0]).toEqual(thinking);
  });

  it("adds up token usage across steps", async () => {
    const withUsage = (r: ModelResponse, inputTokens: number, outputTokens: number): ModelResponse => ({ ...r, usage: { inputTokens, outputTokens } });
    const { run } = setup([
      withUsage(toolCallResponse("lookup_order", { orderId: "ord_small" }), 100, 10),
      withUsage(textResponse("Done."), 150, 20),
    ]);

    const result = await run();

    expect(result.usage).toEqual({ inputTokens: 250, outputTokens: 30 });
  });
  it("treats an empty model reply as model_error and keeps it out of the history", async () => {
    const { run } = setup([{ content: [], stopReason: "end_turn", usage: { inputTokens: 0, outputTokens: 0 } }]);

    const result = await run();

    expect(result.stopReason).toBe("model_error");
    expect(result.steps).toBe(1);
    expect(result.messages).toHaveLength(1);
  });

});
