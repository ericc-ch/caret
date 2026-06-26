import {
  Agent as CursorAgent,
  type AgentOptions,
  type SDKAgent,
  type SettingSource,
} from "@cursor/sdk"
import { Context, Data, Effect, Layer, Redacted } from "effect"

import { AgentConfig } from "./config.ts"
import { workspaceDir } from "./paths.ts"
import { SessionStore } from "./session-store.ts"

export class SessionError extends Data.TaggedError("SessionError")<{
  readonly cause: unknown
}> {}

export const CLI_SESSION_ID = "cli:local"

const channelFromSessionId = (sessionId: string) => sessionId.slice(0, sessionId.indexOf(":"))

export class Sessions extends Context.Service<Sessions>()("@caret/agent/Sessions", {
  make: Effect.gen(function* () {
    const store = yield* SessionStore
    const { config } = yield* AgentConfig
    const apiKey = Redacted.value(config.apiKey)

    const sdkOptions = {
      apiKey,
      local: {
        cwd: workspaceDir,
        settingSources: ["project"] as Array<SettingSource>,
      },
      mcpServers: {
        executor: {
          command: "executor",
          args: ["mcp", "--elicitation-mode", "model"],
          cwd: workspaceDir,
          env: { EXECUTOR_SCOPE_DIR: workspaceDir },
        },
      },
    }

    const createOptions = {
      ...sdkOptions,
      name: "caret-agent",
      model: { id: "composer-2.5" },
    } satisfies AgentOptions

    const createAgent = () =>
      Effect.tryPromise({
        try: () => CursorAgent.create(createOptions),
        catch: (cause) => new SessionError({ cause }),
      })

    const resumeAgent = (agentId: string) =>
      Effect.tryPromise({
        try: () => CursorAgent.resume(agentId, sdkOptions),
        catch: (cause) => new SessionError({ cause }),
      })

    const cache = new Map<string, SDKAgent>()

    const agent = (sessionId: string) =>
      Effect.gen(function* () {
        const cached = cache.get(sessionId)
        if (cached) return cached

        const record = yield* store.get(sessionId)
        if (record) {
          const resumed = yield* resumeAgent(record.agentId).pipe(Effect.option)
          if (resumed._tag === "Some") {
            cache.set(sessionId, resumed.value)
            yield* store.touch(sessionId)
            return resumed.value
          }
        }

        const created = yield* createAgent()
        cache.set(sessionId, created)
        yield* store.upsert(sessionId, {
          channel: channelFromSessionId(sessionId),
          agentId: created.agentId,
        })
        return created
      })

    const dispose = (sessionId: string) =>
      Effect.gen(function* () {
        const cached = cache.get(sessionId)
        if (!cached) return

        yield* Effect.tryPromise({
          try: () => cached[Symbol.asyncDispose](),
          catch: (cause) => new SessionError({ cause }),
        }).pipe(Effect.ignore)
        cache.delete(sessionId)
      })

    const disposeAll = () =>
      Effect.forEach([...cache.keys()], (sessionId) => dispose(sessionId), { discard: true })

    yield* Effect.addFinalizer(() => disposeAll())

    return { agent }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
