import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { ChatView } from "./components/chat/chat-view.tsx"
import { createChatStore } from "./components/chat/state.ts"
import { Prompt } from "./components/prompt/prompt.tsx"
import { usePromptRef } from "./context/prompt.tsx"
import { runtime } from "./runtime/app-runtime.ts"
import { Session, type SessionId, type SessionStatus } from "./services/session.ts"
import { SplitBorder } from "./ui/border.ts"
import { useTheme } from "./lib/theme.tsx"

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

export function App() {
  const { theme } = useTheme()
  const promptRef = usePromptRef()
  const chat = createChatStore()
  const [activeSessionId, setActiveSessionId] = createSignal<SessionId>()
  const [sessionStatus, setSessionStatus] = createSignal<SessionStatus>({ type: "idle" })
  const [ready, setReady] = createSignal(false)
  const [error, setError] = createSignal<string>()

  const promptStatus = createMemo(() => {
    if (sessionStatus().type === "busy") return "running"
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
    if (!sessionId || sessionStatus().type === "busy") return

    setError(undefined)

    try {
      await runtime.runPromise(
        Session.use((session) =>
          session.prompt({
            sessionId,
            text,
            onSnapshot: (snapshot) => {
              setSessionStatus(snapshot.status)
              chat.syncFromMessages(snapshot.messages)
            },
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
        <ChatView bubbles={chat.bubbles} />
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
          <Prompt status={promptStatus()} onSubmit={submit} ref={promptRef.set} />
        </box>
      </box>
    </box>
  )
}
