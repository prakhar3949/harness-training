import { z } from "zod";
import { DomainError } from "../domain/types.js";
import type { Tool, ToolContext, ToolResult, ToolSchema } from "./types.js";
import { noopTracer } from "../telemetry/tracer.js";


type AnyTool = Tool<unknown, unknown>;

export class ToolRegistry {
    private tools = new Map<string, AnyTool>();

    register<I, O>(tool: Tool<I, O>): this {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool "${tool.name}" is already registered`);
        }
        this.tools.set(tool.name, tool);
        return this;
    }

    get(name: string): AnyTool | undefined {
        return this.tools.get(name);
    }

    list(): AnyTool[] {
        return [...this.tools.values()];
    }

    toModelSchemas(): ToolSchema[] {
        return this.list().map((t) => ({
            name: t.name,
            description: t.description,
            // io: "input" describes what the model must SEND (optional fields stay optional).
            inputSchema: z.toJSONSchema(t.inputSchema, { io: "input" }),
        }));
    }

    /** Never throws: every failure becomes { ok: false, error } so the model can read it and recover. */
        /** Never throws: every failure becomes { ok: false, error } so the model can read it and recover. Every call is traced. */
    async execute(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult<unknown>> {
        const tracer = ctx.tracer ?? noopTracer;
        const started = ctx.now().getTime();
        const report = (result: ToolResult<unknown>, detail?: string): ToolResult<unknown> => {
            const latencyMs = ctx.now().getTime() - started;
            if (result.ok) tracer.emit({ type: "tool_call", name, input: rawInput, latencyMs, ok: true, output: result.data });
            else tracer.emit({ type: "tool_call", name, input: rawInput, latencyMs, ok: false, error: result.error, detail });
            return result;
        };

        const tool = this.tools.get(name);
        if (!tool) {
            return report({ ok: false, error: `Unknown tool "${name}". Available tools: ${[...this.tools.keys()].join(", ")}` });
        }

        const parsed = tool.inputSchema.safeParse(rawInput);
        if (!parsed.success) {
            return report({ ok: false, error: `Invalid input for ${name}:\n${z.prettifyError(parsed.error)}` });
        }

        // Tracing happens outside the try: if writing the trace failed, a refund that did happen must not be reported as failed.
        let result: ToolResult<unknown>;
        let detail: string | undefined;
        try {
            result = { ok: true, data: await tool.execute(parsed.data, ctx) };
        } catch (err) {
            if (err instanceof DomainError) {
                result = { ok: false, error: err.message };
            } else {
                // Unexpected bug: the details go to the trace for us; the model gets a generic message.
                detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
                result = { ok: false, error: `Tool ${name} failed unexpectedly. Do not retry; escalate to a human.` };
            }
        }
        return report(result, detail);
    }
}
