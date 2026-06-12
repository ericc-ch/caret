import { For, type Accessor } from "solid-js"
import type { ChatBubble } from "./state.ts"
import { ChatBubbleView } from "./chat-bubble.tsx"
import { useTheme } from "../../lib/theme.tsx"

export function ChatView(props: { bubbles: Accessor<Array<ChatBubble>> }) {
  const { theme } = useTheme()

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
      <For each={props.bubbles()}>
        {(bubble, index) => <ChatBubbleView bubble={bubble} index={index()} />}
      </For>
    </scrollbox>
  )
}
