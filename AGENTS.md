caret is an alternative terminal frontend for Cursor.

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

## Workspace

- `packages/tui` — OpenTUI Solid frontend (`@caret/tui`)

## Architecture

- `packages/tui` (`@caret/tui`) — Solid-based terminal frontend built on OpenTUI, containing components for chat, input, tool cards, and permissions.

## References Directory

The `.references/` directory contains shallow clones of important external repositories.
Never make any changes in this directory, it is ignored by git and meant as reference only.

Prefer exploring and reading this directory over searching for documentation. Think of it as the source of truth.

Available references:

- effect-smol — Effect v4
- opentui — OpenTUI (terminal UI framework)
- opencode — OpenCode (TUI architecture reference; uses OpenTUI in production)

Cursor SDK is not open source. See [docs/references/cursor-sdk.md](docs/references/cursor-sdk.md).

## Idiomatic Effect (v4)

Use `.references/effect-smol` as the source of truth (also `ai-docs/` inside it for patterns).
