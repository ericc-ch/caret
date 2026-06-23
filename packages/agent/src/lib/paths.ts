import envPaths from "env-paths"
import path from "node:path"

export const paths = envPaths("caret-agent", { suffix: "" })
export const workspaceDir = path.join(paths.data, "workspace")
