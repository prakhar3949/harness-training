# Architecture

## File system layout

```
harness-training/
├── AGENTS.md                  # Operating manual for the coding agent (CLAUDE.md points here)
├── CLAUDE.md
├── PROGRESS.md                # Append-only log, one entry per finished feature
├── README.md
├── package.json / tsconfig.json / vitest.config.ts / eslint.config.js   (created in F0)
├── .claude/skills/
│   ├── build-feature/SKILL.md # The "finish one feature" workflow
│   └── cleanup/SKILL.md       # The recurring cleanup workflow
├── docs/
│   ├── ROADMAP.md
│   ├── ARCHITECTURE.md        # (this file)
│   ├── FEATURES.md
│   ├── TESTING.md
│   ├── GOLDEN_PRINCIPLES.md
│   ├── CLEANUP.md
│   └── decisions/             # Short ADRs: NNNN-title.md (only for non-obvious choices)
├── src/
│   ├── domain/                # Fake business world (the "company system")
│   │   ├── types.ts           #   Order, Refund, Customer
│   │   ├── store.ts           #   In-memory OrderStore (get/refund/list) + seed data
│   │   └── policy.ts          #   Pure refund-policy function (no I/O)
│   ├── tools/                 # LAYER 1
│   │   ├── types.ts           #   Tool<TInput,TOutput>: name, description, zod schema, risk, execute
│   │   ├── registry.ts        #   ToolRegistry: register, get, list, toModelSchemas()
│   │   ├── lookupOrder.ts
│   │   ├── checkRefundPolicy.ts
│   │   ├── issueRefund.ts
│   │   └── escalateToHuman.ts
│   ├── llm/                   # Model boundary (the ONLY place that knows about providers)
│   │   ├── types.ts           #   Message, ContentBlock, ModelClient interface, ModelResponse
│   │   ├── scripted.ts        #   ScriptedModel: replays canned responses (tests + evals)
│   │   └── anthropic.ts       #   Real adapter (thin)
│   ├── agent/                 # LAYER 2
│   │   ├── loop.ts            #   runAgent(): the ReAct loop, stop conditions, step budget
│   │   ├── types.ts           #   AgentConfig, AgentResult, StopReason
│   │   └── prompt.ts          #   System prompt builder
│   ├── context/               # LAYER 3
│   │   ├── budget.ts          #   Token estimator + budget
│   │   ├── truncate.ts        #   Tool-output truncation
│   │   └── compact.ts         #   History trimming / summarization
│   ├── guardrails/            # LAYER 4
│   │   ├── types.ts           #   Guardrail = (ctx) => Allow | Deny(reason) | NeedsApproval(reason)
│   │   ├── rules.ts           #   maxRefundAmount, noDuplicateRefund, ownerMatches …
│   │   ├── approval.ts        #   ApprovalHandler interface (CLI prompt, auto-approve, auto-deny)
│   │   └── retry.ts           #   Repair loop for malformed model output / bad tool args
│   ├── telemetry/             # LAYER 6
│   │   ├── types.ts           #   TraceEvent union (model_call, tool_call, guardrail, stop …)
│   │   ├── tracer.ts          #   Tracer interface + JsonlTracer + MemoryTracer
│   │   └── summarize.ts       #   Read a trace, print a human-readable timeline + cost/steps
│   ├── cli/
│   │   ├── main.ts            #   `npm run chat` – interactive REPL; `--scripted` for offline demo
│   │   └── scenarios.ts       #   Named ScriptedModel scenarios for offline demos
│   ├── chat/                  # WEEK 2 (F13, F15): platform-neutral chat front door
│   │   ├── types.ts           #   ChatTransport, IncomingMessage, ActionEvent, OutgoingMessage
│   │   ├── fakeSlack.ts       #   In-memory channel/threads for tests and offline demos
│   │   ├── session.ts         #   ThreadSessions: threadRef → {customerId, messages}
│   │   ├── bot.ts             #   startRefundBot(): mentions → runAgent, per-thread queue
│   │   ├── approval.ts        #   ChatApprover: ApprovalHandler via buttons, allowlist, timeout
│   │   └── auditor.ts         #   Auditor agent config + structured handoff (F15)
│   └── slack/                 # WEEK 2 (F14): the only code that knows Slack exists
│       ├── boltTransport.ts   #   BoltTransport implements ChatTransport (only @slack/bolt importer)
│       ├── blocks.ts          #   Pure OutgoingMessage ⇄ Block Kit / event mappers
│       └── main.ts            #   `npm run slack` entry: zod config, wiring
├── evals/                     # LAYER 5
│   ├── cases/*.json           #   {id, customerMessage, seed, scriptedModel?, expect}
│   ├── graders.ts             #   Deterministic graders (state-based, not string-matching)
│   ├── run.ts                 #   `npm run eval` – runs all cases, prints table, exits non-zero on regress
│   └── baseline.json          #   Last accepted scores (regressions fail CI)
├── tests/
│   ├── unit/                  # Mirrors src/ one-to-one
│   ├── integration/           # Loop + tools + guardrails + tracer with ScriptedModel
│   └── e2e/                   # Spawns the real CLI as a child process (the "human tester")
├── slack/manifest.yaml        # Slack app manifest (F14)
├── scripts/
│   ├── check-principles.ts    # Mechanical enforcement of GOLDEN_PRINCIPLES (F9)
│   └── verify.sh              # One command: typecheck + lint + test + eval + smoke
└── traces/                    # gitignored; *.jsonl written by the tracer
```

## Dependency rules (enforced by `check-principles.ts`)

```
cli ──► agent ──► tools ──► domain
          │  ╲──► guardrails
          │  ╲──► context
          │  ╲──► telemetry
          └────► llm (interface only)

slack ──► chat ──► agent, guardrails (ApprovalHandler), telemetry

llm/anthropic.ts  ← only file allowed to import "@anthropic-ai/sdk"
slack/boltTransport.ts ← only file allowed to import "@slack/bolt"
chat/             ← never imports slack/ (it talks to ChatTransport only)
domain/           ← imports nothing from the rest of src/
tools/            ← never imports agent/, llm/, cli/
telemetry/        ← imports nothing from the rest of src/ (except its own types)
```

Arrows point at "may import". Anything not drawn is forbidden. This keeps every layer independently testable.

## Data flow for one customer message

```
CLI ── user text ──► runAgent(config, messages)
                        │
                        ▼
              ┌──► context.prepare(messages)        (L3: trim / truncate / budget)
              │         │
              │         ▼
              │    model.complete(system, messages, tools)   (llm boundary; traced)
              │         │
              │   text only? ──yes──► stop("final_answer")
              │         │ no: tool_use blocks
              │         ▼
              │    for each tool call:
              │       registry.get(name) → zod-validate args   (L1; invalid → error result, model retries)
              │       guardrails.check(call, state)            (L4: allow | deny | needs_approval)
              │       approval? → ApprovalHandler
              │       tool.execute(args)                       (traced)
              │         │
              └── append tool_result messages ◄──┘
                   (step++ ; step > maxSteps → stop("max_steps"))
```

## Slack flow (Week 2)

```
Slack ─(Socket Mode)─► BoltTransport ──► bot.ts ──► ThreadSessions.get(thread)
                                            │
                                            ▼
                                  runAgent(… approval: ChatApprover(thread, rep))
                                            │ needs_approval
                                            ▼
                     ChatApprover posts [Approve][Deny] ──► Auditor agent posts recommendation
                                            │
             human click ─► BoltTransport ─► onAction ─► allowlist + not-requester check ─► resolve
```

The CLI and Slack are two front doors to the same core. `FakeSlack` implements the same `ChatTransport`, so the whole flow runs offline in tests.

## Key types (write these first; everything hangs off them)

```ts
// llm/types.ts
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };
type Message = { role: "user" | "assistant"; content: ContentBlock[] };
interface ModelClient {
  complete(req: { system: string; messages: Message[]; tools: ToolSchema[] }): Promise<ModelResponse>;
}
type ModelResponse = { content: ContentBlock[]; stopReason: "end_turn" | "tool_use" | "max_tokens"; usage: { inputTokens: number; outputTokens: number } };

// tools/types.ts
interface Tool<I, O> {
  name: string; description: string;
  inputSchema: z.ZodType<I>;
  risk: "read" | "write";          // guardrails key off this
  execute(input: I, ctx: ToolContext): Promise<O>;
}

// agent/types.ts
type StopReason = "final_answer" | "max_steps" | "guardrail_abort" | "model_error" | "context_overflow";
```

## Design decisions (keep these unless an ADR says otherwise)

- **Tools return data, never throw for expected failures.** Errors become `tool_result` with `isError: true` so the model can recover.
- **Guardrails are plain functions**, not prompt text. Prompts advise; code enforces.
- **The model is an interface.** Tests and evals use `ScriptedModel`; only `anthropic.ts` touches a network.
- **State lives in `domain/store.ts`**, so evals grade the *world state* (was the refund issued once?), not the model's wording.
- **Every side effect goes through a tool**, and every tool call goes through the tracer.
