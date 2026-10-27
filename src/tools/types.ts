import { z } from "zod";
import type { OrderStore } from "../domain/store.js";
import type { Tracer } from "../telemetry/tracer.js";
export type ToolRisk = "read" | "write";

export interface Tool<I, O> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;   // the "form"
  risk: ToolRisk;
  execute(input: I, ctx: ToolContext): Promise<O>;
}

export interface ToolContext {
  store: OrderStore;
  now: () => Date;
  customerId: string;
  tracer?: Tracer;
}

export type ToolResult<O> =
  | { ok: true; data: O }
  | { ok: false; error: string };

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: z.core.JSONSchema.BaseSchema; // JSON Schema produced by z.toJSONSchema()
}