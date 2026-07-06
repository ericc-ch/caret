import { useAtomSet, useAtomValue } from "@effect/atom-solid"
import { MouseButton, TextAttributes } from "@opentui/core"
import { createSignal, For, Show } from "solid-js"
import { ContextMenu, type ContextMenuItem } from "../components/context-menu.tsx"
import {
  closeTabAtom,
  createTabAtom,
  createTabInDirectoryAtom,
  switchTabAtom,
  tabViewModelsAtom,
} from "../lib/atoms/index.ts"
import { TAB_RAIL_WIDTH } from "../lib/layout.ts"
import { useTheme } from "../lib/theme.tsx"
import { formatError } from "../lib/format-error.ts"
import type { AgentId } from "../services/session.ts"
import { PathPicker } from "./path-picker.tsx"
import { TabItem } from "./tab-item.tsx"

export function TabRail() {
  const { theme } = useTheme()
  const [contextMenu, setContextMenu] = createSignal<
    { agentId: AgentId; x: number; y: number } | null
  >(null)
  const [pathPickerOpen, setPathPickerOpen] = createSignal(false)
  const [tabRailError, setTabRailError] = createSignal<string | undefined>(undefined)

  const tabs = useAtomValue(() => tabViewModelsAtom)
  const runSwitch = useAtomSet(() => switchTabAtom, { mode: "promise" })
  const runCreate = useAtomSet(() => createTabAtom, { mode: "promise" })
  const runCreateInDirectory = useAtomSet(() => createTabInDirectoryAtom, { mode: "promise" })
  const runCloseTab = useAtomSet(() => closeTabAtom, { mode: "promise" })

  const reportError = (cause: unknown) => {
    setTabRailError(formatError(cause))
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  const closePathPicker = () => {
    setPathPickerOpen(false)
    setTabRailError(undefined)
  }

  const openContextMenu = (input: { agentId: AgentId; x: number; y: number }) => {
    setTabRailError(undefined)
    closePathPicker()
    setContextMenu(input)
  }

  const contextMenuItems = (): ReadonlyArray<ContextMenuItem> => {
    const menu = contextMenu()
    if (!menu) return []

    const agentId = menu.agentId
    return [
      {
        id: "close",
        label: "Close tab",
        destructive: true,
        onSelect: () => {
          void runCloseTab(agentId).catch(reportError)
        },
      },
    ]
  }

  const selectTab = (agentId: AgentId) => {
    closeContextMenu()
    void runSwitch(agentId).catch(reportError)
  }

  const newTab = () => {
    closeContextMenu()
    void runCreate(undefined).catch(reportError)
  }

  const openPathPicker = () => {
    closeContextMenu()
    setTabRailError(undefined)
    setPathPickerOpen(true)
  }

  const submitPath = (path: string) => {
    void runCreateInDirectory({ path })
      .then(() => {
        closePathPicker()
      })
      .catch(reportError)
  }

  const menu = () => contextMenu()

  return (
    <box
      width={TAB_RAIL_WIDTH}
      height="100%"
      flexDirection="column"
      backgroundColor={theme().backgroundPanel}
      paddingTop={1}
      gap={0}
      minHeight={0}
      position="relative"
    >
      <box flexShrink={0} paddingLeft={1} paddingRight={1} paddingBottom={1}>
        <text fg={theme().text} attributes={TextAttributes.BOLD}>
          tabs
        </text>
      </box>

      <scrollbox flexGrow={1} minHeight={0} viewportOptions={{ paddingRight: 0 }}>
        <box flexDirection="column" gap={0}>
          <Show
            when={tabs().length > 0}
            fallback={
              <box paddingLeft={1} paddingRight={1}>
                <text fg={theme().textMuted}>No tabs</text>
              </box>
            }
          >
            <For each={tabs()}>
              {(tab) => (
                <TabItem tab={tab} onSelect={selectTab} onContextMenu={openContextMenu} />
              )}
            </For>
          </Show>
        </box>
      </scrollbox>

      <box
        flexShrink={0}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        backgroundColor={theme().backgroundElement}
        onMouseDown={(event) => {
          if (event.button === MouseButton.LEFT) newTab()
        }}
      >
        <text fg={theme().accent}>+</text>
      </box>
      <box
        flexShrink={0}
        paddingLeft={1}
        paddingRight={1}
        paddingBottom={1}
        onMouseUp={openPathPicker}
      >
        <text fg={theme().textMuted}>open dir…</text>
      </box>

      <Show when={tabRailError() && !pathPickerOpen()}>
        <box flexShrink={0} paddingLeft={1} paddingRight={1} paddingBottom={1}>
          <text fg={theme().error}>{tabRailError()}</text>
        </box>
      </Show>

      <Show when={pathPickerOpen()}>
        <PathPicker error={tabRailError()} onSubmit={submitPath} onCancel={closePathPicker} />
      </Show>

      <ContextMenu
        open={menu() !== null}
        position={{ x: menu()?.x ?? 0, y: menu()?.y ?? 0 }}
        onClose={closeContextMenu}
        items={contextMenuItems()}
      />
    </box>
  )
}
