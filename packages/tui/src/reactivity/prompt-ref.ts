import { AtomRef } from "effect/unstable/reactivity"
import type { PromptRef } from "../components/prompt/prompt.tsx"

export const promptRef = AtomRef.make<PromptRef | undefined>(undefined)
