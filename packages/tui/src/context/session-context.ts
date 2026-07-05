import { Effect } from "effect"
import { createSignal, onMount, type Accessor } from "solid-js"
import { formatError } from "../lib/format-error.ts"
import { runtime } from "../lib/runtime.ts"
import { Session, type AgentId, type SDKAgentInfo, type SessionInterface } from "../services/session.ts"
import { createSimpleContext } from "./helper.ts"

function runSession<A, E>(fn: (session: SessionInterface) => Effect.Effect<A, E, Session>) {
  return runtime.runPromise(Session.use(fn))
}

export type SessionContextValue = {
  readonly sessions: Accessor<ReadonlyArray<SDKAgentInfo>>
  readonly activeAgentId: Accessor<AgentId | undefined>
  readonly bootError: Accessor<string | undefined>
  readonly booting: Accessor<boolean>
  readonly refresh: () => Promise<void>
  readonly create: (name?: string) => Promise<AgentId>
  readonly resume: (agentId: AgentId) => Promise<AgentId>
}

export const { use: useSession, provider: SessionProvider } = createSimpleContext({
  name: "Session",
  init: (): SessionContextValue => {
    const [sessions, setSessions] = createSignal<ReadonlyArray<SDKAgentInfo>>([])
    const [activeAgentId, setActiveAgentId] = createSignal<AgentId | undefined>(undefined)
    const [bootError, setBootError] = createSignal<string | undefined>(undefined)
    const [booting, setBooting] = createSignal(true)

    const refresh = async () => {
      const items = await runSession((session) => session.list())
      setSessions(items)
    }

    const create = async (name?: string) => {
      const agentId = await runSession((session) => session.create(name))
      await refresh()
      setActiveAgentId(agentId)
      return agentId
    }

    const resume = async (agentId: AgentId) => {
      const id = await runSession((session) => session.resume(agentId))
      setActiveAgentId(id)
      return id
    }

    onMount(() => {
      void (async () => {
        setBooting(true)
        setBootError(undefined)
        try {
          const items = await runSession((session) => session.list())
          setSessions(items)

          if (items.length > 0) {
            const latest = [...items].sort(
              (a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0),
            )[0]!
            const id = await runSession((session) => session.resume(latest.agentId))
            setActiveAgentId(id)
          } else {
            await create()
          }
        } catch (cause) {
          setBootError(formatError(cause))
        } finally {
          setBooting(false)
        }
      })()
    })

    return {
      sessions,
      activeAgentId,
      bootError,
      booting,
      refresh,
      create,
      resume,
    }
  },
})
