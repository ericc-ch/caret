import { useRenderer } from "@opentui/solid"
import { useAtom, useAtomValue } from "@effect/atom-solid"
import { Atom } from "effect/unstable/reactivity"
import { Effect } from "effect"
import { onCleanup, onMount } from "solid-js"
import { Prompt } from "./components/prompt.tsx"
import { runtime } from "./lib/runtime.ts"
import { useTheme } from "./lib/theme.tsx"
import { formatError } from "./lib/format-error.ts"
import { Commit } from "./scrollback/stream-commit.ts"
import { createTranscript, type Transcript } from "./scrollback/transcript.tsx"
import { Session } from "./services/session.ts"

type BootState = "pending" | "ready" | "failed"

const bootAtom = Atom.make<BootState>("pending")
const transcriptAtom = Atom.make<Transcript | undefined>(undefined)

const submitAtom = Atom.fn<string>()((text: string, get) => {
  const boot = get.registry.get(bootAtom)
  const sink = get.registry.get(transcriptAtom)
  if (boot !== "ready" || !sink) {
    return Effect.void
  }

  return Effect.flatMap(runtime.contextEffect, (context) =>
    Effect.provide(
      Session.use((session) => session.prompt({ text, sink })),
      context,
    ),
  ).pipe(Effect.catch(() => Effect.void))
})

const promptStatusAtom = Atom.readable((get) => {
  const boot = get(bootAtom)
  const submitResult = get(submitAtom)
  if (submitResult.waiting) return "running"
  if (boot === "pending") return "connecting"
  if (boot === "failed") return "unavailable"
  return "ready"
})

export function App() {
  const renderer = useRenderer()
  const { theme } = useTheme()
  const [, setBoot] = useAtom(() => bootAtom)
  const [getTranscript, setTranscript] = useAtom(() => transcriptAtom)
  const [, submit] = useAtom(() => submitAtom)

  const promptStatus = useAtomValue(() => promptStatusAtom)

  onMount(() => {
    const transcript = createTranscript(renderer, theme)
    setTranscript(transcript)

    void (async () => {
      try {
        await runtime.runPromise(Session.use((session) => session.create()))
        setBoot("ready")
      } catch (cause) {
        getTranscript()?.commit(Commit.Error({ text: formatError(cause) }))
        setBoot("failed")
      }
    })()
  })

  onCleanup(() => {
    getTranscript()?.dispose()
    void runtime.dispose()
  })

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme().background}>
      <Prompt status={promptStatus()} onSubmit={submit} />
    </box>
  )
}
