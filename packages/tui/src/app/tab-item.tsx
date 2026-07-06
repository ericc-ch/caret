import { MouseButton, TextAttributes } from "@opentui/core"
import { isContextMenuGesture } from "../components/context-menu.tsx"
import { useTheme } from "../lib/theme.tsx"
import type { SessionLabel } from "../lib/session-display.ts"
import type { AgentId } from "../services/session.ts"

export function TabItem(props: {
  tab: SessionLabel
  onSelect: (agentId: AgentId) => void
  onContextMenu: (input: { agentId: AgentId; x: number; y: number }) => void
}) {
  const { theme } = useTheme()
  const active = () => props.tab.isActive

  return (
    <box
      flexDirection="row"
      gap={1}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={0}
      backgroundColor={active() ? theme().backgroundElement : theme().backgroundPanel}
      onMouseDown={(event) => {
        if (isContextMenuGesture(event)) {
          event.preventDefault()
          event.stopPropagation()
          props.onContextMenu({
            agentId: props.tab.agentId,
            x: event.x,
            y: event.y,
          })
          return
        }
        if (event.button === MouseButton.LEFT) {
          props.onSelect(props.tab.agentId)
        }
      }}
    >
      <box
        width={2}
        height={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor={active() ? theme().accent : theme().backgroundElement}
      >
        <text
          fg={active() ? theme().background : theme().textMuted}
          attributes={TextAttributes.BOLD}
        >
          {props.tab.projectInitial}
        </text>
      </box>
      <box flexDirection="column" flexGrow={1} minWidth={0}>
        <text fg={active() ? theme().accent : theme().text} attributes={TextAttributes.BOLD}>
          {props.tab.title}
        </text>
        <text fg={theme().textMuted}>{props.tab.cwdLabel}</text>
      </box>
    </box>
  )
}
