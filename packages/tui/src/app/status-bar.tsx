import { createSignal, onMount } from "solid-js"
import { useTheme } from "../lib/theme.tsx"
import { displayCwd } from "../lib/layout.ts"
import { readGitBranch } from "../lib/git.ts"
import type { PromptStatus } from "../components/prompt.tsx"

export function StatusBar(props: { status: PromptStatus }) {
  const { theme } = useTheme()
  const [branch, setBranch] = createSignal<string | undefined>(undefined)

  onMount(() => {
    void readGitBranch().then(setBranch)
  })

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      flexShrink={0}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
    >
      <text fg={theme().textMuted}>
        {branch() ? `${branch()} · ${displayCwd()}` : displayCwd()}
      </text>
      <text fg={theme().textMuted}>{props.status}</text>
    </box>
  )
}
