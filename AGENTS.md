caret is a monorepo for Cursor-powered agents.

The agent backend is [`@cursor/sdk`](https://cursor.com/docs/sdk/typescript) — local agents via `Agent.create()` and `run.stream()`. Do not use ACP (`agent acp`) or other Cursor CLI protocols.

Our priorities are (not ordered, all are important):

- Maintainability
- Reliability
- Performance

If a tradeoff is required, choose correctness and robustness over short-term convenience.

Use Bun as package manager (`bun install`, workspaces in root `package.json`).
Run first-party `.ts` with Bun (`bun path/to/file.ts`, `#!/usr/bin/env bun`). Use `node:` imports only, no Bun-specific runtime APIs (`Bun.file`, etc.) except in compiled-binary build scripts.
Third-party CLIs (vitest, `tsc`) keep their own shebangs; do not switch to `bun test`.

Run `bun run check` after completing a task (typecheck per package, `vitest` at workspace root, lint and format at workspace root).

For specific code style and testing guidelines, see [docs/conventions.md](./docs/conventions.md).

## Subagents

When spawning Task subagents (review, explore, `/simplify`, etc.), use either Composer 2.5 / Composer 2.5 Fast depending on the task.

## Workspace

- `packages/agent` — multi-channel agent host (`@caret/agent`)
- `packages/tui` — OpenTUI Solid terminal frontend (`@caret/tui`)

## Architecture

- `packages/agent` (`@caret/agent`) — personal multi-channel host (OpenClaw-shaped): chat platforms in, Cursor SDK as the brain, **executor** as the code/tools engine via MCP (`executor mcp --elicitation-mode model`).
- `packages/tui` (`@caret/tui`) — alternative Cursor CLI frontend on OpenTUI. Separate effort; not wired to `@caret/agent` for now.

## References Directory

The `/tmp/references/` directory contains shallow clones of important external repositories (populated by `bun scripts/references.ts`).
Never make any changes in this directory — it is meant as reference only.

Prefer exploring and reading this directory over searching for documentation. Think of it as the source of truth.

Available references:

- effect-smol — Effect v4
- opentui — OpenTUI (terminal UI framework)
- opencode — OpenCode (TUI UI reference; uses OpenTUI)
- cursor-cookbook — Cursor SDK examples (SDK itself is not open source)
- playwright — Playwright
- executor — Executor
- playwriter — Code REPL + VM sandbox for browser automation (reference only)
- agent-browser — Agent-owned browser daemon, snapshot/ref CLI (vercel-labs)
- openclaw — OpenClaw (reference for caret agent)
- hermes-agent — Hermes Agent (reference for caret agent)
- discord.js — Discord bot library

Cursor SDK is not open source. See `/tmp/references/cursor-cookbook` for SDK docs and examples.

## Idiomatic Effect (v4)

Use `/tmp/references/effect-smol` as the source of truth (also `ai-docs/` inside it for patterns).
