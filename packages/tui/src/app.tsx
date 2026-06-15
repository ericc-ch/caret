import { useRenderer } from "@opentui/solid"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Prompt } from "./components/prompt.tsx"
import { useTheme } from "./lib/theme.tsx"
import { formatError } from "./lib/format-error.ts"
import { Scrollback } from "./scrollback/scrollback.tsx"
import { Session } from "./services/session.ts"
import { Effect, Layer, ManagedRuntime } from "effect"

type BootState = "pending" | "ready" | "failed"

export function App() {
  const renderer = useRenderer()
  const { theme } = useTheme()
  const [boot, setBoot] = createSignal<BootState>("pending")
  const [running, setRunning] = createSignal(false)
  let runtime: ManagedRuntime.ManagedRuntime<Session | Scrollback, never> | undefined

  const promptStatus = createMemo(() => {
    if (running()) return "running"
    if (boot() === "pending") return "connecting"
    if (boot() === "failed") return "unavailable"
    return "ready"
  })

  onMount(() => {
    const scrollbackLayer = Scrollback.makeLayer(renderer, theme)
    const appLayer = Session.layer.pipe(Layer.provideMerge(scrollbackLayer))
    const rt = ManagedRuntime.make(appLayer)
    runtime = rt

    void (async () => {
      try {
        await rt.runPromise(Session.use((session) => session.create()))
        setBoot("ready")
      } catch (cause) {
        await rt.runPromise(
          Effect.gen(function* () {
            const scrollback = yield* Scrollback
            scrollback.append({ _tag: "Error", text: formatError(cause) })
          }),
        )
        setBoot("failed")
      }
    })()
  })

  onCleanup(() => {
    if (runtime) {
      void runtime.dispose()
    }
  })

  const submit = async (text: string) => {
    if (boot() !== "ready" || running() || !runtime) return

    setRunning(true)
    try {
      await runtime
        .runPromise(Session.use((session) => session.prompt({ text })))
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
