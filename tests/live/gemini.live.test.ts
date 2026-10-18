import { describe, it, expect } from "vitest";
import { z } from "zod";
import { GeminiModel } from "../../src/llm/gemini.js";
import type { Message } from "../../src/llm/types.js";

describe.skipIf(!process.env.GEMINI_API_KEY)("GeminiModel (live)", () => {
  const model = new GeminiModel();

  it("returns text for a simple prompt", async () => {
    const res = await model.complete({
      system: "Reply with one short word.",
      messages: [{ role: "user", content: [{ type: "text", text: "Say hello." }] }],
      tools: [],
    });
    expect(res.stopReason).toBe("end_turn");
    expect(res.content.some((block) => block.type === "text")).toBe(true);
  });

  it("completes a tool call round trip", async () => {
    const system = "You are a support agent. Always use tools to look up orders.";
    const tools = [
      {
        name: "lookup_order",
        description: "Look up an order by its id.",
        inputSchema: z.toJSONSchema(z.object({ orderId: z.string() }), { io: "input" }),
      },
    ];
    const messages: Message[] = [{ role: "user", content: [{ type: "text", text: "What is the status of order ord_1?" }] }];

    const first = await model.complete({ system, messages, tools });
    const call = first.content.find((block) => block.type === "tool_use");
    expect(call).toBeDefined();
    if (call?.type !== "tool_use") return;

    messages.push({ role: "assistant", content: first.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", toolUseId: call.id, content: JSON.stringify({ id: "ord_1", status: "delivered" }) }],
    });

    const second = await model.complete({ system, messages, tools });
    expect(second.stopReason).toBe("end_turn");
  });
});
