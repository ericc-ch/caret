import { For, Match, Switch, createSignal, onMount } from "solid-js"
import { useTheme } from "../../lib/theme.tsx"
import { CONTEXT_WIDTH } from "../../lib/layout.ts"
import { useLayout, type ContextTab } from "../../context/layout.ts"
import { isGitRepository, readGitStatus, type GitFileChange } from "../../lib/git.ts"
import { SplitBorder } from "../../ui/border.ts"

function ContextTabs() {
  const { theme } = useTheme()
  const layout = useLayout()

  const tabButton = (tab: ContextTab, label: string) => {
    const active = () => layout.contextTab() === tab
    return (
      <box
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={active() ? theme().backgroundElement : theme().backgroundPanel}
        onMouseUp={() => layout.setContextTab(tab)}
      >
        <text fg={active() ? theme().accent : theme().textMuted}>{label}</text>
      </box>
    )
  }

  return (
    <box flexDirection="row" gap={1} flexShrink={0}>
      {tabButton("changes", "Changes")}
      {tabButton("files", "Files")}
    </box>
  )
}

function ChangesTab(props: { files: () => ReadonlyArray<GitFileChange> }) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={0} flexGrow={1} minHeight={0}>
      {props.files().length === 0 ? (
        <text fg={theme().textMuted}>No changes</text>
      ) : (
        <For each={props.files()}>
          {(file) => (
            <text fg={theme().text} wrapMode="word">
              {file.status.padEnd(2)} {file.path}
            </text>
          )}
        </For>
      )}
    </box>
  )
}

function FilesTab(props: { files: () => ReadonlyArray<GitFileChange> }) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={0} flexGrow={1} minHeight={0}>
      {props.files().length === 0 ? (
        <text fg={theme().textMuted}>No modified files</text>
      ) : (
        <For each={props.files()}>
          {(file) => (
            <text fg={theme().textMuted} wrapMode="word">
              {file.path}
            </text>
          )}
        </For>
      )}
    </box>
  )
}

export function ContextRail() {
  const { theme } = useTheme()
  const layout = useLayout()
  const [files, setFiles] = createSignal<ReadonlyArray<GitFileChange>>([])
  const [isRepo, setIsRepo] = createSignal(true)

  const refresh = async () => {
    const repo = await isGitRepository()
    setIsRepo(repo)
    if (!repo) {
      setFiles([])
      return
    }
    setFiles(await readGitStatus())
  }

  onMount(() => {
    void refresh()

    const interval = setInterval(() => {
      void refresh()
    }, 5000)

    return () => clearInterval(interval)
  })

  return (
    <box
      width={CONTEXT_WIDTH}
      height="100%"
      flexDirection="column"
      backgroundColor={theme().backgroundPanel}
      border={["left"]}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={theme().border}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      gap={1}
      minHeight={0}
    >
      <ContextTabs />

      {!isRepo() ? (
        <text fg={theme().textMuted}>Not a git repository</text>
      ) : (
        <Switch>
          <Match when={layout.contextTab() === "changes"}>
            <ChangesTab files={files} />
          </Match>
          <Match when={layout.contextTab() === "files"}>
            <FilesTab files={files} />
          </Match>
        </Switch>
      )}
    </box>
  )
}
