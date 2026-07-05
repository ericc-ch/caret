# @caret/tui — Alt-screen shell implementation plan

This document is the single source of truth for rebuilding `@caret/tui` into a
Cursor-like full-screen TUI. All product decisions from planning are locked
here. Implement in order; do not re-litigate choices unless the user explicitly
changes them.

**References (read-only, under `/tmp/references/`):**

- `opencode/packages/tui` — primary UI/keymap/layout reference (main TUI uses
  `alternate-screen`, not split-footer)
- `t1code/apps/tui` — scrollbox + sticky scroll pattern
- `opentui/packages/core`, `opentui/packages/keymap` — renderer, MarkdownRenderable, keymap
- `cursor-cookbook` — SDK usage patterns
- External: [terminal-control](https://github.com/anomalyco/terminal-control) —
  agent-driven manual verification after implementation

**Workspace rules:** Bun, Effect v4, OpenTUI Solid, `@cursor/sdk`. Run
`bun run check` when done. Do not add formal CI e2e mocks or test-only product
flags unless the user asks.

---

## 1. Goal

Replace the current minimal split-footer TUI (prompt-only render tree +
`ScrollbackSurface` transcript) with a **full-screen alt-buffer application**
that matches the Cursor IDE chat layout (adapted for terminal):

- **Left:** project header + session list (Cursor SDK local agents)
- **Center:** session header, scrollable transcript, prompt dock
- **Right:** Changes + Files context rail
- **Bottom:** status bar (git branch, cwd, connection status)

OpenCode’s **main** TUI (`packages/tui/src/app.tsx`, no explicit `screenMode` →
defaults to `alternate-screen`) is the architectural model. OpenCode’s
`--mini` split-footer mode is **not** in scope for v1.

---

## 2. Locked decisions

| Area | Decision |
|------|----------|
| Layout | Full 3-panel shell + status bar (v1) |
| Default renderer | `screenMode: "alternate-screen"`, `externalOutputMode: "passthrough"` |
| Split-footer / `--mini` | **Deferred** — remove/replace current split-footer path; alt-screen only |
| Sessions | **Cursor SDK local** — `Agent.list` / `resume` / `create`; persisted in SDK SQLite under workspace state root |
| Nav grouping | **Project header + sessions** below; filter `Agent.list({ runtime: "local", cwd })` |
| Nav actions | **Select session + New chat only** (no rename/delete v1) |
| Transcript replay | **Hybrid:** SDK is source of truth; in-memory cache per `agentId` for fast re-switch |
| User messages | Plain styled text (`›` prefix, wrap) |
| Assistant messages | **`MarkdownRenderable`** (streaming supported) |
| Thinking | Styled text (existing thinking opacity / warning color) |
| Right rail | **Changes + Files** tabs (git-based); **no Terminal panel** |
| Status bar | **Minimal:** git branch, truncated cwd, connection status |
| Narrow terminals | **Overlays** with scrim: `\` toggles nav, `]` toggles context (OpenCode pattern) |
| Keymap | **Full OpenCode port** — palette, slash commands, help, leader, mode stack |
| Missing features in palette | Commands **registered** but run **stub** → toast/dialog: “Not available in caret yet” |
| Automated testing | **No** `CARET_E2E` mock layer; verify manually with **terminal-control** after implementation |
| Terminal panel / libghostty | **Skipped** entirely for v1 |

---

## 3. Current state (what exists today)

```
packages/tui/src/
├── main.tsx              # split-footer, footerHeight: 3
├── app.tsx               # Prompt only; bootAtom + transcriptAtom
├── components/prompt.tsx
├── scrollback/transcript.tsx   # ScrollbackSurface + writeToScrollback (DELETE/REPLACE)
├── services/session.ts   # Single Agent.create; no list/resume
└── lib/theme.tsx
```

**Remove or replace:** `scrollback/transcript.tsx` split-footer transcript path,
`main.tsx` split-footer config. **Extend:** `services/session.ts` for multi-session
SDK lifecycle.

---

## 4. Target architecture

```
main.tsx
  render(..., { screenMode: "alternate-screen" })
  createCliRenderer({ externalOutputMode: "passthrough", ... })  # match opencode main

AppShell
├── StatusBar
├── Row (flexGrow=1, minHeight=0)
│   ├── NavPanel
│   ├── CenterColumn
│   │   ├── SessionHeader
│   │   ├── scrollbox (transcript, stickyScroll bottom)
│   │   └── PromptDock
│   └── ContextRail (Changes | Files)
└── Overlays (when narrow): NavOverlay, ContextOverlay + scrim

Services / state
├── SessionService (Effect) — list, resume, create, active agent, prompt
├── TranscriptStore — entries per agentId + cache + replay from SDK
├── LayoutStore — sidebarOpen, contextOpen, contextTab, wide breakpoint
└── GitContext — branch, changed files (for rail)

Keymap (OpenCode-shaped)
├── @opentui/keymap + registerOpencodeKeymap pattern
├── Command palette + help dialog
└── Stub handler for unimplemented commands
```

### ASCII layout (wide, ≥120 cols)

```
┌─ Nav ─────────┐│┌─ Session header ──────────────────────────┐│┌─ Context ──┐
│  caret        │││  General chat                             │││ Changes    │
│  ~/proj/caret ││├─────────────────────────────────────────┤││ Files      │
│               │││ scrollbox (transcript)                  │││            │
│  + New chat   │││                                         │││ git diff   │
│  ▸ Session 1  │││                                         │││ summary    │
│    Session 2  ││├─────────────────────────────────────────┤││            │
│               │││ › Send follow-up…        Composer 2.5   │││            │
└───────────────┘│└─────────────────────────────────────────┘│└────────────┘
 main · ~/caret/caret                                      connecting…
```

---

## 5. Cursor SDK — sessions (local only)

Caret is **local-only**. Always pass explicit `local: { cwd: process.cwd() }`.

### APIs to use

```typescript
import { Agent } from "@cursor/sdk"

// List sessions for nav (source of truth for session list)
const { items, nextCursor } = await Agent.list({
  runtime: "local",
  cwd: process.cwd(),
  limit: 50,
})
// items: SDKAgentInfo — agentId, name, summary, lastModified, status, cwd

// New chat
const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY,
  name: "General chat", // or first line of first prompt later
  model: { id: "composer-2.5" },
  local: { cwd: process.cwd() },
})

// Switch session
const agent = await Agent.resume(agentId, {
  apiKey: process.env.CURSOR_API_KEY,
  local: { cwd: process.cwd() },
})

// Replay transcript on first open (hybrid cache miss)
const messages = await Agent.messages.list(agentId, {
  runtime: "local",
  cwd: process.cwd(),
})
```

Persistence is **SDK-managed** (`SqliteLocalAgentStore` under
`getDefaultSdkStateRoot(cwd)`). Do **not** build a separate `~/.caret/sessions/`
store for agent IDs. Optional: small caret KV for UI-only prefs (sidebar open,
last context tab).

### Session service responsibilities

Extend `packages/tui/src/services/session.ts`:

| Method | Behavior |
|--------|----------|
| `list()` | `Agent.list({ runtime: "local", cwd })` → nav items |
| `create(name?)` | `Agent.create` → set active agent → empty transcript cache entry |
| `resume(agentId)` | Dispose previous agent handle → `Agent.resume` → load/cache transcript |
| `prompt({ text, onCommit })` | `agent.send` + stream → `StreamCommit` callbacks (same events as today) |
| `activeAgentId()` | Current agent |

Use `await using` / `Symbol.asyncDispose` for agent handles. On switch, close
previous agent before resuming next.

### Hybrid transcript replay

```typescript
type TranscriptEntry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "error"; text: string }
  | { id: string; kind: "thinking"; text: string; streaming: boolean }
  | { id: string; kind: "assistant"; text: string; streaming: boolean }

// Map Agent.messages.list + live stream → TranscriptEntry[]
// Cache: Map<agentId, TranscriptEntry[]>
// On resume: if cache hit → use cache; else replay SDK messages → populate cache
// On new commit during prompt: update cache in place
// Invalidate cache entry when? — optional: on external agent mutation; v1: trust in-process only
```

Map SDK message shapes to entries. Assistant body → markdown string for
`MarkdownRenderable`.

---

## 6. OpenTUI renderer setup

Match OpenCode main TUI (`/tmp/references/opencode/packages/tui/src/app.tsx`):

```typescript
const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {}, // or env-gated like t1code
  useMouse: true,       // optional v1
  autoFocus: false,
  openConsoleOnError: false,
  // no screenMode → alternate-screen default, OR explicit:
  screenMode: "alternate-screen",
})
```

Solid entry (`@opentui/solid` `render()`): pass same options. Full viewport for
`AppShell` root: `width="100%" height="100%" flexDirection="column"`.

**Do not** use `writeToScrollback`, `createScrollbackSurface`, or split-footer
in v1.

---

## 7. Component specs

### 7.1 `AppShell` (`src/app/app-shell.tsx`)

Root layout. Reads `useTerminalDimensions()` for responsive behavior.

**Breakpoints (match OpenCode session route ~42 col sidebar):**

| Width | Nav | Context rail |
|-------|-----|--------------|
| ≥120 cols | Docked, width 28 | Docked, width 24 |
| 80–119 cols | Overlay (`\`) | Overlay (`]`) |
| <80 cols | Overlay | Overlay |

`wide()` memo: `dimensions().width >= 120`. When docked, subtract panel widths
from center column width for markdown `width="100%"`.

### 7.2 `NavPanel` (`src/app/nav-panel.tsx`)

- Background: `theme.backgroundPanel`
- Top: app title `caret` + truncated project path (`process.cwd()` display)
- Button: `+ New chat` → `Session.create()`
- List: `For each={sessions()}` from `Agent.list`
  - Selected: `accent` + `backgroundElement`
  - Label: `item.name` or `item.summary` or truncated `agentId`
  - Click → `Session.resume(agentId)`
- No delete/rename v1

Reference: OpenCode session list patterns in
`/tmp/references/opencode/packages/tui/src/component/dialog-session-list.tsx`
(simplified).

### 7.3 `SessionHeader` (`src/app/session-header.tsx`)

- Active session title (`SDKAgentInfo.name` or default)
- Optional: subtle status (`running` / `ready`) from prompt + session state

### 7.4 Transcript scrollbox (`src/app/transcript/`)

Reference: `/tmp/references/opencode/packages/tui/src/routes/session/index.tsx`
lines ~1168–1281.

```tsx
<scrollbox
  ref={scrollRef}
  stickyScroll
  stickyStart="bottom"
  flexGrow={1}
  minHeight={0}
  viewportOptions={{ paddingRight: showScrollbar ? 1 : 0 }}
  verticalScrollbarOptions={{ ... }}
>
  <For each={entries()}>{(entry) => <TranscriptEntry entry={entry} />}</For>
</scrollbox>
```

**`TranscriptEntry`:**

| kind | Render |
|------|--------|
| `user` | `<text wrapMode="word">` with accent `›` |
| `error` | `<text fg={theme.error}>` |
| `thinking` | `<text fg={theme.warning} opacity>` — prefix `Thinking:` |
| `assistant` | `<MarkdownRenderable content={...} streaming={...} width="100%" syntaxStyle={syntax()} />` |

Register tree-sitter parsers if OpenCode does (see `opencode/packages/tui/src/parsers-config.ts`).

On new user message / stream complete: scroll to bottom (OpenCode `toBottom` pattern).

### 7.5 `PromptDock` (`src/components/prompt.tsx` → extend)

Keep existing textarea + keyBindings. Layout row:

```
› [textarea flexGrow] [model label muted] 
```

- Model label: `Composer 2.5` (from session config)
- Placeholder: `Send follow-up…` when ready
- Status: connecting / running / unavailable (existing `PromptStatus`)
- **Below scrollbox, not inside it** — sibling in center column `flexShrink={0}`

### 7.6 `ContextRail` (`src/app/context/`)

Tab strip: **Changes** | **Files** (no Terminal).

**Changes tab:**

- Run `git status --short` + diff stat (or parse `git diff --stat`)
- Show file paths with `+N` / `-N` colors (`theme` diff colors — add if missing)
- Reference: `/tmp/references/opencode/packages/tui/src/feature-plugins/sidebar/files.tsx`

**Files tab:**

- List modified files from same git source
- Optional: watch refresh on prompt complete / interval debounce

If git not a repo: show muted “Not a git repository”.

### 7.7 `StatusBar` (`src/app/status-bar.tsx`)

Single row, `flexShrink={0}`, `justifyContent="space-between"`:

- Left: `git branch` (or `detached`) · truncated cwd
- Right: connection status (`connecting` | `ready` | `running` | `unavailable`)

Reference: `/tmp/references/opencode/packages/tui/src/routes/session/footer.tsx`
(simplified).

### 7.8 Overlays

When `!wide()` and panel open: absolute full-screen box, semi-transparent scrim
(`RGBA black ~70`), panel aligned (nav left, context right). Click scrim or
Escape closes. Copy OpenCode session sidebar overlay:
`/tmp/references/opencode/packages/tui/src/routes/session/index.tsx` ~1324–1341.

---

## 8. Keymap — full OpenCode port with stubs

### Dependencies

Add to `packages/tui/package.json`:

```json
"@opentui/keymap": "catalog:opentui"
```

(Follow root catalog version for opentui packages.)

### Setup (copy pattern from OpenCode)

Reference files:

- `/tmp/references/opencode/packages/tui/src/keymap.tsx` — `registerOpencodeKeymap`, mode stack, leader
- `/tmp/references/opencode/packages/tui/src/config/keybind.ts` — command → default binding map
- `/tmp/references/opencode/packages/tui/src/component/command-palette.tsx`
- `/tmp/references/opencode/packages/tui/src/ui/dialog-help.tsx`

Structure for caret:

```
src/keymap/
├── index.ts           # CaretKeymapProvider, registerCaretKeymap
├── keybind.ts         # port Definitions from opencode (same command names)
├── commands.ts        # appCommands() — map command name → run handler
├── stubs.ts           # default stub: toast "Not available in caret yet"
└── implemented.ts     # commands that actually work in v1
```

### v1 implemented commands (real handlers)

| Command | Action |
|---------|--------|
| `app.exit` | Destroy renderer / exit |
| `session.new` | New chat |
| `session.list` | Focus nav / open nav overlay |
| `session.sidebar.toggle` | Toggle nav (if named differently in opencode, map accordingly) |
| `help.show` | Help dialog |
| `command.palette.show` | Open palette |
| Context toggle | Custom or map to existing — toggle context rail |

All other commands from OpenCode `Definitions` / `appCommands()`:** register with
stub handler** (user chose full catalog visible).

### Stub behavior

```typescript
function stubCommand(name: string) {
  return () => {
    toast.show({ message: `Not available in caret yet: ${name}`, variant: "info" })
  }
}
```

Do not hide unimplemented commands.

### Prompt layer

Use `registerManagedTextareaLayer` from `@opentui/keymap/addons/opentui` when
prompt textarea focused (copy OpenCode `registerOpencodeKeymap`).

### Default bindings for panels

| Key | Action |
|-----|--------|
| `\` | Toggle nav overlay (when narrow) / focus nav |
| `]` | Toggle context overlay |

(Exact keys configurable via keybind definitions; document in help.)

---

## 9. Theme

Extend existing `src/lib/theme.tsx` if needed:

| Token | Use |
|-------|-----|
| `backgroundPanel` | Nav, context rail |
| `backgroundElement` | Selected nav item, prompt dock elevation |
| `border` | Column dividers |
| `accent` | User `›`, selected nav |
| `diffAdded` / `diffRemoved` | Context rail (add if missing) |

Use `SplitBorder` pattern from OpenCode `ui/border.ts` for vertical dividers
between columns (optional polish).

Transparent `background` for main canvas (terminal default shows through).

---

## 10. Proposed file structure

```
packages/tui/src/
├── main.tsx
├── app/
│   ├── app.tsx                 # boot, providers, SessionHeader wiring
│   ├── app-shell.tsx
│   ├── nav-panel.tsx
│   ├── session-header.tsx
│   ├── status-bar.tsx
│   ├── transcript/
│   │   ├── transcript-store.ts # cache + SDK replay
│   │   ├── transcript-entry.tsx
│   │   └── types.ts
│   └── context/
│       ├── rail.tsx
│       ├── changes-tab.tsx
│       ├── files-tab.tsx
│       └── git.ts              # git status helpers
├── components/
│   ├── prompt.tsx              # PromptDock
│   └── register.ts             # image renderable (keep)
├── context/
│   ├── helper.ts               # createSimpleContext (from opencode)
│   ├── layout.ts
│   └── session-context.ts      # active agent, sessions list signals
├── keymap/
│   └── ...                     # §8
├── services/
│   └── session.ts              # extended SDK lifecycle
├── lib/
│   ├── theme.tsx
│   ├── runtime.ts
│   ├── format-error.ts
│   └── layout.ts               # breakpoints, path display
└── scrollback/                 # REMOVE after migration
    ├── stream-commit.ts        # KEEP types — move to transcript/types or services
    └── transcript.tsx          # DELETE split-footer impl
```

Move `StreamCommit` / `Commit` tagged enum to `src/app/transcript/types.ts` or
keep `stream-commit.ts` without scrollback dependency.

---

## 11. Implementation phases

Execute in order. Complete each phase before the next. Run `bun run check` after
each phase.

### Phase 1 — Renderer + shell skeleton

- [ ] Change `main.tsx` to `alternate-screen` + passthrough
- [ ] Create `AppShell` with empty panels, correct flex/`minHeight={0}` chain
- [ ] Add `StatusBar` stub
- [ ] Wire `ThemeProvider`, full viewport background
- [ ] **Verify:** app launches full-screen alt buffer, empty columns visible

### Phase 2 — Session service + SDK nav

- [ ] Extend `session.ts`: `list`, `create`, `resume`, dispose on switch
- [ ] `NavPanel`: project header, list from `Agent.list`, New chat
- [ ] Session context (active `agentId`, refresh list on create)
- [ ] Boot: list existing sessions; if none, auto-create or show empty state
- [ ] **Verify:** can create two sessions, switch between them (agents resume)

### Phase 3 — Transcript + prompt

- [ ] `TranscriptStore` hybrid cache + SDK replay (`Agent.messages.list`)
- [ ] Scrollbox + `TranscriptEntry` (plain user, markdown assistant, thinking, error)
- [ ] Wire `Session.prompt` streaming → commits → store
- [ ] `PromptDock` below scrollbox; sticky scroll on stream
- [ ] Remove old `scrollback/transcript.tsx` usage
- [ ] **Verify:** send message, see streaming markdown, switch session and back (replay)

### Phase 4 — Context rail

- [ ] Git helpers (`branch`, `status --short`, diff stats)
- [ ] Changes tab + Files tab
- [ ] Tab state in layout context
- [ ] **Verify:** modified file appears after agent edits a file

### Phase 5 — Responsive overlays

- [ ] `wide()` breakpoint memos
- [ ] Nav/context overlays + scrim
- [ ] Keybinds `\` and `]` (temporary hardcode OK until Phase 6)

### Phase 6 — Keymap full port

- [ ] Add `@opentui/keymap`
- [ ] Port `keybind.ts` definitions + `registerCaretKeymap`
- [ ] Command palette + help dialog (copy OpenCode UI components, adapt imports)
- [ ] `appCommands()`: implemented vs stub
- [ ] Toast component for stubs
- [ ] **Verify:** palette opens, stub command shows toast, `session.new` works

### Phase 7 — Polish + manual verification

- [ ] Session header title from active agent
- [ ] Empty states (no sessions, no git repo, connecting)
- [ ] Error display for boot failures
- [ ] `destroyRenderer` cleanup (OpenCode `util/renderer.ts`)
- [ ] **terminal-control smoke test** (see §12)

---

## 12. Manual verification (terminal-control)

No automated e2e suite required. After implementation, the implementing agent
should verify manually:

```bash
# Install CLI (once)
cargo install terminal-control

# Launch caret TUI in named session
termctrl start caret --host opentui --cols 120 --rows 40 -- \
  bun run /home/erickc/projects/caret/packages/tui/src/main.tsx

termctrl wait caret "caret" --timeout 10000
termctrl show caret

# New session / type / submit (adjust wait strings to actual UI)
termctrl send caret 'text:hello' enter
termctrl wait caret "hello" --timeout 60000
termctrl show caret

termctrl stop caret
```

Requires `CURSOR_API_KEY` in environment for live SDK. Use `--host opentui` always.

Optional: `@kitlangton/terminal-control` npm package for scripted checks later —
not required for v1.

---

## 13. Explicit non-goals (v1)

Do **not** implement unless user asks:

- Split-footer / `CARET_MINI` / `ScrollbackSurface` transcript
- Terminal panel (any tier), libghostty-vt, node-pty embed
- Session rename / delete in nav
- Multi-cwd session list (only current `process.cwd()`)
- Cloud agents (`bc-*` IDs)
- MCP / LSP / subagent UI (palette stubs only)
- Formal CI e2e / `CARET_E2E` mock SDK layer
- Workspace tree like Cursor sidebar (multiple projects)

---

## 14. OpenCode files to read first

| Topic | Path under `/tmp/references/opencode/packages/tui/` |
|-------|------------------------------------------------------|
| Renderer boot | `src/app.tsx` (~194–206) |
| Session layout | `src/routes/session/index.tsx` |
| Sidebar | `src/routes/session/sidebar.tsx` |
| Footer / status | `src/routes/session/footer.tsx` |
| Keymap | `src/keymap.tsx`, `src/config/keybind.ts` |
| Command palette | `src/component/command-palette.tsx` |
| Context helper | `src/context/helper.tsx` |
| Files sidebar | `src/feature-plugins/sidebar/files.tsx` |
| Border | `src/ui/border.ts` |
| Toast | `src/ui/toast.tsx` |

---

## 15. SDK quick reference

```typescript
// Always local, always explicit cwd
local: { cwd: process.cwd() }

// List nav
Agent.list({ runtime: "local", cwd: process.cwd() })

// Active agent
Agent.resume(agentId, { apiKey, local: { cwd } })
Agent.create({ name, model: { id: "composer-2.5" }, local: { cwd }, apiKey })

// Replay
Agent.messages.list(agentId, { runtime: "local", cwd })

// Stream (unchanged from current session.ts)
const run = await agent.send(text)
for await (const event of run.stream()) { ... }
await run.wait()
```

Skill: `/home/erickc/.cursor/skills-cursor/sdk/SKILL.md`

---

## 16. Success criteria

v1 is done when:

1. TUI opens in **alternate-screen** with full 3-column shell + status bar
2. **Agent.list** populates nav; **New chat** and **session switch** work with SDK persistence
3. Transcript shows **markdown assistant** / plain user; streaming + sticky scroll work
4. **Changes + Files** rails show git info when in a repo
5. **Narrow terminal** overlays work
6. **Command palette + help** open; unimplemented commands show stub toast
7. `bun run check` passes
8. Manual terminal-control smoke pass documented in PR/commit message

---

## Decision log (planning session)

| # | Question | Answer |
|---|----------|--------|
| 1 | Shell scope | A — full 3-panel v1 |
| 2 | Sessions | C — Cursor SDK local, persisted |
| 3 | Transcript replay | C — hybrid SDK + cache |
| 4 | Default screen mode | A — alternate-screen |
| 5 | Terminal panel | Skipped |
| 6 | Context rail | A — Changes + Files |
| 7 | E2E testing | Manual terminal-control only |
| 8 | Transcript render | C — markdown assistant, plain user |
| 9 | Nav grouping | B — project header + sessions |
| 10 | Split-footer mini | B — defer |
| 11 | Status bar | A — minimal |
| 12 | Narrow layout | A — overlays |
| 13 | Nav actions | A — select + new only |
| 14 | Keymap scope | C — full OpenCode port |
| 15 | Palette commands | C — full catalog + stubs |
| 16 | Stub behavior | C — visible, toast on run |
