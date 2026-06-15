import { AtomRef } from "effect/unstable/reactivity"
import type { PromptRef } from "../components/prompt.tsx"

export const promptRef = AtomRef.make<PromptRef | undefined>(undefined)
