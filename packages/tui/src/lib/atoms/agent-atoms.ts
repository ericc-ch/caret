import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Atom } from "effect/unstable/reactivity"
import { CursorAgent, type AgentStatus } from "../../services/cursor-agent.ts"
import type { TranscriptEntry } from "../transcript.ts"

export const agentRuntime = Atom.runtime(CursorAgent.layer)

function statusFromResult(result: AsyncResult.AsyncResult<AgentStatus, unknown>) {
  return AsyncResult.isSuccess(result) ? result.value : "ready" as const
}

function transcriptFromResult(
  result: AsyncResult.AsyncResult<ReadonlyArray<TranscriptEntry>, unknown>,
) {
  return AsyncResult.isSuccess(result) ? result.value : []
}

export const transcriptAtom = agentRuntime
  .subscriptionRef(CursorAgent.use((agent) => Effect.succeed(agent.transcript())))
  .pipe(Atom.keepAlive)

export const transcriptEntriesAtom = Atom.make((get) => {
  return transcriptFromResult(get(transcriptAtom))
}).pipe(Atom.keepAlive)

const agentStatusAtom = agentRuntime
  .subscriptionRef(CursorAgent.use((agent) => Effect.succeed(agent.status())))
  .pipe(Atom.keepAlive)

export const promptStatusAtom = Atom.make((get) => {
  return statusFromResult(get(agentStatusAtom))
}).pipe(Atom.keepAlive)

export const promptAtom = agentRuntime.fn(
  Effect.fn("promptAtom")((text: string) => CursorAgent.use((agent) => agent.prompt(text))),
)

export const cancelAtom = agentRuntime.fn(
  Effect.fn("cancelAtom")(() => CursorAgent.use((agent) => agent.cancel())),
)
