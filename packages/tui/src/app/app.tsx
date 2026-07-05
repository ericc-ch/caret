import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Effect } from "effect"
import { LayoutProvider } from "../context/layout.ts"
import { SessionProvider, useSession } from "../context/session-context.ts"
import { runtime } from "../lib/runtime.ts"
import { Session } from "../services/session.ts"
import { Commit } from "./transcript/types.ts"
import { createTranscriptStore } from "./transcript/transcript-store.ts"
import { AppShell } from "./app-shell.tsx"
import type { PromptStatus } from "../components/prompt.tsx"

function AppInner() {
  const session = useSession()
  const store = createTranscriptStore()
  const [submitting, setSubmitting] = createSignal(false)

  const promptStatus = createMemo((): PromptStatus => {
    if (submitting()) return "running"
    if (session.booting()) return "connecting"
    if (session.bootError()) return "unavailable"
    return "ready"
  })

  onMount(() => {
    const syncBootError = () => {
      const error = session.bootError()
      if (error) {
        store.commit(Commit.Error({ text: error }))
      }
    }
    syncBootError()
  })

  onCleanup(() => {
    store.dispose()
    void runtime.dispose()
  })

  const submit = (text: string) => {
    if (promptStatus() !== "ready") return
    setSubmitting(true)
    void runtime
      .runPromise(
        Effect.flatMap(runtime.contextEffect, (context) =>
          Effect.provide(
            Session.use((service) => service.prompt({ text, sink: store })),
            context,
          ),
        ),
      )
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
