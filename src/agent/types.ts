import type { Message, ModelClient, ModelResponse } from "../llm/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";

export type StopReason = "final_answer" | "max_steps" | "model_error" | "guardrail_abort" | "context_overflow" ;

export interface AgentConfig {
    model: ModelClient;
    registry: ToolRegistry;
    systemPrompt: string;
    messages: Message[];
    maxSteps: number;
    ctx: ToolContext;
}

export interface AgentResult {
    stopReason: StopReason;
    finalText?: string;
    messages: Message[];
    steps: number;
    usage: ModelResponse["usage"];
}