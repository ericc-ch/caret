import { Agent as CursorAgent, type AgentOptions } from "@cursor/sdk"
import { Context, Effect, Layer } from "effect"

import { workspaceDir } from "./paths.ts"

const OPTIONS: AgentOptions = {
  name: "caret-agent",
  model: { id: "composer-2.5" },
  local: {
    cwd: workspaceDir,
    settingSources: ["project"],
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

export class Agent extends Context.Service<Agent>()("@caret/agent/Agent", {
  make: Effect.gen(function* () {
    const cursor = yield* Effect.promise(() => CursorAgent.create(OPTIONS))

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => cursor[Symbol.asyncDispose]()).pipe(Effect.ignore),
    )

    return { agentId: cursor.agentId, workspaceDir, cursor }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
