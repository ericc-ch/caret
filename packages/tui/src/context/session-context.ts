import * as Cause from "effect/Cause"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useAtom, useAtomMount, useAtomSet, useAtomValue } from "@effect/atom-solid"
import { createMemo, onMount, type Accessor } from "solid-js"
import { formatError } from "../lib/format-error.ts"
import { localAgentCwd } from "../lib/workspace.ts"
import {
  activeAgentIdAtom,
  bootAtom,
  createSessionAtom,
  loadTranscriptAtom,
  promptAtom,
  refreshSessionsAtom,
  resumeSessionAtom,
  sessionsAtom,
} from "../lib/session-atoms.ts"
import type { TranscriptEntry, TranscriptSink } from "../lib/transcript.ts"
import type { AgentId, SDKAgentInfo } from "../services/session.ts"
import { createSimpleContext } from "./helper.ts"

function sessionsFromResult(
  result: AsyncResult.AsyncResult<ReadonlyArray<SDKAgentInfo>, unknown>,
): ReadonlyArray<SDKAgentInfo> {
  return AsyncResult.isSuccess(result) ? result.value : []
}

export type SessionContextValue = {
  readonly sessions: Accessor<ReadonlyArray<SDKAgentInfo>>
  readonly activeAgentId: Accessor<AgentId | undefined>
  readonly bootError: Accessor<string | undefined>
  readonly booting: Accessor<boolean>
  readonly refresh: () => Promise<void>
  readonly create: (name?: string) => Promise<AgentId>
  readonly resume: (agentId: AgentId) => Promise<AgentId>
  readonly loadTranscript: (
    agentId: AgentId,
    cwd?: string,
  ) => Promise<ReadonlyArray<TranscriptEntry>>
  readonly prompt: (input: { readonly text: string; readonly sink: TranscriptSink }) => Promise<void>
}

export const { use: useSession, provider: SessionProvider } = createSimpleContext({
  name: "Session",
  init: (): SessionContextValue => {
    useAtomMount(() => sessionsAtom)

    const sessionsResult = useAtomValue(() => sessionsAtom)
    const sessions = createMemo(() => sessionsFromResult(sessionsResult()))
    const [activeAgentId, setActiveAgentId] = useAtom(() => activeAgentIdAtom)
    const bootResult = useAtomValue(() => bootAtom)

    const runBoot = useAtomSet(() => bootAtom, { mode: "promise" })
    const runCreate = useAtomSet(() => createSessionAtom, { mode: "promise" })
    const runResume = useAtomSet(() => resumeSessionAtom, { mode: "promise" })
    const runLoadTranscript = useAtomSet(() => loadTranscriptAtom, { mode: "promise" })
    const runPrompt = useAtomSet(() => promptAtom, { mode: "promise" })
    const runRefresh = useAtomSet(() => refreshSessionsAtom, { mode: "promise" })

    const booting = createMemo(() => {
      const result = bootResult()
      return AsyncResult.isInitial(result) || AsyncResult.isWaiting(result)
    })

    const bootError = createMemo(() => {
      const result = bootResult()
      if (!AsyncResult.isFailure(result)) return undefined
      return formatError(Cause.squash(result.cause))
    })

    const refresh = async () => {
      await runRefresh(undefined)
    }

    const create = async (name?: string) => {
      const agentId = await runCreate(name)
      setActiveAgentId(agentId)
      return agentId
    }

    const resume = async (agentId: AgentId) => {
      const item = sessions().find((entry) => entry.agentId === agentId)
      const cwd = item ? localAgentCwd(item) : undefined
      const id = await runResume(cwd === undefined ? { agentId } : { agentId, cwd })
      setActiveAgentId(id)
      return id
    }

    onMount(() => {
      void runBoot(undefined).then(({ activeId }) => {
        setActiveAgentId(activeId)
      })
    })

    return {
      sessions,
      activeAgentId,
      bootError,
      booting,
      refresh,
      create,
      resume,
      loadTranscript: (agentId, cwd) =>
        cwd === undefined
          ? runLoadTranscript({ agentId })
          : runLoadTranscript({ agentId, cwd }),
      prompt: (input) => runPrompt(input),
    }
  },
})
