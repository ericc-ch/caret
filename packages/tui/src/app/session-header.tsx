import { TextAttributes } from "@opentui/core"
import { createMemo } from "solid-js"
import { useTheme } from "../lib/theme.tsx"
import { activeSessionTitle } from "../lib/session-display.ts"
import { useSession } from "../context/session-context.ts"

export function SessionHeader() {
  const { theme } = useTheme()
  const session = useSession()

  const title = createMemo(() =>
    activeSessionTitle(session.sessions(), session.activeAgentId()),
  )

  return (
    <box flexShrink={0} paddingTop={1} paddingBottom={1}>
      <text fg={theme().text} attributes={TextAttributes.BOLD}>
        {title()}
      </text>
    </box>
  )
}
