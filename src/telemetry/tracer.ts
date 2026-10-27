import { appendFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TraceEvent, TraceEventInput } from "./types.js";

export interface Tracer {
    emit(event: TraceEventInput): void;
}

export const noopTracer: Tracer = {
    emit: () => undefined
}

export interface TracerOptions {
    runId: string;
    now: () => Date;
}

/** Adds runId, a strictly increasing seq, and a timestamp from the injected clock (GP-07). */
function stamper({ runId, now }: TracerOptions): (event: TraceEventInput) => TraceEvent {
    let seq = 0;
    return (event) => ({...event, runId, seq: seq++, ts: now().toISOString() });
}

export class MemoryTracer implements Tracer {
    readonly events: TraceEvent[] = [];
    private readonly stamp: (event: TraceEventInput) => TraceEvent;

    constructor(options: TracerOptions) {
        this.stamp = stamper(options);
    }

    emit(event: TraceEventInput): void {
        this.events.push(this.stamp(event));
    }
}

const SECRET_PATTERNS = [/sk-[A-Za-z0-9_-]{8,}/g, /AIza[0-9A-Za-z_-]{20,}/g];

/** One JSON line per event. **/

export function serializeEvent(event: TraceEvent): string {
    return JSON.stringify(event, (key, value) => {
        if(/^api[_-]?key$/i.test(key)) return "[REDACTED]";
        if (typeof value === "string") return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), value);
        return value;
    });
}

/** Appends each event as it happens, so a crash still leaves a trace **/ 
export class JsonlTracer implements Tracer { 
    private readonly path: string;
    private readonly stamp:(event: TraceEventInput) => TraceEvent;

    constructor(path: string, options: TracerOptions) {
        this.path = path;
        this.stamp = stamper(options);
        mkdirSync(dirname(path), { recursive: true });
    }

    emit(event: TraceEventInput): void {
        appendFileSync(this.path, serializeEvent(this.stamp(event)) + "\n");
        // A copy, not a symlink: symlinks need admin rights on Windows.
        if (event.type === "run_end") copyFileSync(this.path, join(dirname(this.path), "latest.jsonl"));
    }
}