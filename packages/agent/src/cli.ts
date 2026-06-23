#!/usr/bin/env bun

import process from "node:process"
import readline from "node:readline/promises"

import { AgentSession } from "./cursor/session.ts"
import { formatError } from "./lib/format-error.ts"

async function main() {
  const session = new AgentSession()
  await using _session = {
    [Symbol.asyncDispose]: async () => {
      await session.dispose()
    },
  }

  const agentId = await session.open()
  process.stderr.write(`workspace: ${session.workspaceDir}\n`)
  process.stderr.write(`agent: ${agentId}\n`)
  process.stderr.write("caret-agent cli — type a message, empty line to quit\n\n")

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  try {
    while (true) {
      const line = (await rl.question("> ")).trim()
      if (!line) break

      let assistantStarted = false

      const result = await session.send(line, {
        onText: (chunk) => {
          if (!assistantStarted) {
            process.stdout.write("\n")
            assistantStarted = true
          }
          process.stdout.write(chunk)
        },
        onPause: (payload) => {
          process.stderr.write(
            `\n[pause] ${payload.interaction.message ?? payload.executionId}\n`,
          )
        },
      })

      if (assistantStarted) process.stdout.write("\n")

      if (result.status === "error") {
        process.stderr.write(`run error: ${result.detail ?? "Run failed"}\n`)
        process.exitCode = 2
      } else {
        process.stderr.write(`[${result.status}] run ${result.runId}\n`)
      }
      process.stdout.write("\n")
    }
  } finally {
    rl.close()
  }
}

main().catch((cause) => {
  process.stderr.write(`error: ${formatError(cause)}\n`)
  process.exitCode = 1
})
