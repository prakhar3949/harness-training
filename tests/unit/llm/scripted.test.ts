import { describe, it, expect } from "vitest";
import { ScriptedModel, textResponse, toolCallResponse } from "../../../src/llm/scripted.js";
import type { ModelRequest } from "../../../src/llm/types.js";

const req: ModelRequest = { system: "sys", messages: [], tools: [] };

describe("ScriptedModel", () => {
  it("returns responses in order", async () => {
    const model = new ScriptedModel([toolCallResponse("lookup_order", { orderId: "o1" }), textResponse("done")]);
    expect((await model.complete(req)).stopReason).toBe("tool_use");
    expect((await model.complete(req)).stopReason).toBe("end_turn");
  });

  it("throws a clear error when the script runs out", async () => {
    const model = new ScriptedModel([textResponse("only one")]);
    await model.complete(req);
    await expect(model.complete(req)).rejects.toThrow(/ran out of responses/);
  });

  it("records every request, as a snapshot", async () => {
    const model = new ScriptedModel([textResponse("a"), textResponse("b")]);
    const messages: ModelRequest["messages"] = [];
    await model.complete({ ...req, messages });
    messages.push({ role: "user", content: [{ type: "text", text: "later" }] });
    await model.complete({ ...req, messages });

    expect(model.requests).toHaveLength(2);
    expect(model.requests[0]?.messages).toHaveLength(0);
    expect(model.requests[1]?.messages).toHaveLength(1);
  });

  it("accepts a function script", async () => {
    const model = new ScriptedModel((r) => textResponse(`system was ${r.system}`));
    const res = await model.complete(req);
    expect(res.content).toEqual([{ type: "text", text: "system was sys" }]);
  });
});
