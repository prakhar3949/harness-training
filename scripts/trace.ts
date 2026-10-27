import { readFileSync } from "node:fs";
import { parseTrace, summarize } from "../src/telemetry/summarize.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run trace -- <trace.jsonl>");
  process.exit(1);
}

try {
  console.log(summarize(parseTrace(readFileSync(path, "utf8"))));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
