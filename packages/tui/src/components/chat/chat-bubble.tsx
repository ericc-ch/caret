import type { SessionMessage } from "../../services/session.ts"
import { AssistantBubble } from "./assistant-bubble.tsx"
import { ThinkingBubble } from "./thinking-bubble.tsx"
import { UserBubble } from "./user-bubble.tsx"

export function ChatBubbleView(props: { bubble: SessionMessage; index: number }) {
  switch (props.bubble.role) {
    case "user":
      return <UserBubble text={props.bubble.text} index={props.index} />
    case "thinking":
      return <ThinkingBubble text={props.bubble.text} streaming={props.bubble.streaming} />
    case "assistant":
      return <AssistantBubble text={props.bubble.text} streaming={props.bubble.streaming} />
    default:
      return null
  }
}
