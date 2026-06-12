import { createStore } from "solid-js/store"

type StreamingRole = "assistant" | "thinking"

export type ChatBubble =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; streaming: boolean }
  | { role: "thinking"; text: string; streaming: boolean }

export function createChatStore() {
  const [store, setStore] = createStore({ bubbles: [] as Array<ChatBubble> })

  const startStreaming = (role: StreamingRole) => {
    const index = store.bubbles.length
    setStore("bubbles", index, { role, text: "", streaming: true })
    return index
  }

  const appendText = (index: number, text: string) => {
    setStore("bubbles", index, "text", (current) => current + text)
  }

  const setText = (index: number, text: string) => {
    setStore("bubbles", index, "text", text)
  }

  const finishStreaming = (index: number, role: StreamingRole) => {
    setStore("bubbles", index, (bubble) =>
      bubble.role === role ? { ...bubble, streaming: false } : bubble,
    )
  }

  return {
    bubbles: () => store.bubbles,
    addUser(text: string) {
      setStore("bubbles", store.bubbles.length, { role: "user", text })
    },
    startAssistant: () => startStreaming("assistant"),
    startThinking: () => startStreaming("thinking"),
    appendAssistant: appendText,
    appendThinking: appendText,
    setAssistant: setText,
    setThinking: setText,
    finishAssistant: (index: number) => finishStreaming(index, "assistant"),
    finishThinking: (index: number) => finishStreaming(index, "thinking"),
  }
}
