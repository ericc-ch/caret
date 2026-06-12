caret is an alternative terminal frontend for Cursor. The Cursor SDK owns the agentic loop; this repo is only the TUI.

For development setup and workspace layout, see [CONTRIBUTING.md](CONTRIBUTING.md).

Our priorities are (not ordered, all are important):

- Maintainability
- Reliability
- Performance

If a tradeoff is required, choose correctness and robustness over short-term convenience.

Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

Minimize nesting.

Use Bun as package manager (`bun install`, workspaces in root `package.json`).
Run first-party `.ts` with Bun (`bun path/to/file.ts`, `#!/usr/bin/env bun`). Use `node:` imports only, no Bun-specific runtime APIs (`Bun.file`, etc.) except in compiled-binary build scripts.
Third-party CLIs (vitest, `tsc`) keep their own shebangs; do not switch to `bun test`.

Never explicitly write types unless needed. Prefer type inference.

Run `bun run check` after completing a task (typecheck per package, `vitest` at workspace root, lint and format at workspace root).

Prefer inline code. Extract a function or helper only when it is reused or when duplication would be worse than the indirection. Do not split logic into small named pieces “for structure”. One straightforward flow is easier to read than a file of one-liner wrappers.

## Testing

Write fewer tests. Prefer integration tests.

Do not compromise production code for testing. No test-only hooks, exports, flags, or abstractions; no test-env branching or exposing internals for mocks. If something is hard to test, adapt the tests — not the product.

- Do not test what the type system already guarantees (eg schema shapes, literal unions, trivial getters).
- Test behavior that can actually regress.

Reserve unit tests for server-side logic with non-obvious transforms or edge cases.

## Workspace

- `packages/tui` — OpenTUI Solid frontend (`@caret/tui`)

## Architecture

```
┌─────────────────────────────────────────┐
│  @caret/tui (OpenTUI Solid)             │
│  chat, input, tool cards, permissions   │
└──────────────────┬──────────────────────┘
                   │ @cursor/sdk
                   ▼
┌─────────────────────────────────────────┐
│  Cursor SDK (external)                  │
│  Agent.create → send → run.stream()     │
└─────────────────────────────────────────┘
```

OpenCode splits this as `packages/tui` (frontend) + `packages/server` + `packages/opencode` (agent loop). caret inverts the backend: Cursor SDK is the loop; we only build the TUI.

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
