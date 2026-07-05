import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { LayoutProvider } from "../context/layout.ts"
import { SessionProvider, useSession } from "../context/session-context.ts"
import { runtime } from "../lib/runtime.ts"
import { Session } from "../services/session.ts"
import { Commit } from "./transcript/types.ts"
import { createTranscriptStore } from "./transcript/transcript-store.ts"
import { AppShell } from "./app-shell.tsx"

function AppInner() {
  const session = useSession()
  const store = createTranscriptStore()
  const [submitting, setSubmitting] = createSignal(false)

  const promptStatus = createMemo(() => {
    if (submitting()) return "running" as const
    if (session.booting()) return "connecting" as const
    if (session.bootError()) return "unavailable" as const
    return "ready" as const
  })

  createEffect(() => {
    const error = session.bootError()
    if (error) {
      store.commit(Commit.Error({ text: error }))
    }
  })

  onCleanup(() => {
    store.dispose()
    void runtime.dispose()
  })

  const submit = (text: string) => {
    if (promptStatus() !== "ready") return
    setSubmitting(true)
    void runtime
      .runPromise(Session.use((service) => service.prompt({ text, sink: store })))
      .finally(() => setSubmitting(false))
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
