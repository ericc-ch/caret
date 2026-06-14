import { useAtomValue } from "@effect/atom-solid"
import { useRenderer } from "@opentui/solid"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Prompt } from "./components/prompt/prompt.tsx"
import { sessionSnapshotAtom } from "./reactivity/atoms.ts"
import { runtime } from "./runtime/app-runtime.ts"
import { useTheme } from "./lib/theme.tsx"
import { formatError } from "./lib/format-error.ts"
import { createTranscript, type Transcript } from "./scrollback/transcript.tsx"
import { Session, type SessionId } from "./services/session.ts"

type BootState = "pending" | "ready" | "failed"

export function App() {
  const renderer = useRenderer()
  const { theme } = useTheme()
  const snapshot = useAtomValue(() => sessionSnapshotAtom)
  const [activeSessionId, setActiveSessionId] = createSignal<SessionId>()
  const [boot, setBoot] = createSignal<BootState>("pending")
  let transcript: Transcript | undefined

  const promptStatus = createMemo(() => {
    if (snapshot()?.status.type === "busy") return "running"
    if (boot() === "pending") return "connecting"
    if (boot() === "failed") return "unavailable"
    return "ready"
  })

  onMount(() => {
    transcript = createTranscript(renderer, theme)

    void (async () => {
      try {
        const info = await runtime.runPromise(Session.use((session) => session.create()))
        setActiveSessionId(info.id)
        setBoot("ready")
      } catch (cause) {
        transcript?.writeError(formatError(cause))
        setBoot("failed")
      }
    })()
  })

  onCleanup(() => {
    transcript?.dispose()
    void runtime.dispose()
  })

  const submit = async (text: string) => {
    const sessionId = activeSessionId()
    const sink = transcript
    if (!sessionId || snapshot()?.status.type === "busy" || !sink) return

    await runtime
      .runPromise(
        Session.use((session) =>
          session.prompt({
            sessionId,
            text,
            sink,
          }),
        ),
      )
      .catch(() => undefined)
  }

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme().background}>
      <Prompt status={promptStatus()} onSubmit={submit} />
    </box>
  )
}
