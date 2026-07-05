import { TextAttributes } from "@opentui/core"
import { For } from "solid-js"
import { useTheme } from "../lib/theme.tsx"
import { displayCwd, NAV_WIDTH } from "../lib/layout.ts"
import { useSession } from "../context/session-context.ts"
import { SplitBorder } from "../ui/border.ts"

function sessionLabel(name: string, summary: string, agentId: string): string {
  if (name.trim()) return name
  if (summary.trim()) return summary
  return agentId.slice(0, 8)
}

export function NavPanel() {
  const { theme } = useTheme()
  const session = useSession()

  return (
    <box
      width={NAV_WIDTH}
      height="100%"
      flexDirection="column"
      backgroundColor={theme().backgroundPanel}
      border={["right"]}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={theme().border}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      gap={1}
      minHeight={0}
    >
      <text fg={theme().text} attributes={TextAttributes.BOLD}>
        caret
      </text>
      <text fg={theme().textMuted}>{displayCwd()}</text>

      <box
        onMouseUp={() => {
          void session.create()
        }}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme().backgroundElement}
      >
        <text fg={theme().accent}>+ New chat</text>
      </box>

      <box flexGrow={1} minHeight={0} flexDirection="column" gap={0}>
        <For each={session.sessions()}>
          {(item) => {
            const selected = () => session.activeAgentId() === item.agentId
            return (
              <box
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={selected() ? theme().backgroundElement : theme().backgroundPanel}
                onMouseUp={() => {
                  void session.resume(item.agentId)
                }}
              >
                <text fg={selected() ? theme().accent : theme().text}>
                  {selected() ? "▸ " : "  "}
                  {sessionLabel(item.name, item.summary, item.agentId)}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </box>
  )
}
