import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

import { resolveCaretRepo, resolveWorkspaceDir } from "./paths.ts"

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

async function exists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function formatProjectsSection(env: NodeJS.ProcessEnv) {
  const caretRepo = resolveCaretRepo(env, path.join(import.meta.dirname, "../.."))
  if (!caretRepo) {
    return "_Add project paths here as you learn them._"
  }
  return [
    `- **caret** — \`${caretRepo}\` (monorepo; host package is \`@caret/agent\` in \`packages/agent\`)`,
  ].join("\n")
}

async function readTemplate(name: string, env: NodeJS.ProcessEnv) {
  const filePath = path.join(TEMPLATE_DIR, name)
  let content = await readFile(filePath, "utf8")
  if (name === "TOOLS.md") {
    content = content.replace("{{PROJECTS}}", formatProjectsSection(env))
  }
  return content
}

export async function ensureWorkspace(env: NodeJS.ProcessEnv = process.env) {
  const dir = resolveWorkspaceDir(env)
  await mkdir(dir, { recursive: true })
  await mkdir(path.join(dir, "memory"), { recursive: true })

  for (const name of BOOTSTRAP_FILES) {
    const target = path.join(dir, name)
    if (await exists(target)) continue
    await writeFile(target, await readTemplate(name, env), "utf8")
  }

  return dir
}
