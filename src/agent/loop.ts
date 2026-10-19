import type {AgentConfig, AgentResult} from "./types.js";
import {ModelError, type ContentBlock ,type ModelResponse} from "../llm/types.js";
import type {ToolRegistry} from "../tools/registry.js";
import type {ToolContext} from "../tools/types.js";

type ToolUse = Extract<ContentBlock, { type: "tool_use" }>;

/** The ReAct loop: ask the model, run the tools it asks for, feed the results back, repeat. */
export async function runAgentLoop(config: AgentConfig): Promise<AgentResult> {
    const { model, registry, systemPrompt, maxSteps, ctx } = config;
    // A new array, so the caller's history is never mutated. We only ever append to it.
    const messages = [...config.messages];
    const tools = registry.toModelSchemas();
    const usage = { inputTokens: 0, outputTokens: 0 };
    let steps = 0;
    
    while (steps < maxSteps) {
        let response: ModelResponse;
        try {
            response = await model.complete({ system: systemPrompt, messages, tools });
        } catch (err) {
            if (err instanceof ModelError) return { stopReason: "model_error", messages, steps, usage };
            throw err; // unexpected bug in the code, not a model error.

        }
        steps++;
        usage.inputTokens += response.usage.inputTokens;
        usage.outputTokens += response.usage.outputTokens;

        //Keep the whole response, thinking boxes included: providers need them back on the next call.
        messages.push({ role: "assistant", content: response.content });

        const calls = response.content.filter((block) => block.type === "tool_use");

        if (calls.length === 0) {
            return { stopReason: "final_answer", finalText: extractText(response.content), messages, steps, usage };
        }

         // One user message answers every call, in order. Sequential, so write tools run in a predictable order.
        const results: ContentBlock[] = [];
        for (const call of calls) results.push(await runTool(registry, call, ctx));
        messages.push({ role: "user", content: results });
  }

  return { stopReason: "max_steps", messages, steps, usage };
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function runTool(registry: ToolRegistry, call: ToolUse, ctx: ToolContext): Promise<ContentBlock> {
  const result = await registry.execute(call.name, call.input, ctx);
  if (result.ok) return { type: "tool_result", toolUseId: call.id, content: JSON.stringify(result.data) };
  return { type: "tool_result", toolUseId: call.id, content: result.error, isError: true };
}
