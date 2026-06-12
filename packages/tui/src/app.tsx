import process from "node:process"
import { Agent, type SDKAgent } from "@cursor/sdk"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { runPrompt } from "./lib/agent.ts"
import { ChatView } from "./components/chat/chat-view.tsx"
import { createChatStore } from "./components/chat/state.ts"
import { Prompt } from "./components/prompt/prompt.tsx"
import { usePromptRef } from "./context/prompt.tsx"
import { SplitBorder } from "./ui/border.ts"
import { useTheme } from "./lib/theme.tsx"

export function App() {
  const { theme } = useTheme()
  const promptRef = usePromptRef()
  const chat = createChatStore()
  const [agent, setAgent] = createSignal<SDKAgent>()
  const [running, setRunning] = createSignal(false)
  const [error, setError] = createSignal<string>()

  const promptStatus = createMemo(() => {
    if (running()) return "running"
    if (!agent()) return error() ? "unavailable" : "connecting"
    return "ready"
  })

  onMount(async () => {
    try {
      const apiKey = process.env["CURSOR_API_KEY"]
      const created = await Agent.create({
        ...(apiKey ? { apiKey } : {}),
        model: { id: "composer-2.5" },
        local: { cwd: process.cwd() },
      })
      setAgent(created)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  })

  onCleanup(() => {
    void agent()?.close()
  })

  const submit = async (text: string) => {
    const current = agent()
    if (!current || running()) return

    setRunning(true)
    setError(undefined)
    chat.addUser(text)

    const assistantIndex = chat.startAssistant()
    let thinkingIndex: number | undefined

    const ensureThinking = () => {
      thinkingIndex ??= chat.startThinking()
      return thinkingIndex
    }

    try {
      await runPrompt(current, text, {
        onTextDelta: (delta) => chat.appendAssistant(assistantIndex, delta),
        onThinkingDelta: (delta) => chat.appendThinking(ensureThinking(), delta),
        onAssistantText: (value) => chat.setAssistant(assistantIndex, value),
        onThinkingText: (value) => chat.setThinking(ensureThinking(), value),
        onThinkingDone: () => {
          if (thinkingIndex !== undefined) chat.finishThinking(thinkingIndex)
        },
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      chat.finishAssistant(assistantIndex)
      if (thinkingIndex !== undefined) chat.finishThinking(thinkingIndex)
      setRunning(false)
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
