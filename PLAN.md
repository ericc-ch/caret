# Plan: `@caret/agent`

**Status:** draft — exploratory, not final  
**Date:** 2026-06-23  
**Repo:** `/home/erickc/projects/caret`

---

## TL;DR

`@caret/agent` is a **personal multi-channel agent host** (OpenClaw-shaped): chat platforms in, Cursor SDK as the brain, **executor** as the code/tools engine via MCP. No embedding, no custom MCP shim.

| Decision | Choice |
|---|---|
| Package | `packages/agent` → `@caret/agent` |
| Code engine | `executor mcp --elicitation-mode model` (external CLI) |
| Elicitation | Model asks user on channel → user replies → model calls `resume` |
| First channel | WhatsApp via [chat-sdk](https://chat-sdk.dev/) |
| `@caret/tui` | Out of scope — separate project (Cursor CLI frontend) |
| Browser runtime (runner) | Out of scope — separate effort |

---

## What we're building

A host that:

1. Receives messages on chat channels (WhatsApp first, then Discord, Telegram, etc.).
2. Routes each conversation thread to a **Cursor SDK agent** (`Agent.create` + `agent.send`).
3. Wires **executor MCP** so the model can run TypeScript in a sandbox and call `tools.*`.
4. Mirrors assistant output back to the channel.
5. Relies on **model-mode elicitation** for approvals — the model asks the user in chat, user replies, model calls `resume`.

We are **not** building:

- A custom executor embed or MCP server
- A Cursor TUI (`@caret/tui` stays separate)
- Browser/Playwright runtime (runner pivot — later, as a separate MCP connector)
- WhatsApp interactive buttons (plain text is fine)
- Browser approval URLs (using model mode, not browser mode)

---

## Architecture

```
┌─────────────┐     webhook      ┌──────────────────┐     Agent SDK     ┌─────────────┐
│  WhatsApp   │ ◄──────────────► │   @caret/agent   │ ◄───────────────► │   Cursor    │
│  (chat-sdk) │   text in/out    │  channel+cursor  │                   │   agent     │
└─────────────┘                  └────────┬─────────┘                   └──────┬──────┘
                                        │                                      │
                                        │         mcpServers.executor          │
                                        │                                      ▼
                                        │                              ┌─────────────┐
                                        └──────────────────────────────► │ executor mcp│
                                           subprocess on same machine   │ execute +   │
                                                                        │ resume      │
                                                                        └─────────────┘
```

### Responsibilities

| Component | Role |
|---|---|
| **executor** (`executor mcp`) | Tool catalog, QuickJS sandbox, pause/resume, `tools.search` / `tools.*` |
| **Cursor SDK** | Model, reasoning, tool orchestration (`execute`, `resume`) |
| **@caret/agent** | Channel I/O, per-thread Cursor session, stream → channel relay |

### No shim

Stock `executor mcp` is sufficient. `@caret/agent` does not:

- Embed `@executor-js/*`
- Ship a custom MCP server
- Bridge elicitation at the MCP protocol level
- Own an approval store or browser `/resume` URLs

Optional polish: parse Cursor stream events to proactively post pause messages to WhatsApp (still not a shim — no executor coupling).

---

## Executor integration

### MCP config

Point Cursor at executor's stdio MCP server:

```typescript
mcpServers: {
  executor: {
    command: "executor",
    args: ["mcp", "--elicitation-mode", "model"],
  },
}
```

### Prerequisites (operator machine)

- `executor` installed globally or on `PATH` (`npm i -g executor` / `bunx`)
- `executor install` + tool sources configured as needed (`executor web`)
- `CURSOR_API_KEY` set
- Re-pass `mcpServers` on `Agent.resume` (inline MCP is not persisted across resume — SDK quirk)

### Model tools (what the Cursor model sees)

| Tool | Purpose |
|---|---|
| `execute({ code })` | Run TypeScript in QuickJS sandbox; `tools.*` available in scope |
| `resume({ executionId, action, content? })` | Continue a paused execution after user input |

Guest code is **always TypeScript** — executor strips types internally (`stripTypeScript` in `@executor-js/runtime-quickjs`). No `language` parameter needed.

### Elicitation modes (why model, not browser or native)

Executor's MCP server supports three elicitation modes:

| Mode | CLI flag | Client without MCP elicitation | Model tools |
|---|---|---|---|
| **model** | `--elicitation-mode model` (default) | `executeWithPause` → model calls `resume` | `execute` + `resume` |
| **browser** | `--elicitation-mode browser` | Pause → browser URL → `resume` blocks | `execute` + `resume` |
| **native** | Not exposed in CLI | `elicitInput` — fails if client unsupported | `execute` only |

Cursor does not advertise MCP `elicitation` capability. Executor falls back to **pause/resume** (documented in `/tmp/references/executor/packages/hosts/mcp/src/tool-server.test.ts` — "client without elicitation").

We use **model mode** because:

- User approves via plain WhatsApp text ("yes" / "no")
- No public URL / tunnel needed for browser approval pages
- User is fine with the model calling `resume`

---

## Elicitation end-to-end (model mode)

### Two layers

1. **SDK level** — sandbox calls a gated tool → executor pauses → `FormElicitation` or `UrlElicitation`.
2. **MCP bridge** — host returns pause payload to the model (not MCP `elicitInput`).

### Flow

```
1. User (WhatsApp):  "merge the small open PR"

2. @caret/agent:     agent.send(text)     // same thread's Cursor agent

3. Model → MCP:      execute({ code: "..." })
   Sandbox hits gated tool → PAUSE

4. execute returns:
   {
     status: "waiting_for_interaction",
     executionId: "exec_abc",
     interaction: {
       message: "Merge PR #42 into main?",
       instructions: "Ask the user whether to approve... call resume with accept/decline"
     }
   }

5. Model (stream):   "Merge PR #42 into main — want me to go ahead?"
   @caret/agent:      mirrors assistant text → WhatsApp

6. User (WhatsApp):  "yes"

7. @caret/agent:     agent.send("yes")    // same agent, full conversation context

8. Model → MCP:      resume({ executionId: "exec_abc", action: "accept" })

9. Sandbox continues → execute completes → model summarizes

10. @caret/agent:    posts final reply → WhatsApp
```

The model owns `executionId` and the `resume` call. The host must keep the **Cursor agent session alive** across WhatsApp messages in the same thread.

### Structured payloads to watch in the stream (optional relay)

When parsing Cursor `tool_call` / tool result events:

**After `execute` pauses:**

```json
{
  "status": "waiting_for_interaction",
  "executionId": "exec_abc",
  "interaction": {
    "message": "Approve deploy?",
    "instructions": "...call resume...",
    "kind": "form",
    "url": "..."
  }
}
```

**After `resume` completes:**

```json
{
  "status": "completed",
  "result": "..."
}
```

Optional: proactively WhatsApp *"⏸ Waiting for your OK: {interaction.message}"* when pause is detected — don't rely only on the model's phrasing.

---

## Package layout

```
packages/agent/
├── package.json                 # @caret/agent
├── tsconfig.json
├── templates/                   # workspace bootstrap (AGENTS.md, SOUL.md, …)
└── src/
    ├── index.ts                 # public API
    ├── cli.ts                   # stdin REPL smoke driver
    ├── workspace/
    │   ├── paths.ts             # env-paths XDG resolution
    │   └── ensure.ts            # first-run bootstrap
    ├── channel/                 # (fan-out)
    ├── cursor/
    │   ├── config.ts            # Agent.create options from workspace
    │   ├── session.ts           # Agent.create, send, dispose
    │   └── stream.ts            # run.stream() → channel posts
    ├── router.ts                # thread.id → Cursor agent mapping
    └── main.ts                  # start webhook server
```

Add root `tsconfig.json` project reference.

---

## Cursor session

Workspace dir is resolved first (`ensureWorkspace()`), then:

```typescript
const workspaceDir = await ensureWorkspace()

await Agent.create({
  apiKey: process.env.CURSOR_API_KEY,
  model: { id: "composer-2.5" },
  local: { cwd: workspaceDir, settingSources: ["project"] },
  mcpServers: {
    executor: {
      command: "executor",
      args: ["mcp", "--elicitation-mode", "model"],
      cwd: workspaceDir,
      env: { EXECUTOR_SCOPE_DIR: workspaceDir },
    },
  },
})
```

### Per-thread mapping

| Chat concept | Cursor concept |
|---|---|
| WhatsApp conversation / thread | One `SDKAgent` instance |
| Subsequent messages | `agent.send()` on same agent (preserves history + pending `executionId`) |
| New thread | New `Agent.create()` |

v0: in-memory `Map<threadId, Agent>`.  
Later: persist `threadId → agentId` and `Agent.resume()` across restarts.

---

## WhatsApp channel (chat-sdk)

### Stack

- [`chat`](https://chat-sdk.dev/) — unified bot API
- [`@chat-adapter/whatsapp`](https://chat-sdk.dev/adapters/official/whatsapp) — WhatsApp Business Cloud (beta)

### Minimal handler

```typescript
bot.onSubscribedMessage(async (thread, message) => {
  const session = router.getOrCreate(thread.id)
  await session.send(message.text, (chunk) => thread.post(chunk))
})
```

First message: `thread.subscribe()` + create Cursor agent.

### Hosting

- Public webhook URL required (`/api/webhooks/whatsapp`)
- Meta app credentials: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
- Local dev: tunnel (ngrok, cloudflared, etc.)
- **24-hour messaging window** — user must reply within 24h of last bot message

### Future channels

Same router pattern; swap/add adapters (Discord, Telegram, Slack). chat-sdk is the intended multi-channel layer.

---

## Relationship to other work

```
@caret/agent     channel host + Cursor session router     ← this plan
@caret/tui       alternative Cursor CLI frontend          ← ignore for now
runner (sibling) browser MCP runtime                      ← later connector via executor plugins
```

Runner (browser-only MCP, `node:vm`, live Playwright) is a **separate repo/effort**. When ready, wire it as an executor MCP plugin or connector — not inside `@caret/agent` v0.

---

## Phased delivery

### Phase 1 — Cursor + executor smoke (CLI channel)

No WhatsApp. Stdin → `agent.send` → stdout stream.

**Acceptance:**

- Prompt triggers `execute`
- Gated tool pauses
- User types "yes" on stdin
- Model calls `resume`
- Run completes

### Phase 2 — Scaffold `packages/agent`

- `package.json`, tsconfig, root reference
- `router`, `cursor/session`, `cursor/stream`
- `bun run check` green

### Phase 3 — WhatsApp wire-up

- chat-sdk + `@chat-adapter/whatsapp`
- Webhook server
- Echo bot → swap in Cursor session from Phase 1

**Acceptance:** message on phone → agent reply on phone.

### Phase 4 — Approval loop

- Prompt that hits a gated executor tool
- Multi-turn: pause → WhatsApp question → "yes" → `resume` → result

**Acceptance:** full model-mode elicitation over WhatsApp without touching executor internals.

### Phase 5 — Hardening

- Agent lifecycle (idle timeout, `agent.close()` / `await using`)
- Error messages to WhatsApp
- `run.wait()` + distinguish startup vs run failure (`CursorAgentError` vs `result.status === "error"`)
- Deploy + persistent thread→agent mapping (`Agent.resume`)
- Optional: proactive pause relay from stream parser

### Phase 6 — Connectors (stretch)

- Configure executor sources (OpenAPI, MCP plugins) via `executor web`
- Demo end-to-end: WhatsApp → codemode-style orchestration via `execute` + real `tools.*`

---

## Dependencies

### In `@caret/agent` package.json

```json
{
  "dependencies": {
    "@cursor/sdk": "^1.0.18",
    "env-paths": "^4.0.0",
    "chat": "...",
    "@chat-adapter/whatsapp": "..."
  }
}
```

### External (not npm deps)

| Tool | Role |
|---|---|
| `executor` CLI | MCP server + tool catalog |
| `CURSOR_API_KEY` | Cursor SDK auth |

### Not required

- `@executor-js/sdk`, `@executor-js/execution`, `@executor-js/runtime-quickjs`
- `@modelcontextprotocol/sdk` (executor owns MCP)
- `@caret/tui`

---

## Failure modes

| Issue | Mitigation |
|---|---|
| Model forgets `executionId` | One Cursor agent per chat thread (conversation history) |
| Model replies without calling `resume` | System prompt: *"When executor pauses, ask the user, then call resume with the executionId"* |
| `executor mcp` slow cold start | Starts local daemon + web UI — acceptable for v0 |
| Pause / execution expires | User says "try again" — model re-runs `execute` |
| WhatsApp 24h window | User must message within 24h of last bot message |
| `Agent.resume` loses MCP | Re-pass `mcpServers` on resume call |
| Executor not on PATH | Document install; fail fast at startup with clear error |

---

## System prompt (draft)

Include in agent instructions (channel-agnostic):

```
You are a personal assistant reachable via chat.

When the executor `execute` tool pauses for approval:
1. Ask the user clearly using the interaction message.
2. Wait for their reply in chat.
3. Call `resume` with the executionId and action "accept" or "decline".

Do not assume approval. Always ask.
```

---

## Reference material

| Path | Why |
|---|---|
| `/tmp/references/executor/packages/hosts/mcp/src/tool-server.ts` | MCP execute/resume, elicitation modes |
| `/tmp/references/executor/packages/hosts/mcp/src/tool-server.test.ts` | "client without elicitation" tests |
| `/tmp/references/executor/packages/core/execution/README.md` | Engine embed docs (reference only — we don't embed) |
| `/tmp/references/openclaw/src/agents/code-mode.ts` | OpenClaw exec/wait comparison |
| `/tmp/references/cursor-cookbook/sdk/` | Cursor SDK patterns |
| `HANDOFF.md` | Earlier runner/CursorClaw exploration (partially superseded by this plan) |

---

## Explicit non-goals (v0)

- Embedding executor or QuickJS
- Custom MCP server / shim
- Browser elicitation mode / approval URLs
- Model-visible tool named `wait` (OpenClaw shape) — we use executor's `resume` instead
- WhatsApp interactive buttons
- `@caret/tui` integration
- Runner / Playwright browser runtime
- Cloud Cursor agents (local only for v0)
- Durable execution replay log (Cloudflare-style)

---

## Agent workspace

`@caret/agent` owns a **dedicated operator workspace** (OpenClaw-shaped), separate from the caret monorepo source tree.

| Concern | Choice |
|---|---|
| Location | XDG via [`env-paths`](https://github.com/sindresorhus/env-paths) — default `~/.local/share/caret-agent/workspace` |
| Override | `CARET_AGENT_WORKSPACE` env |
| Scope | Single workspace for v0 (all channels/threads) |
| Cursor `local.cwd` | Workspace dir |
| Executor scope | `cwd` + `EXECUTOR_SCOPE_DIR` on MCP subprocess |
| Executor global data | Default `~/.executor` (unchanged) |
| Other repos | Document paths in `TOOLS.md` (e.g. caret monorepo) — don't point cwd at them |

### Bootstrap files (first run, write-if-missing)

| File | Purpose |
|---|---|
| `AGENTS.md` | Workspace rules, memory, executor elicitation |
| `SOUL.md` | Personality |
| `TOOLS.md` | Local setup notes, project paths |
| `IDENTITY.md` | Agent identity |
| `USER.md` | User profile |
| `HEARTBEAT.md` | Proactive check tasks |
| `BOOTSTRAP.md` | First-run ritual (delete after) |
| `executor.jsonc` | Executor plugin manifest |
| `memory/` | Daily notes directory |

Templates live in `packages/agent/templates/`; `ensureWorkspace()` copies on first run.

## Open questions

- Agent idle TTL before `close()`?
- Persist `threadId → agentId` in SQLite/Redis vs always in-memory?
- Streaming: post partial assistant text to WhatsApp vs wait for complete messages?
- Executor scope / `executor.jsonc` per deployment?

---

## Execution plan

Work is structured in three stages: **foundation (serial)** → **fan-out (parallel subagents)** → **fan-in (review)**.

```
                    ┌─────────────────────────────────────┐
                    │  1. FOUNDATION (serial, one agent)  │
                    │  scaffold → session → CLI smoke     │
                    └──────────────────┬──────────────────┘
                                       │ smoke green
                    ┌──────────────────▼──────────────────┐
                    │  2. FAN-OUT (parallel subagents)    │
         ┌──────────┼──────────┬──────────┬──────────────┤
         ▼          ▼          ▼          ▼              ▼
     stream      router    whatsapp     main         hardening
                                       integration   (optional)
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │  3. FAN-IN (serial, one agent)      │
                    │  integrate → approval e2e → check   │
                    └─────────────────────────────────────┘
```

### 1. Foundation — serial

One agent, strict order. **Do not fan out until CLI smoke passes.**

| Step | Deliverable | Done when |
|---|---|---|
| F1 | `packages/agent` scaffold — `package.json`, `tsconfig.json`, root `tsconfig` reference | `bun install` + `tsc -b` includes agent |
| F2 | `src/workspace/paths.ts` + `ensure.ts` — XDG paths, bootstrap `*.md` + `executor.jsonc` | Workspace exists with templates |
| F2b | `src/cursor/config.ts` — workspace-scoped `mcpServers`, env checks | Startup fails fast with clear errors |
| F3 | `src/cursor/session.ts` — `Agent.create`, `send(text)`, `dispose` | Unit/integration smoke: agent responds to a prompt |
| F4 | `src/cursor/stream.ts` (minimal) — `run.stream()` → collect assistant text | Stream relay works in CLI |
| F5 | `src/cli.ts` — stdin REPL: read line → `session.send` → print stream | Manual driver for all later phases |
| F6 | **CLI smoke test** — prompt that triggers `execute` → gated pause → user types "yes" → model calls `resume` → completes | Phase 1 acceptance met |
| F7 | `bun run check` green | CI-equivalent pass |

**Gate:** F6 must pass before fan-out. This proves Cursor + executor MCP + model-mode elicitation without WhatsApp complexity.

### 2. Fan-out — parallel subagents

After foundation gate, launch **Composer 2.5** subagents in parallel. Each owns a slice with a clear interface contract.

| Agent | Scope | Files | Interface contract |
|---|---|---|---|
| **A — stream** | Full stream parser + optional pause relay | `src/cursor/stream.ts` | `relayStream(run, onText, onPause?)` — posts assistant chunks; optionally emits `waiting_for_interaction` payloads |
| **B — router** | Per-thread session map | `src/router.ts` | `getOrCreate(threadId): Session`, `dispose(threadId)` — in-memory `Map` for v0 |
| **C — whatsapp** | chat-sdk + webhook adapter | `src/channel/bot.ts`, `src/channel/whatsapp.ts` | `createBot()`, `mountWhatsAppRoutes(app)` — echo handler stub that calls a `onMessage(thread, text, post)` callback |
| **D — main** | Entrypoint + public API | `src/main.ts`, `src/index.ts` | `start()` — HTTP server, env, wires router + channel |

**Parallelism rules:**

- B imports session from F3 — do not rewrite `session.ts`.
- C exposes a callback; D wires `callback → router.getOrCreate → session.send → stream.relay`.
- A extends F4's minimal stream — same function signature, richer parsing.
- No subagent touches executor internals or adds MCP shims.

### 3. Fan-in — review

One agent merges and validates. Serial again.

| Step | Action |
|---|---|
| R1 | Resolve import/interface mismatches from parallel work |
| R2 | Wire `main.ts`: WhatsApp message → router → session → stream → `thread.post` |
| R3 | **WhatsApp smoke** — message on phone → agent reply (Phase 3 acceptance) |
| R4 | **Approval e2e** — gated tool → pause question on WhatsApp → "yes" → `resume` → result (Phase 4 acceptance) |
| R5 | Error paths — `CursorAgentError`, executor missing, empty stream → user-visible channel message |
| R6 | `bun run check` |
| R7 | Optional: `/simplify` review on `packages/agent` |

**Gate:** R4 is the real end-to-end proof. R3 alone is echo-level; R4 validates the whole elicitation story.

### Subagent prompts (copy-paste)

**Foundation (do not split):**

> Scaffold `packages/agent` per PLAN.md. Implement F1–F7 serially. CLI smoke must prove `execute` → pause → stdin "yes" → `resume`. Run `bun run check` before handing off.

**Fan-out A (stream):**

> In `packages/agent`, extend `src/cursor/stream.ts`. Parse Cursor `run.stream()` events; call `onText(chunk)` for assistant output. Optionally detect executor pause payloads (`status: "waiting_for_interaction"`) and call `onPause(payload)`. Match conventions in `docs/conventions.md`. Do not change `session.ts`.

**Fan-out B (router):**

> In `packages/agent`, implement `src/router.ts`. In-memory `Map<threadId, Session>`. `getOrCreate` calls `session.create` on first message. Export `dispose`. v0 only — no persistence.

**Fan-out C (whatsapp):**

> In `packages/agent`, implement `src/channel/bot.ts` and `src/channel/whatsapp.ts` using chat-sdk + `@chat-adapter/whatsapp`. Webhook verify + message handler via `onSubscribedMessage`. Export callback-based API — do not wire Cursor yet.

**Fan-out D (main):**

> In `packages/agent`, implement `src/main.ts` and `src/index.ts`. HTTP server, env loading, mount WhatsApp routes. Accept injected `onMessage` handler for testability. Do not wire Cursor yet.

**Fan-in:**

> Merge fan-out branches in `packages/agent`. Wire WhatsApp → router → session → stream → channel. Run approval e2e per PLAN.md Phase 4. Fix integration issues. `bun run check` must pass.

### What comes after fan-in

Phase 5 hardening (idle TTL, `Agent.resume` persistence, deploy) and Phase 6 connectors stay **out of the first fan-out** — schedule as a second foundation → fan-out cycle once R4 passes.

---

*Last updated: 2026-06-23*
