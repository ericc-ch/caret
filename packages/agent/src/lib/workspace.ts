import path from "node:path"

import { Effect, FileSystem, Path } from "effect"

import { workspaceDir } from "./paths.ts"

const TEMPLATE_DIR = path.join(import.meta.dirname, "../../templates")

const BOOTSTRAP_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "TOOLS.md",
  "IDENTITY.md",
  "USER.md",
  "HEARTBEAT.md",
  "BOOTSTRAP.md",
  "executor.jsonc",
] as const

export const ensureWorkspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const pathService = yield* Path.Path
  const memoryDir = pathService.join(workspaceDir, "memory")

  yield* fs.makeDirectory(workspaceDir, { recursive: true })
  yield* fs.makeDirectory(memoryDir, { recursive: true })

  for (const name of BOOTSTRAP_FILES) {
    const target = pathService.join(workspaceDir, name)
    const exists = yield* fs.exists(target)
    if (exists) continue

    const templatePath = pathService.join(TEMPLATE_DIR, name)
    let content = yield* fs.readFileString(templatePath)
    if (name === "TOOLS.md") {
      content = content.replace("{{PROJECTS}}", "_Add project paths here as you learn them._")
    }

    yield* fs.writeFileString(target, content)
  }
}).pipe(Effect.withSpan("Workspace.ensure"))
