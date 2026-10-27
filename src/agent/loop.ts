import { ModelError, type ContentBlock, type ModelClient, type ModelRequest, type ModelResponse } from "../llm/types.js";
import { noopTracer, type Tracer } from "../telemetry/tracer.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import type { AgentConfig, AgentResult } from "./types.js";

type ToolUse = Extract<ContentBlock, { type: "tool_use" }>;

/** The ReAct loop, traced: run_start, then model and tool events, then run_end. */
export async function runAgentLoop(config: AgentConfig): Promise<AgentResult> {
    const tracer = config.ctx.tracer ?? noopTracer;
    tracer.emit({
        type: "run_start",
        customerId: config.ctx.customerId,
        maxSteps: config.maxSteps,
        tools: config.registry.list().map((tool) => tool.name),
    });
    const result = await loop(config, tracer);
    tracer.emit({ type: "run_end", stopReason: result.stopReason, steps: result.steps, usage: result.usage });
    return result;
}

/** Ask the model, run the tools it asks for, feed the results back, repeat. */
async function loop(config: AgentConfig, tracer: Tracer): Promise<AgentResult> {
    const { model, registry, systemPrompt, maxSteps, ctx } = config;
    // A new array, so the caller's history is never mutated. We only ever append to it.
    const messages = [...config.messages];
    const tools = registry.toModelSchemas();
    const usage = { inputTokens: 0, outputTokens: 0 };
    let steps = 0;

    while (steps < maxSteps) {
        const response = await callModel(model, { system: systemPrompt, messages, tools }, ctx, tracer);
        if (response instanceof ModelError) return { stopReason: "model_error", messages, steps, usage };
        steps++;
        usage.inputTokens += response.usage.inputTokens;
        usage.outputTokens += response.usage.outputTokens;

        const calls = response.content.filter((block) => block.type === "tool_use");
        const text = extractText(response.content);
        tracer.emit({ type: "model_response", stopReason: response.stopReason, text, toolCalls: calls.map(({ id, name }) => ({ id, name })) });

        // An empty reply is a failure, not an answer; keeping it would also break the next API call.
        if (!response.content.some((block) => block.type === "text" || block.type === "tool_use")) {
            return { stopReason: "model_error", messages, steps, usage };
        }

        // Keep the whole response, thinking blocks included: providers need them back on the next call.
        messages.push({ role: "assistant", content: response.content });

        if (calls.length === 0) return { stopReason: "final_answer", finalText: text, messages, steps, usage };

        // One user message answers every call, in order. Sequential, so write tools run in a predictable order.
        const results: ContentBlock[] = [];
        for (const call of calls) results.push(await runTool(registry, call, ctx));
        messages.push({ role: "user", content: results });
    }

    return { stopReason: "max_steps", messages, steps, usage };
}

/** Calls the model and traces the call. A ModelError is returned as a value; any other error is a bug and propagates. */
async function callModel(model: ModelClient, req: ModelRequest, ctx: ToolContext, tracer: Tracer): Promise<ModelResponse | ModelError> {
    const started = ctx.now().getTime();
    try {
        const response = await model.complete(req);
        tracer.emit({ type: "model_call", messageCount: req.messages.length, latencyMs: ctx.now().getTime() - started, ok: true, usage: response.usage });
        return response;
    } catch (err) {
        if (!(err instanceof ModelError)) throw err;
        tracer.emit({ type: "model_call", messageCount: req.messages.length, latencyMs: ctx.now().getTime() - started, ok: false, error: `${err.kind}: ${err.message}` });
        return err;
    }
}

async function runTool(registry: ToolRegistry, call: ToolUse, ctx: ToolContext): Promise<ContentBlock> {
    const result = await registry.execute(call.name, call.input, ctx);
    if (result.ok) return { type: "tool_result", toolUseId: call.id, content: JSON.stringify(result.data) };
    return { type: "tool_result", toolUseId: call.id, content: result.error, isError: true };
}

function extractText(content: ContentBlock[]): string {
    return content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
}
