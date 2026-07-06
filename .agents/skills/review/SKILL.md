---
name: review
description: Use when the user runs /simplify, asks to simplify code, reduce complexity, or clean up a diff or scoped area. Runs /simplify plus project conventions and Effect idioms review.
---

Follow the **`/simplify`** command for scope selection, the three standard read-only review subagents (code quality, performance, reuse), fixing, checks, and the final summary.

In addition, launch these two subagents **in parallel** with `/simplify`'s subagents. Same rules: read-only, `model: "composer-2.5"`, no edits, run formatters, worktrees, or commits. Pass the same scope/diff payload.

Before launching, read [docs/conventions.md](../../../docs/conventions.md) and skim `/tmp/references/effect-smol/LLMS.md` (or relevant `ai-docs/src/**` sections) so subagent prompts can reference project rules.

## Extra subagents

### Conventions reviewer

Check scoped code against [docs/conventions.md](../../../docs/conventions.md):

- prefer type inference; avoid explicit types unless needed
- extract helpers only when reused or when duplication is worse than indirection
- avoid duplicating logic across files; prefer changing existing code over local shortcuts
- minimize nesting
- testing: fewer tests, prefer integration tests; no test-only hooks in production code; do not test what types already guarantee; test behavior that can regress

Also respect [AGENTS.md](../../../AGENTS.md) for workspace tooling (Bun, `node:` imports, `bun run check`).

### Effect idioms reviewer

For Effect code in scope, check against `/tmp/references/effect-smol` (source of truth; do not use `node_modules` or external Effect docs):

- prefer `Effect.gen` and `Effect.fn("name")` over combinator-only style
- do not create functions that return `Effect.gen`; use `Effect.fn` instead
- do not use `.pipe` on `Effect.fn` definitions; pass combinators as extra `Effect.fn` arguments
- prefer `Context.Service` / Layer patterns for modular, testable structure
- use `Schema.TaggedErrorClass` for typed errors; `return yield*` when raising errors
- match patterns in `ai-docs/src/**` for the relevant domain (streams, layers, errors, testing, etc.)

Read `/tmp/references/effect-smol/LLMS.md` first; drill into `ai-docs/src/` examples when the scoped code touches a specific area.

## Fixing and output

Aggregate conventions and Effect findings with `/simplify`'s results. Apply `/simplify`'s fixing rules; include skipped conventions/Effect recommendations in the final summary under **Skipped (recommended)**.

Add **Conventions** and **Effect idioms** sections to the summary.

## Deferral

If the user asks not to act yet (e.g. "don't actually do anything yet"), stop after scope selection and outline which subagents would run. Do not launch subagents or edit files until they confirm.
