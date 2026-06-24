---
name: review
description: Use when the user runs /simplify, asks to simplify code, reduce complexity, or clean up a diff or scoped area. Simplify scoped code via parallel read-only review subagents, then apply targeted cleanup fixes.
---

Reduce complexity in scoped code without changing behavior. Review in parallel, fix selectively.

## Scope selection

1. If the user gave an explicit scope (paths, symbols, a diff, or a natural-language area), use that scope.
2. Otherwise, inspect local changes with both unstaged and staged diffs so staged work is not missed:

```bash
git diff --no-color
git diff --cached --no-color
```

Treat the combined non-empty output as the scope.

3. If there is no local diff, fall back to concrete files, symbols, or changes mentioned in the conversation.
4. If that also does not exist, fall back to the current HEAD commit:

```bash
git show --stat --patch --no-color HEAD
```

5. Preserve unrelated user changes. Do not broaden scope beyond the selected diff or mentioned files unless needed to understand existing patterns.

## Subagents

Launch the following five subagents **in parallel** with `model: "composer-2.5"`. They must only report findings and must **not** edit files, run formatters, create worktrees, or commit.

Pass the full combined diff when possible; if it is too large, pass the file list, relevant hunks, and a scope summary.

Before launching, read [docs/conventions.md](../../../docs/conventions.md) and skim `/tmp/references/effect-smol/LLMS.md` (or relevant `ai-docs/src/**` sections) so subagent prompts can reference project rules.

### 1. Code quality reviewer

Look for simplification opportunities, including but not limited to:

- low-information comments that restate the code instead of explaining intent, edge cases, or invariants
- one-off helpers only used once that could be inlined
- nullable value proliferation forcing defensive checks and unclear invariants
- catch-all try/catch blocks that swallow errors without explaining which exceptions are expected
- unnecessary abstraction: generic wrappers, config objects, or interfaces introduced before there is real reuse
- weak type escape hatches: avoidable `any`, casts, non-null assertions, or overly broad types
- duplicated or derived state stored instead of computed from source state
- dead or compatibility code: unused branches, parameters, fallback paths, or old behavior without evidence

### 2. Performance reviewer

Look for performance issues, including but not limited to:

- blocking operations in hot paths (sync Node.js or other blocking work on the event loop)
- uncached expensive operations: repeated computation, parsing, or lookups that could be reused safely
- busy waits: polling or loops that burn CPU instead of events, timers, or backoff
- string concatenation in loops
- N+1 I/O: per-item database, filesystem, network, or RPC calls where batching would help
- chatty logging or telemetry inside tight loops or hot paths

### 3. Reuse reviewer

Look for existing patterns or helpers to reuse, either elsewhere in the codebase or already present in the diff.

### 4. Conventions reviewer

Check scoped code against [docs/conventions.md](../../../docs/conventions.md):

- prefer type inference; avoid explicit types unless needed
- extract helpers only when reused or when duplication is worse than indirection
- avoid duplicating logic across files; prefer changing existing code over local shortcuts
- minimize nesting
- testing: fewer tests, prefer integration tests; no test-only hooks in production code; do not test what types already guarantee; test behavior that can regress

Also respect [AGENTS.md](../../../AGENTS.md) for workspace tooling (Bun, `node:` imports, `bun run check`).

### 5. Effect idioms reviewer

For Effect code in scope, check against `/tmp/references/effect-smol` (source of truth; do not use `node_modules` or external Effect docs):

- prefer `Effect.gen` and `Effect.fn("name")` over combinator-only style
- do not create functions that return `Effect.gen`; use `Effect.fn` instead
- do not use `.pipe` on `Effect.fn` definitions; pass combinators as extra `Effect.fn` arguments
- prefer `Context.Service` / Layer patterns for modular, testable structure
- use `Schema.TaggedErrorClass` for typed errors; `return yield*` when raising errors
- match patterns in `ai-docs/src/**` for the relevant domain (streams, layers, errors, testing, etc.)

Read `/tmp/references/effect-smol/LLMS.md` first; drill into `ai-docs/src/` examples when the scoped code touches a specific area.

## Fixing

1. Aggregate findings from all subagents.
2. Make **targeted** fixes that reduce complexity or reuse existing patterns while preserving behavior.
3. Skip issues that need additional user context or require a much larger refactor than the original scope. List skipped recommendations in the final summary.
4. After editing, run the most relevant lightweight checks for touched files. When practical, run `bun run check` at the workspace root.
5. Summarize what was fixed and what was skipped but recommended.

## Deferral

If the user asks not to act yet (e.g. "don't actually do anything yet"), stop after scope selection and optionally outline which subagents would run. Do not launch subagents or edit files until they confirm.

## Output format

```markdown
## Scope

[What was reviewed]

## Findings

### Code quality

...

### Performance

...

### Reuse

...

### Conventions

...

### Effect idioms

...

## Fixes applied

- ...

## Skipped (recommended)

- ...

## Checks

[What ran and results, or what was skipped]
```
