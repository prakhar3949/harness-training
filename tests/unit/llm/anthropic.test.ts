import Anthropic from "@anthropic-ai/sdk";
import { describe, it, expect } from "vitest";
import { AnthropicModel, type SdkClient } from "../../../src/llm/anthropic.js";
import { ModelError, type ModelRequest } from "../../../src/llm/types.js";

const req: ModelRequest = {
  system: "sys",
  messages: [
    { role: "user", content: [{ type: "text", text: "refund please" }] },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "lookup_order", input: { orderId: "o1" } }] },
    { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "{}", isError: true }] },
  ],
  tools: [{ name: "lookup_order", description: "d", inputSchema: { type: "object", properties: {} } }],
};

const usage = { input_tokens: 10, output_tokens: 5 };

function fakeReturning(res: Awaited<ReturnType<SdkClient["messages"]["create"]>>) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: SdkClient = { messages: { create: async (p) => (calls.push(p), res) } };
  return { client, calls };
}

function fakeThrowing(err: unknown): SdkClient {
  return { messages: { create: async () => { throw err; } } };
}

describe("AnthropicModel", () => {
  it("maps a text response", async () => {
    const { client } = fakeReturning({ content: [{ type: "text", text: "hi", citations: null }], stop_reason: "end_turn", usage });
    const res = await new AnthropicModel({ client }).complete(req);
    expect(res).toEqual({
      content: [{ type: "text", text: "hi" }],
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });
  it("maps a thinking response", async () => {
    const { client } = fakeReturning({
        content: [{ type: "thinking", thinking: "thinking...", signature: "sig" }],
        stop_reason: "end_turn",
        usage,
    });
    const res = await new AnthropicModel({ client }).complete(req);
    expect(res).toEqual({
      content: [{ type: "thinking", thinking: "thinking...", signature: "sig" }],
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });
  it("maps a tool_use response", async () => {
    const { client } = fakeReturning({
      content: [{ type: "tool_use", id: "t9", name: "lookup_order", input: { orderId: "o1" },  caller: { type: "direct" } }],
      stop_reason: "tool_use",
      usage,
    });
    const res = await new AnthropicModel({ client }).complete(req);
    expect(res.stopReason).toBe("tool_use");
    expect(res.content).toEqual([{ type: "tool_use", id: "t9", name: "lookup_order", input: { orderId: "o1" } }]);
  });

  it("sends our messages and tools in SDK shape", async () => {
    const { client, calls } = fakeReturning({ content: [], stop_reason: "end_turn", usage });
    await new AnthropicModel({ client, model: "m" }).complete(req);
    const sent = calls[0];
    expect(sent?.model).toBe("m");
    expect(sent?.system).toBe("sys");
    expect(sent?.messages[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "{}", is_error: true }],
    });
    expect(sent?.tools?.[0]).toMatchObject({ name: "lookup_order", input_schema: { type: "object" } });
  });

  it.each([
    ["rate_limit", new Anthropic.RateLimitError(429, undefined, "slow down", new Headers())],
    ["auth", new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers())],
    ["invalid_request", new Anthropic.BadRequestError(400, undefined, "nope", new Headers())],
    ["server_error", new Anthropic.InternalServerError(500, undefined, "boom", new Headers())],
  ])("maps SDK error to ModelError(%s)", async (kind, sdkError) => {
    const model = new AnthropicModel({ client: fakeThrowing(sdkError) });
    const err = await model.complete(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err instanceof ModelError && err.kind).toBe(kind);
  });

  it("lets non-SDK errors (programmer bugs) propagate unchanged", async () => {
    const model = new AnthropicModel({ client: fakeThrowing(new TypeError("bug")) });
    await expect(model.complete(req)).rejects.toThrow(TypeError);
  });
});
