import { describe, it, expect } from "vitest";
import { AnthropicModel } from "../../src/llm/anthropic.js";

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("AnthropicModel (live)", () => {
  it("returns a text block for a simple prompt", async () => {
    const res = await new AnthropicModel().complete({
      system: "Reply with one short word.",
      messages: [{ role: "user", content: [{ type: "text", text: "Say hello." }] }],
      tools: [],
    });

    expect(res.stopReason).toBe("end_turn");
    expect(res.content.some((block) => block.type === "text")).toBe(true);
  });
});
