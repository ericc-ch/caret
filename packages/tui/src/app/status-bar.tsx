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

  const left = () => {
    const gitBranch = branch()
    const cwd = displayCwd()
    return gitBranch ? `${gitBranch} · ${cwd}` : cwd
  }

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
      <text fg={theme().textMuted}>{left()}</text>
      <text fg={theme().textMuted}>{props.status}</text>
    </box>
  )
}
