import { Context, Effect, FileSystem, Layer, Path, Predicate, Schema } from "effect"

import { paths } from "./paths.ts"

const CONFIG_FILE_NAME = "config.json"
const CONFIG_FILE_MODE = 0o600

const scaffoldConfig = {
  apiKey: "",
  discordToken: "",
} as const

const AgentConfigSchema = Schema.Struct({
  apiKey: Schema.RedactedFromValue(Schema.NonEmptyString).annotateKey({
    description: "Cursor API key for local agents.",
  }),
  discordToken: Schema.RedactedFromValue(Schema.NonEmptyString).annotateKey({
    description: "Discord bot token.",
  }),
  $schema: Schema.optional(Schema.String).annotateKey({
    description: "Optional JSON Schema URL for editor validation hints.",
  }),
}).annotate({
  description: "caret-agent configuration at config.json (see paths.config).",
})

export const agentConfigJsonSchemaDocument = () => Schema.toJsonSchemaDocument(AgentConfigSchema)

const AgentConfigFile = Schema.fromJsonString(AgentConfigSchema)

export class AgentConfig extends Context.Service<AgentConfig>()("@caret/agent/AgentConfig", {
  make: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configFilePath = path.join(paths.config, CONFIG_FILE_NAME)

    const rawContent = yield* fs.readFileString(configFilePath).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Predicate.isTagged(cause.reason, "NotFound")
          ? Effect.gen(function* () {
              const content = `${JSON.stringify(scaffoldConfig, null, 2)}\n`
              yield* fs.makeDirectory(paths.config, { recursive: true })
              yield* fs.writeFileString(configFilePath, content, { mode: CONFIG_FILE_MODE })
              yield* Effect.logInfo("Created config scaffold at", configFilePath)
              return content
            })
          : Effect.fail(cause),
      ),
    )

    const config = yield* Schema.decodeUnknownEffect(AgentConfigFile)(rawContent)

    return { config }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
