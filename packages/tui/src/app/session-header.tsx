import { TextAttributes } from "@opentui/core"
import { createMemo } from "solid-js"
import { useTheme } from "../lib/theme.tsx"
import { useSession } from "../context/session-context.ts"

export function SessionHeader() {
  const { theme } = useTheme()
  const session = useSession()

  const title = createMemo(() => {
    const activeId = session.activeAgentId()
    if (!activeId) return "General chat"
    const item = session.sessions().find((entry) => entry.agentId === activeId)
    if (!item) return "General chat"
    if (item.name.trim()) return item.name
    if (item.summary.trim()) return item.summary
    return "General chat"
  })

  return (
    <box flexShrink={0} paddingTop={1} paddingBottom={1}>
      <text fg={theme().text} attributes={TextAttributes.BOLD}>
        {title()}
      </text>
    </box>
  )
}
