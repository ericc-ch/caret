import { Agent, CursorAgentError, type SDKAgent } from "@cursor/sdk"

import { formatError } from "../lib/format-error.ts"
import { ensureWorkspace } from "../workspace/ensure.ts"
import { agentOptions, validateStartup } from "./config.ts"
import { relayStream, type StreamRelay } from "./stream.ts"

export type SendResult = {
  readonly runId: string
  readonly status: string
  readonly assistantText: string
  readonly detail?: string
}

export class AgentSession {
  private agent: SDKAgent | undefined

  get agentId() {
    return this.agent?.agentId
  }

  get workspaceDir() {
    return this.workspace
  }

  private workspace: string | undefined

  async open() {
    const apiKey = await validateStartup()
    const workspaceDir = await ensureWorkspace()
    this.workspace = workspaceDir
    this.agent = await Agent.create(agentOptions(workspaceDir, apiKey))
    return this.agent.agentId
  }

  async send(text: string, relay: StreamRelay = {}) {
    const agent = this.requireAgent()
    const run = await agent.send(text)

    try {
      const streamed = await relayStream(run, relay)
      const result = await run.wait()

      if (result.status === "error") {
        const detail = result.result?.trim() || streamed.assistantText.trim() || "Run failed"
        return {
          runId: run.id,
          status: result.status,
          assistantText: streamed.assistantText,
          detail,
        }
      }

      return {
        runId: run.id,
        status: result.status,
        assistantText: streamed.assistantText,
      }
    } catch (cause) {
      if (cause instanceof CursorAgentError) throw cause
      return {
        runId: run.id,
        status: "error",
        assistantText: "",
        detail: formatError(cause),
      }
    }
  }

  async dispose() {
    const agent = this.agent
    this.agent = undefined
    this.workspace = undefined
    if (agent) await agent[Symbol.asyncDispose]()
  }

  private requireAgent() {
    if (!this.agent) throw new Error("Agent session is not open. Call open() first.")
    return this.agent
  }
}
