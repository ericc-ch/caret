import { execFile } from "node:child_process"
import { promisify } from "node:util"
import process from "node:process"

import type { AgentOptions } from "@cursor/sdk"

const execFileAsync = promisify(execFile)

export class StartupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StartupError"
  }
}

export async function assertExecutorOnPath(command = "executor") {
  try {
    await execFileAsync("which", [command])
  } catch {
    throw new StartupError(
      `Could not find \`${command}\` on PATH. Install executor globally and ensure it is available.`,
    )
  }
}

export function assertApiKey(env = process.env) {
  const apiKey = env.CURSOR_API_KEY?.trim()
  if (!apiKey) {
    throw new StartupError("CURSOR_API_KEY is not set.")
  }
  return apiKey
}

export async function validateStartup(env = process.env) {
  const apiKey = assertApiKey(env)
  await assertExecutorOnPath()
  return apiKey
}

export function agentOptions(workspaceDir: string, apiKey: string): AgentOptions {
  return {
    apiKey,
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
}
