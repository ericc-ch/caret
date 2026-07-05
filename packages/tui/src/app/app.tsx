import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { LayoutProvider } from "../context/layout.ts"
import { SessionProvider, useSession } from "../context/session-context.ts"
import { formatError } from "../lib/format-error.ts"
import { copySelectedText } from "../lib/selection.ts"
import { localAgentCwd } from "../lib/workspace.ts"
import { Commit } from "../lib/transcript.ts"
import { createTranscriptStore } from "./transcript/transcript-store.ts"
import { AppShell } from "./app-shell.tsx"

function AppInner() {
  const session = useSession()
  const renderer = useRenderer()
  const store = createTranscriptStore()
  const [submitting, setSubmitting] = createSignal(false)

  useKeyboard((event) => {
    if (!event.ctrl || !event.shift || event.name !== "c") return
    if (!copySelectedText(renderer)) return
    event.preventDefault()
    event.stopPropagation()
  })

  const promptStatus = createMemo(() => {
    if (submitting()) return "running" as const
    if (session.booting()) return "connecting" as const
    if (session.bootError()) return "unavailable" as const
    return "ready" as const
  })

  createEffect(() => {
    const agentId = session.activeAgentId()
    store.switchAgent(agentId)
    if (!agentId || store.hasCache(agentId)) return

    const item = session.sessions().find((entry) => entry.agentId === agentId)
    const cwd = item ? localAgentCwd(item) : undefined

    void session
      .loadTranscript(agentId, cwd)
      .then((entries) => {
        if (session.activeAgentId() === agentId) {
          store.hydrate(agentId, entries)
        }
      })
      .catch((cause) => {
        if (session.activeAgentId() === agentId) {
          store.commit(Commit.Error({ text: formatError(cause) }))
        }
      })
  })

  createEffect(() => {
    const error = session.bootError()
    if (error) {
      store.commit(Commit.Error({ text: error }))
    }
  })

  onCleanup(() => {
    store.dispose()
  })

  const submit = (text: string) => {
    if (promptStatus() !== "ready") return
    setSubmitting(true)
    void session.prompt({ text, sink: store }).finally(() => setSubmitting(false))
  }

  return (
    <AppShell promptStatus={promptStatus()} onSubmit={submit} entries={store.entries} />
  )
}

export function App() {
  return (
    <SessionProvider>
      <LayoutProvider>
        <AppInner />
      </LayoutProvider>
    </SessionProvider>
  )
}
