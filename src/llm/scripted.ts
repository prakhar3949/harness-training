import type { ModelClient, ModelRequest, ModelResponse } from "./types.js";

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

export function textResponse(text: string): ModelResponse {
  return { content: [{ type: "text", text }], stopReason: "end_turn", usage: NO_USAGE };
}

export function toolCallResponse(name: string, input: unknown, id=`call_${name}`): ModelResponse {
  return { content: [{ type: "tool_use", id, name, input }], stopReason: "tool_use", usage: NO_USAGE };
}

type Script = ModelResponse[] | ((req: ModelRequest) => ModelResponse);

/** Replays canned responses so the whole harness runs offline and deterministically. */
export class ScriptedModel implements ModelClient {
  /** Every request received, so tests can assert what the agent actually sent. */
  readonly requests: ModelRequest[] = [];
  private readonly script: Script;
  private nextIndex = 0;

  constructor(script: Script) {
    this.script = script;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    // Snapshot: the agent loop keeps appending to its messages array after this call.
    this.requests.push(structuredClone(req));

    if (typeof this.script === "function") return this.script(req);

    const response = this.script[this.nextIndex];
    if (!response) {
      throw new Error(
        `ScriptedModel ran out of responses: call #${this.nextIndex + 1} but the script has ${this.script.length}.`,
      );
    }
    this.nextIndex++;
    return response;
  }
}