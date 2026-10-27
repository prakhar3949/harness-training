import type { ToolSchema } from "../tools/types.js";

export type ContentBlock =
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string; signature: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export type Message = {
    role: "assistant" | "user";
    content: ContentBlock[];
};

export interface ModelRequest {
    system: string;
    messages: Message[];
    tools: ToolSchema[];
};

export interface ModelResponse {
    content: ContentBlock[];
    stopReason: "end_turn" | "tool_use" | "max_tokens";
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
}

export interface ModelClient {
    complete(req: ModelRequest): Promise<ModelResponse>;
}

export type ModelErrorKind = "rate_limit" | "server_error" | "invalid_request" | "auth";

/** The only error a ModelClient may throw. The agent loop (F4) catches it and stops with `model_error`. */
export class ModelError extends Error {
  readonly kind: ModelErrorKind;

  constructor(kind: ModelErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ModelError";
    this.kind = kind;
  }
}