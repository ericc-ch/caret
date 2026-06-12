caret is an alternative terminal frontend for Cursor.

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

When spawning Task subagents (review, explore, `/simplify`, etc.), **always** pass `model: "composer-2.5"`.

- **Do not** use any other model unless the user explicitly overrides in that message.
- Do not inherit the parent chat model for subagents — use Composer 2.5 even when the parent is a different model.

## Workspace

- `packages/tui` — OpenTUI Solid frontend and Cursor SDK integration (`@caret/tui`)

## Architecture

- `packages/tui` (`@caret/tui`) — Solid-based terminal frontend on OpenTUI. Owns the renderer, chat UI, prompt input, and `@cursor/sdk` wiring. No separate agent package for now; keep the SDK boundary inside `@caret/tui` until the surface stabilizes.
- OpenCode (`.references/opencode`) is a **UI reference** for layout, themes, and component patterns — not a backend to port. Steal presentation ideas; do not copy its SDK/sync layer.

### Current focus

Build chat bubbles and the prompt first. Tool cards, permissions, and CLI packaging come later.

## References Directory

The `.references/` directory contains shallow clones of important external repositories.
Never make any changes in this directory, it is ignored by git and meant as reference only.

Prefer exploring and reading this directory over searching for documentation. Think of it as the source of truth.

Available references:

- effect-smol — Effect v4
- opentui — OpenTUI (terminal UI framework)
- opencode — OpenCode (TUI UI reference; uses OpenTUI in production)
- cursor-cookbook — Cursor SDK docs and examples (SDK itself is not open source)

Cursor SDK is not open source. See `.references/cursor-cookbook` for SDK docs and examples.

## Idiomatic Effect (v4)

Use `.references/effect-smol` as the source of truth (also `ai-docs/` inside it for patterns).
