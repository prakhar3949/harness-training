import { z } from "zod";
import { DomainError } from "../src/domain/types.js";
import type { Tool, ToolContext, ToolResult, ToolSchema } from "./types.ts";

type AnyTool = Tool<unknown, unknown>;

export class ToolRegistry {
    private tools = new Map<string, AnyTool>();

    register<I, O>(tool: Tool<I, O>): this {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool "${tool.name}" is already registered`);
        }
        this.tools.set(tool.name, tool as AnyTool);
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
    async execute(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult<unknown>> {
        const tool = this.tools.get(name);
        if (!tool) {
            return { ok: false, error: `Unknown tool "${name}". Available tools: ${[...this.tools.keys()].join(", ")}` };
        }

        const parsed = tool.inputSchema.safeParse(rawInput);
        if (!parsed.success) {
            return { ok: false, error: `Invalid input for ${name}:\n${z.prettifyError(parsed.error)}` };
        }

        try {
            return { ok: true, data: await tool.execute(parsed.data, ctx) };
        } catch (err) {
            if (err instanceof DomainError) {
                return { ok: false, error: err.message };
            }
            // Unexpected bug: log the details for us, give the model a generic message.
            console.error(`[tool ${name}] unexpected error`, err);
            return { ok: false, error: `Tool ${name} failed unexpectedly. Do not retry; escalate to a human.` };
        }
    }
}
