import Anthropic from "@anthropic-ai/sdk";

import {
  ModelError,
  type ContentBlock,
  type Message,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
} from "./types.js";

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;

/** The slice of the SDK we use. Tests pass a fake with this shape; the real client satisfies it. */
export interface SdkClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<
      Pick<Anthropic.Message, "content" | "stop_reason"> & {
        usage: Pick<Anthropic.Message["usage"], "input_tokens" | "output_tokens">;
      }
    >;
  };
}

function toSdkBlock(block: ContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "thinking":
      return { type: "thinking", thinking: block.thinking, signature: block.signature };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.toolUseId,
        content: block.content,
        is_error: block.isError ?? false,
      };
  }
}

function toSdkMessage(message: Message): Anthropic.MessageParam {
  return { role: message.role, content: message.content.map(toSdkBlock) };
}

function toStopReason(reason: string | null): ModelResponse["stopReason"] {
  if (reason === "end_turn" || reason === "tool_use" || reason === "max_tokens") return reason;
  // refusal, pause_turn, stop_sequence: our loop has no handling for these yet.
  throw new ModelError("invalid_request", `Unsupported stop_reason from model: ${reason}`);
}

/** Maps SDK errors to ModelError. Most specific class first; non-SDK errors are bugs and propagate. */
function toModelError(err: unknown): unknown {
  if (err instanceof Anthropic.RateLimitError) return new ModelError("rate_limit", err.message, { cause: err });
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ModelError("auth", err.message, { cause: err });
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
    return new ModelError("invalid_request", err.message, { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError || (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500)) {
    return new ModelError("server_error", err.message, { cause: err });
  }
  return err;
}

export class AnthropicModel implements ModelClient {
  private readonly client: SdkClient;
  private readonly model: string;

  /** With no client, the SDK reads ANTHROPIC_API_KEY from the environment itself. */
  constructor(options: { client?: SdkClient; model?: string } = {}) {
    this.client = options.client ?? new Anthropic();
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: req.system,
        messages: req.messages.map(toSdkMessage),
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: { ...t.inputSchema, type: "object" as const },
        })),
      });

      const content: ContentBlock[] = [];
      for (const block of res.content) {
        if (block.type === "text") content.push({ type: "text", text: block.text });
        else if (block.type === "thinking") content.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
        else if (block.type === "tool_use") content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
        // thinking and other block types are not part of our ContentBlock model.
      }

      return {
        content,
        stopReason: toStopReason(res.stop_reason),
        usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
      };
    } catch (err) {
      throw toModelError(err);
    }
  }
}