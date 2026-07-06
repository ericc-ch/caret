import { MouseButton, TextAttributes } from "@opentui/core"
import { Portal, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createSignal, For, Show } from "solid-js"
import { useTheme } from "../lib/theme.tsx"

export type ContextMenuPosition = {
  readonly x: number
  readonly y: number
}

export type ContextMenuItem = {
  readonly id: string
  readonly label: string
  readonly destructive?: boolean
  readonly disabled?: boolean
  readonly onSelect: () => void
}

export type ContextMenuProps = {
  readonly open: boolean
  readonly position: ContextMenuPosition
  readonly items: ReadonlyArray<ContextMenuItem>
  readonly onClose: () => void
  readonly minWidth?: number
}

const DEFAULT_MIN_WIDTH = 20

export function isContextMenuGesture(event: {
  readonly button: number
  readonly modifiers?: { readonly ctrl?: boolean }
}): boolean {
  if (event.button === MouseButton.RIGHT) return true
  return event.button === MouseButton.LEFT && event.modifiers?.ctrl === true
}

export function ContextMenu(props: ContextMenuProps) {
  return (
    <Show when={props.open}>
      <ContextMenuOverlay {...props} />
    </Show>
  )
}

function ContextMenuOverlay(props: ContextMenuProps) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  const minWidth = () => props.minWidth ?? DEFAULT_MIN_WIDTH
  const menuHeight = () => props.items.length + 2

  const position = () => {
    const { width, height } = dimensions()
    return {
      top: Math.max(1, Math.min(props.position.y, height - menuHeight() - 1)),
      left: Math.max(1, Math.min(props.position.x, width - minWidth() - 1)),
    }
  }

  const activateItem = (item: ContextMenuItem) => {
    if (item.disabled) return
    props.onClose()
    item.onSelect()
  }

  const activateSelected = () => {
    const item = props.items[selectedIndex()]
    if (!item || item.disabled) return
    activateItem(item)
  }

  createEffect(() => {
    if (props.open) setSelectedIndex(0)
  })

  useKeyboard((event) => {
    if (!props.open || props.items.length === 0) return

    if (event.name === "escape") {
      props.onClose()
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.name === "return") {
      activateSelected()
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.name === "up") {
      setSelectedIndex((index) => Math.max(0, index - 1))
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.name === "down") {
      setSelectedIndex((index) => Math.min(props.items.length - 1, index + 1))
      event.preventDefault()
      event.stopPropagation()
    }
  })

  return (
    <Portal mount={renderer.root}>
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={200}
        onMouseUp={props.onClose}
      />
      <box
        position="absolute"
        top={position().top}
        left={position().left}
        width={minWidth()}
        zIndex={201}
        flexDirection="column"
        backgroundColor={theme().backgroundPanel}
        border
        borderColor={theme().border}
        paddingTop={0}
        paddingBottom={0}
      >
        <For each={props.items}>
          {(item, index) => (
            <box
              paddingLeft={1}
              paddingRight={1}
              {...(selectedIndex() === index()
                ? { backgroundColor: theme().backgroundElement }
                : {})}
              onMouseUp={() => activateItem(item)}
            >
              <text
                fg={
                  item.disabled
                    ? theme().textMuted
                    : item.destructive
                      ? theme().error
                      : theme().text
                }
                {...(item.destructive ? { attributes: TextAttributes.BOLD } : {})}
              >
                {item.label}
              </text>
            </box>
          )}
        </For>
      </box>
    </Portal>
  )
}
