import { createStore } from "solid-js/store"
import type { SessionMessage } from "../../services/session.ts"

export type ChatBubble = SessionMessage

export function createChatStore() {
  const [store, setStore] = createStore({ bubbles: [] as Array<ChatBubble> })

  return {
    bubbles: () => store.bubbles,
    syncFromMessages(messages: ReadonlyArray<SessionMessage>) {
      setStore(
        "bubbles",
        messages.map((message) => ({ ...message })),
      )
    },
  }
}
