import { useAtomValue } from "@effect/atom-solid"
import { For } from "solid-js"
import { sessionSnapshotAtom } from "../../reactivity/atoms.ts"
import { ChatBubbleView } from "./chat-bubble.tsx"
import { useTheme } from "../../lib/theme.tsx"

export function ChatView() {
  const { theme } = useTheme()
  const snapshot = useAtomValue(() => sessionSnapshotAtom)
  const bubbles = () => snapshot()?.messages ?? []

  return (
    <scrollbox
      stickyScroll
      stickyStart="bottom"
      flexGrow={1}
      minHeight={0}
      verticalScrollbarOptions={{
        paddingLeft: 1,
        visible: true,
        trackOptions: {
          backgroundColor: theme().backgroundElement,
          foregroundColor: theme().border,
        },
      }}
    >
      <box height={1} />
      <For each={bubbles()}>
        {(bubble, index) => <ChatBubbleView bubble={bubble} index={index()} />}
      </For>
    </scrollbox>
  )
}
