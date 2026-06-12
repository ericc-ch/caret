import { useAtomValue } from "@effect/atom-solid"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { ChatView } from "./components/chat/chat-view.tsx"
import { Prompt } from "./components/prompt/prompt.tsx"
import { sessionSnapshotAtom } from "./reactivity/atoms.ts"
import { runtime } from "./runtime/app-runtime.ts"
import { Session, type SessionId } from "./services/session.ts"
import { SplitBorder } from "./ui/border.ts"
import { useTheme } from "./lib/theme.tsx"

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

export function App() {
  const { theme } = useTheme()
  const snapshot = useAtomValue(() => sessionSnapshotAtom)
  const [activeSessionId, setActiveSessionId] = createSignal<SessionId>()
  const [ready, setReady] = createSignal(false)
  const [error, setError] = createSignal<string>()

  const promptStatus = createMemo(() => {
    if (snapshot()?.status.type === "busy") return "running"
    if (!ready()) return error() ? "unavailable" : "connecting"
    return "ready"
  })

  onMount(async () => {
    try {
      const info = await runtime.runPromise(Session.use((session) => session.create()))
      setActiveSessionId(info.id)
      setReady(true)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  })

  onCleanup(() => {
    void runtime.dispose()
  })

  const submit = async (text: string) => {
    const sessionId = activeSessionId()
    if (!sessionId || snapshot()?.status.type === "busy") return

    setError(undefined)

    try {
      await runtime.runPromise(
        Session.use((session) =>
          session.prompt({
            sessionId,
            text,
          }),
        ),
      )
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} backgroundColor={theme().background}>
      <box flexGrow={1} minHeight={0} paddingBottom={1} paddingLeft={2} paddingRight={2} gap={1}>
        <ChatView />
        <box flexShrink={0}>
          <Show when={error()}>
            <box
              border={["left"]}
              paddingTop={1}
              paddingBottom={1}
              paddingLeft={2}
              marginTop={1}
              backgroundColor={theme().backgroundPanel}
              customBorderChars={SplitBorder.customBorderChars}
              borderColor={theme().error}
            >
              <text fg={theme().textMuted}>{error()}</text>
            </box>
          </Show>
          <Prompt status={promptStatus()} onSubmit={submit} />
        </box>
      </box>
    </box>
  )
}
