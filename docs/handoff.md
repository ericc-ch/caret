# Handoff: minimal interactive UI (split-footer)

**Date:** 2026-06-13  
**Status:** Design explored, no implementation started  
**Next session goal:** Spike OpenTUI `split-footer` with screenshot-style scrollback + caret `Prompt` in footer

---

## User intent

Build a **minimal UI mode** for caret that:

1. Looks like the OpenCode `run` screenshot aesthetic — log-style transcript (`›` user, `* Glob …`, `→ Read …`, dim `Thinking:` blocks, bash output).
2. Keeps a **fully interactive prompt in the footer** (multiline textarea, submit, connecting/running hints) — not a one-shot `run` command.
3. Avoids **in-app scroll management** — user does not want to babysit a `scrollbox` / sticky-scroll.

The user explicitly does **not** want to match the screenshot pixel-perfect at the expense of interactivity. They want the **log aesthetic in scrollback** and **caret-style prompt UX in the footer**.

---

## Key conclusion

**Yes, OpenTUI supports this.** Use `screenMode: "split-footer"` with `externalOutputMode: "capture-stdout"`.

| Lane | Responsibility |
|------|----------------|
| **Scrollback (above)** | Append-only transcript via `writeToScrollback` / `createScrollbackWriter` |
| **Footer (below)** | Mutable Solid UI: prompt, status, later permissions/menus |

OpenCode’s `opencode run --interactive` is the reference implementation — same scrollback look as non-interactive `run`, plus live footer.

---

## Screen mode decision

| Mode | Verdict for caret minimal |
|------|---------------------------|
| `alternate-screen` | Current caret default. Requires `scrollbox` + `stickyScroll`. **Reject** for minimal mode. |
| `main-screen` | Not true native scrollback. **Reject.** |
| `split-footer` | Terminal owns scroll; footer pinned. **Use this.** |

OpenTUI docs: `.references/opentui/packages/web/src/content/docs/core-concepts/renderer.mdx` (Screen modes, Writing to scrollback).

---

## OpenCode reference map (read-only, `.references/`)

Do **not** port OpenCode’s SDK/sync layer. Borrow layout and scrollback patterns only.

| Path | Why |
|------|-----|
| `packages/opencode/src/cli/cmd/run/runtime.lifecycle.ts` | Boots `split-footer` renderer (`footerHeight: 4`, `capture-stdout`) |
| `packages/opencode/src/cli/cmd/run/types.ts` | Two-lane model: `StreamCommit` → scrollback, `FooterOutput` → footer |
| `packages/opencode/src/cli/cmd/run/footer.ts` | `RunFooter` — mutable footer, append-only scrollback boundary |
| `packages/opencode/src/cli/cmd/run/scrollback.writer.tsx` | Static scrollback entries (Solid `createScrollbackWriter`) |
| `packages/opencode/src/cli/cmd/run/scrollback.surface.ts` | Streaming assistant/reasoning/tool progress |
| `packages/opencode/src/cli/cmd/run/entry.body.ts` | `Thinking:` reasoning → dim markdown in scrollback |
| `packages/opencode/src/cli/cmd/run/footer.view.tsx` | Footer layout: composer + statusline; expands for menus |
| `packages/opencode/src/cli/cmd/run/footer.prompt.tsx` | Interactive prompt state machine |

**Not** the right reference for minimal mode: `packages/tui/` (full alternate-screen TUI with `kv.signal` toggles). OpenCode has no single “minimal UI mode” preset there — only granular visibility flags and collapsed thinking (`thinkingMode === "hide"`, legacy name `"minimal"`).

---

## Caret current state (`packages/tui`)

Entry: `src/index.tsx` — `render()` with default `alternate-screen`.

Layout: `src/app.tsx` — column with `ChatView` (scrollbox) + `Prompt` in the same tree.

| File | Role |
|------|------|
| `src/components/chat/chat-view.tsx` | `scrollbox` + `stickyScroll` + `stickyStart="bottom"` |
| `src/components/prompt/prompt.tsx` | Interactive textarea (keep; move to footer) |
| `src/components/chat/*.tsx` | Bubble components — may inform scrollback styling or be replaced by log-style writers |
| `src/services/session.ts` | SDK session + message model |

No split-footer or scrollback writer code exists yet.

---

## Proposed architecture for caret

```
┌──────────────────────────────────────┐
│  scrollback (terminal scroll)        │
│  log-style: user, tools, thinking,   │
│  bash — via createScrollbackWriter   │
├──────────────────────────────────────┤
│  footer (Solid, mutable)             │
│  Prompt + hints/spinner + status     │
│  (footerHeight grows for menus)      │
└──────────────────────────────────────┘
```

**Session flow:** SDK stream events → reducer emitting `StreamCommit`-like entries → scrollback append. User input only through footer `Prompt`.

**Minimal preset** (future): policy at commit time, not a different screen mode — e.g. hide or one-line thinking, inline tools only, plain assistant text.

---

## Suggested next steps (in order)

1. **Spike renderer boot** — `createCliRenderer({ screenMode: "split-footer", footerHeight: 6, externalOutputMode: "capture-stdout", consoleMode: "disabled" })` instead of bare `render()` defaults in `index.tsx` (or a parallel entry for experimentation).
2. **Footer mount** — Move existing `Prompt` into footer region; verify focus, submit, multiline, running/disabled states.
3. **Hardcoded scrollback** — Two `createScrollbackWriter` lines (user `› …`, dim `Thinking: …`) to validate layout and terminal scroll.
4. **Wire session** — Map `session.ts` / SDK events to scrollback commits; reference OpenCode `stream.transport.ts` + `scrollback.surface.ts` for streaming patterns.
5. **Run `bun run check`** when spike lands.

Defer: tool cards, permissions UI, CLI packaging, full OpenCode footer (model picker, queue, subagents).

---

## Open questions (unresolved)

- **Rich chat mode later?** Keep alternate-screen + scrollbox as a separate mode, or replace entirely?
- **Bubble vs log in scrollback:** Screenshot aesthetic favors log lines; caret bubbles could be rendered via scrollback writers if desired — not decided.
- **Thinking visibility:** show full dim blocks (screenshot), hide entirely, or one-line on `final`?

---

## Transcript

Full conversation: `.cursor/projects/home-erickc-projects-caret/agent-transcripts/8b936b07-ab81-4cb1-97a6-f2a3a7cfd3f4/8b936b07-ab81-4cb1-97a6-f2a3a7cfd3f4.jsonl`
