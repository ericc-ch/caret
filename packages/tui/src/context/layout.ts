import { createMemo, createSignal, type Accessor } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { createSimpleContext } from "./helper.ts"
import { isWide } from "../lib/layout.ts"

export type ContextTab = "changes" | "files"

export type LayoutContextValue = {
  readonly wide: Accessor<boolean>
  readonly navOpen: Accessor<boolean>
  readonly contextOpen: Accessor<boolean>
  readonly contextTab: Accessor<ContextTab>
  readonly toggleNav: () => void
  readonly toggleContext: () => void
  readonly setContextTab: (tab: ContextTab) => void
}

export const { use: useLayout, provider: LayoutProvider } = createSimpleContext({
  name: "Layout",
  init: (): LayoutContextValue => {
    const dimensions = useTerminalDimensions()
    const wide = createMemo(() => isWide(dimensions().width))

    const [navOpen, setNavOpen] = createSignal(true)
    const [contextOpen, setContextOpen] = createSignal(true)
    const [contextTab, setContextTab] = createSignal<ContextTab>("changes")

    return {
      wide,
      navOpen,
      contextOpen,
      contextTab,
      toggleNav: () => setNavOpen((open) => !open),
      toggleContext: () => setContextOpen((open) => !open),
      setContextTab,
    }
  },
})
