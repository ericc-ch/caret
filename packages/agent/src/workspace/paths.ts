import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import envPaths from "env-paths"

const APP_NAME = "caret-agent"

export function resolveAgentPaths() {
  return envPaths(APP_NAME, { suffix: "" })
}

export function resolveWorkspaceDir(env: NodeJS.ProcessEnv = process.env) {
  const override = env.CARET_AGENT_WORKSPACE?.trim()
  if (override) return path.resolve(override)

  const paths = resolveAgentPaths()
  return path.join(paths.data, "workspace")
}

export function resolveCaretRepo(env: NodeJS.ProcessEnv = process.env, fromDir = import.meta.dirname) {
  const override = env.CARET_REPO?.trim()
  if (override) return path.resolve(override)

  let dir = path.resolve(fromDir)
  while (true) {
    const pkgPath = path.join(dir, "package.json")
    try {
      const raw = readFileSync(pkgPath, "utf8")
      const pkg = JSON.parse(raw) as { name?: string }
      if (pkg.name === "caret") return dir
    } catch {
      // not a package root
    }
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}
