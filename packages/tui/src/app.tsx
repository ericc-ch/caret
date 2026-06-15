import { useRenderer } from "@opentui/solid"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Prompt } from "./components/prompt.tsx"
import { runtime } from "./lib/runtime.ts"
import { useTheme } from "./lib/theme.tsx"
import { formatError } from "./lib/format-error.ts"
import { createTranscript, type Transcript } from "./scrollback/transcript.tsx"
import { Session } from "./services/session.ts"

type BootState = "pending" | "ready" | "failed"

export function App() {
  const renderer = useRenderer()
  const { theme } = useTheme()
  const [boot, setBoot] = createSignal<BootState>("pending")
  const [running, setRunning] = createSignal(false)
  let transcript: Transcript | undefined

  const promptStatus = createMemo(() => {
    if (running()) return "running"
    if (boot() === "pending") return "connecting"
    if (boot() === "failed") return "unavailable"
    return "ready"
  })

  onMount(() => {
    transcript = createTranscript(renderer, theme)

    void (async () => {
      try {
        await runtime.runPromise(Session.use((session) => session.create()))
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
    const sink = transcript
    if (boot() !== "ready" || running() || !sink) return

    setRunning(true)
    try {
      await runtime
        .runPromise(Session.use((session) => session.prompt({ text, sink })))
        // PromptError is already written to the transcript sink internally inside Session.prompt
        .catch(() => undefined)
    } finally {
      setRunning(false)
    }
  }

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme().background}>
      <Prompt status={promptStatus()} onSubmit={submit} />
    </box>
  )
}
