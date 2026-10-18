import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
import type { ToolSchema } from "../tools/types.js";
import {
  ModelError,
  type ContentBlock,
  type Message,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
} from "./types.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** The slice of the SDK we use. Tests pass a fake with this shape; the real client satisfies it. */
export interface GeminiSdkClient {
  models: {
    generateContent(
      params: GenerateContentParameters,
    ): Promise<Pick<GenerateContentResponse, "candidates" | "usageMetadata">>;
  };
}

/** Gemini answers a tool call by function name, which our tool_result doesn't carry. */
function toolNamesById(messages: Message[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === "tool_use") names.set(block.id, block.name);
    }
  }
  return names;
}

function toArgs(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? { ...input } : {};
}

function toGeminiPart(block: Exclude<ContentBlock, { type: "thinking" }>, toolNames: Map<string, string>): Part {
  switch (block.type) {
    case "text":
      return { text: block.text };
    case "tool_use":
      return { functionCall: { id: block.id, name: block.name, args: toArgs(block.input) } };
    case "tool_result": {
      const name = toolNames.get(block.toolUseId);
      if (!name) throw new Error(`tool_result ${block.toolUseId} has no matching tool_use in the history`);
      const response = block.isError ? { error: block.content } : { output: block.content };
      return { functionResponse: { id: block.toolUseId, name, response } };
    }
  }
}

function toGeminiContent(message: Message, toolNames: Map<string, string>): Content {
  const parts: Part[] = [];
  let pendingSignature: string | undefined;
  for (const block of message.content) {
    // Gemini puts the signature on the part that follows the reasoning, not in its own part.
    if (block.type === "thinking") {
      pendingSignature = block.signature;
      continue;
    }
    const part = toGeminiPart(block, toolNames);
    if (pendingSignature) {
      part.thoughtSignature = pendingSignature;
      pendingSignature = undefined;
    }
    parts.push(part);
  }
  return { role: message.role === "assistant" ? "model" : "user", parts };
}

function toFunctionDeclaration(tool: ToolSchema): FunctionDeclaration {
  return { name: tool.name, description: tool.description, parametersJsonSchema: tool.inputSchema };
}

function fromGeminiParts(parts: Part[]): ContentBlock[] {
  const content: ContentBlock[] = [];
  parts.forEach((part, index) => {
    if (part.thoughtSignature) content.push({ type: "thinking", thinking: "", signature: part.thoughtSignature });
    if (part.thought) return; // thought summaries; we don't request them
    if (part.functionCall) {
      const name = part.functionCall.name ?? "";
      const id = part.functionCall.id ?? `call_${index}_${name}`;
      content.push({ type: "tool_use", id, name, input: part.functionCall.args ?? {} });
    } else if (part.text !== undefined) {
      content.push({ type: "text", text: part.text });
    }
  });
  return content;
}

function toStopReason(finish: FinishReason | undefined, content: ContentBlock[]): ModelResponse["stopReason"] {
  // Gemini reports STOP even when it calls a tool, so the content decides.
  if (content.some((block) => block.type === "tool_use")) return "tool_use";
  if (finish === FinishReason.STOP) return "end_turn";
  if (finish === FinishReason.MAX_TOKENS) return "max_tokens";
  throw new ModelError("invalid_request", `Gemini stopped with finishReason ${finish ?? "none"}`);
}

/** Maps SDK errors to ModelError by HTTP status; non-SDK errors are bugs and propagate. */
function toModelError(err: unknown): unknown {
  if (!(err instanceof ApiError)) return err;
  if (err.status === 429) return new ModelError("rate_limit", err.message, { cause: err });
  if (err.status === 401 || err.status === 403) return new ModelError("auth", err.message, { cause: err });
  if (err.status >= 500) return new ModelError("server_error", err.message, { cause: err });
  return new ModelError("invalid_request", err.message, { cause: err });
}

export class GeminiModel implements ModelClient {
  private readonly client: GeminiSdkClient;
  private readonly model: string;

  /** With no client, the SDK reads GEMINI_API_KEY from the environment itself. */
  constructor(options: { client?: GeminiSdkClient; model?: string } = {}) {
    this.client = options.client ?? new GoogleGenAI();
    this.model = options.model ?? DEFAULT_GEMINI_MODEL;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const toolNames = toolNamesById(req.messages);
    const config: GenerateContentConfig = { systemInstruction: req.system };
    if (req.tools.length > 0) config.tools = [{ functionDeclarations: req.tools.map(toFunctionDeclaration) }];

    let res: Awaited<ReturnType<GeminiSdkClient["models"]["generateContent"]>>;
    try {
      res = await this.client.models.generateContent({
        model: this.model,
        contents: req.messages.map((message) => toGeminiContent(message, toolNames)),
        config,
      });
    } catch (err) {
      throw toModelError(err);
    }

    const candidate = res.candidates?.[0];
    if (!candidate) throw new ModelError("invalid_request", "Gemini returned no candidates (the prompt may have been blocked).");

    const content = fromGeminiParts(candidate.content?.parts ?? []);
    const usage = res.usageMetadata;
    return {
      content,
      stopReason: toStopReason(candidate.finishReason, content),
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        // Gemini counts thinking separately; both are billed as output.
        outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      },
    };
  }
}
