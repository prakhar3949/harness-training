import { ApiError, FinishReason, type Part } from "@google/genai";
import { describe, it, expect } from "vitest";
import { GeminiModel, type GeminiSdkClient } from "../../../src/llm/gemini.js";
import { ModelError, type ModelRequest } from "../../../src/llm/types.js";

type FakeResponse = Awaited<ReturnType<GeminiSdkClient["models"]["generateContent"]>>;
type SentParams = Parameters<GeminiSdkClient["models"]["generateContent"]>[0];

const usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 };

const req: ModelRequest = {
  system: "sys",
  messages: [{ role: "user", content: [{ type: "text", text: "refund please" }] }],
  tools: [{ name: "lookup_order", description: "d", inputSchema: { type: "object", properties: {} } }],
};

function reply(parts: Part[], finishReason = FinishReason.STOP): FakeResponse {
  return { candidates: [{ content: { role: "model", parts }, finishReason }], usageMetadata };
}

function fakeReturning(res: FakeResponse) {
  const calls: SentParams[] = [];
  const client: GeminiSdkClient = { models: { generateContent: async (p) => (calls.push(p), res) } };
  return { client, calls };
}

function fakeThrowing(err: unknown): GeminiSdkClient {
  return { models: { generateContent: async () => { throw err; } } };
}

describe("GeminiModel", () => {
  it("maps a text reply", async () => {
    const { client } = fakeReturning(reply([{ text: "hi" }]));
    const res = await new GeminiModel({ client }).complete(req);
    expect(res).toEqual({
      content: [{ type: "text", text: "hi" }],
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 7 },
    });
  });

  it("maps a function call and reports tool_use even though Gemini says STOP", async () => {
    const { client } = fakeReturning(reply([{ functionCall: { id: "fc1", name: "lookup_order", args: { orderId: "o1" } } }]));
    const res = await new GeminiModel({ client }).complete(req);
    expect(res.stopReason).toBe("tool_use");
    expect(res.content).toEqual([{ type: "tool_use", id: "fc1", name: "lookup_order", input: { orderId: "o1" } }]);
  });

  it("invents an id when Gemini omits one", async () => {
    const { client } = fakeReturning(reply([{ functionCall: { name: "lookup_order", args: {} } }]));
    const res = await new GeminiModel({ client }).complete(req);
    expect(res.content[0]).toMatchObject({ type: "tool_use", id: "call_0_lookup_order" });
  });

  it("turns a thought signature into a thinking block", async () => {
    const { client } = fakeReturning(
      reply([{ functionCall: { id: "fc1", name: "lookup_order", args: {} }, thoughtSignature: "sig" }]),
    );
    const res = await new GeminiModel({ client }).complete(req);
    expect(res.content[0]).toEqual({ type: "thinking", thinking: "", signature: "sig" });
    expect(res.content[1]).toMatchObject({ type: "tool_use", id: "fc1" });
  });

  it("sends system, tools and roles in Gemini shape", async () => {
    const { client, calls } = fakeReturning(reply([{ text: "ok" }]));
    await new GeminiModel({ client, model: "m" }).complete(req);
    expect(calls[0]).toMatchObject({
      model: "m",
      contents: [{ role: "user", parts: [{ text: "refund please" }] }],
      config: { systemInstruction: "sys", tools: [{ functionDeclarations: [{ name: "lookup_order" }] }] },
    });
  });

  it("leaves tools out when there are none", async () => {
    const { client, calls } = fakeReturning(reply([{ text: "ok" }]));
    await new GeminiModel({ client }).complete({ ...req, tools: [] });
    expect(calls[0]?.config?.tools).toBeUndefined();
  });

  it("sends the signature back and answers tool calls by name", async () => {
    const { client, calls } = fakeReturning(reply([{ text: "ok" }]));
    await new GeminiModel({ client }).complete({
      ...req,
      messages: [
        ...req.messages,
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "", signature: "sig" },
            { type: "tool_use", id: "t1", name: "lookup_order", input: { orderId: "o1" } },
          ],
        },
        { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "{}" }] },
      ],
    });
    const contents = calls[0]?.contents;
    expect(contents).toEqual([
      { role: "user", parts: [{ text: "refund please" }] },
      {
        role: "model",
        parts: [{ functionCall: { id: "t1", name: "lookup_order", args: { orderId: "o1" } }, thoughtSignature: "sig" }],
      },
      { role: "user", parts: [{ functionResponse: { id: "t1", name: "lookup_order", response: { output: "{}" } } }] },
    ]);
  });

  it("sends failed tool results under an error key", async () => {
    const { client, calls } = fakeReturning(reply([{ text: "ok" }]));
    await new GeminiModel({ client }).complete({
      ...req,
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "lookup_order", input: {} }] },
        { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "bad id", isError: true }] },
      ],
    });
    expect(calls[0]?.contents).toContainEqual({
      role: "user",
      parts: [{ functionResponse: { id: "t1", name: "lookup_order", response: { error: "bad id" } } }],
    });
  });

  it.each([
    ["rate_limit", 429],
    ["auth", 401],
    ["auth", 403],
    ["invalid_request", 400],
    ["server_error", 503],
  ])("maps ApiError to ModelError(%s) for status %i", async (kind, status) => {
    const model = new GeminiModel({ client: fakeThrowing(new ApiError({ message: "x", status })) });
    const err = await model.complete(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err instanceof ModelError && err.kind).toBe(kind);
  });

  it("treats a blocked prompt (no candidates) as invalid_request", async () => {
    const { client } = fakeReturning({ candidates: [], usageMetadata });
    const err = await new GeminiModel({ client }).complete(req).catch((e: unknown) => e);
    expect(err instanceof ModelError && err.kind).toBe("invalid_request");
  });

  it("treats a safety stop as invalid_request", async () => {
    const { client } = fakeReturning(reply([], FinishReason.SAFETY));
    await expect(new GeminiModel({ client }).complete(req)).rejects.toThrow(/SAFETY/);
  });

  it("lets non-SDK errors (programmer bugs) propagate unchanged", async () => {
    const model = new GeminiModel({ client: fakeThrowing(new TypeError("bug")) });
    await expect(model.complete(req)).rejects.toThrow(TypeError);
  });
});
