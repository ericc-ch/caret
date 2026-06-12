import { createContext, useContext, type ParentProps } from "solid-js"
import type { PromptRef } from "../components/prompt/prompt.tsx"

const PromptRefContext = createContext<{
  get current(): PromptRef | undefined
  set(ref: PromptRef | undefined): void
}>()

export function PromptRefProvider(props: ParentProps) {
  let current: PromptRef | undefined

  const value = {
    get current() {
      return current
    },
    set(ref: PromptRef | undefined) {
      current = ref
    },
  }

  return <PromptRefContext.Provider value={value}>{props.children}</PromptRefContext.Provider>
}

export function usePromptRef() {
  const value = useContext(PromptRefContext)
  if (!value) throw new Error("PromptRef context must be used within PromptRefProvider")
  return value
}
