import path from "node:path"

import { Console, Effect, Formatter } from "effect"
import { Command } from "effect/unstable/cli"

import { AgentConfig, agentConfigJsonSchemaDocument } from "../lib/config.ts"
import { ConfigLayer, SessionStoreLayer } from "../lib/layers.ts"
import { paths, workspaceDir } from "../lib/paths.ts"
import { SessionStore } from "../lib/session-store.ts"

const debugPathsCommand = Command.make(
  "paths",
  {},
  Effect.fn("caret-agent.debug.paths")(function* () {
    yield* Console.log(
      Formatter.formatJson(
        {
          config: paths.config,
          data: paths.data,
          cache: paths.cache,
          log: paths.log,
          temp: paths.temp,
          configFile: path.join(paths.config, "config.json"),
          sessionsFile: path.join(paths.data, "sessions.json"),
          workspace: workspaceDir,
        },
        { space: 2 },
      ),
    )
  }),
).pipe(
  Command.withDescription(
    "Print resolved filesystem paths: env-paths roots, config.json, sessions.json, and workspace.",
  ),
  Command.withExamples([
    {
      command: "caret-agent debug paths",
      description: "Show where caret-agent stores config and workspace data",
    },
  ]),
)

const debugConfigSchemaCommand = Command.make(
  "schema",
  {},
  Effect.fn("caret-agent.debug.config.schema")(function* () {
    const document = agentConfigJsonSchemaDocument()
    yield* Console.log(Formatter.formatJson(document.schema, { space: 2 }))
  }),
).pipe(
  Command.withDescription(
    "Print the JSON Schema for config.json, including per-field descriptions.",
  ),
)

const debugConfigCommand = Command.make(
  "config",
  {},
  Effect.fn("caret-agent.debug.config")(function* () {
    const { config } = yield* AgentConfig
    yield* Console.log(
      Formatter.formatJson(
        {
          ...(config.$schema === undefined ? {} : { $schema: config.$schema }),
          apiKey: "<redacted>",
          discordToken: "<redacted>",
        },
        { space: 2 },
      ),
    )
  }, Effect.provide(ConfigLayer)),
).pipe(
  Command.withShortDescription("config.json helpers"),
  Command.withDescription("Inspect caret-agent configuration (secrets redacted)."),
  Command.withSubcommands([debugConfigSchemaCommand]),
)

const debugSessionsCommand = Command.make(
  "sessions",
  {},
  Effect.fn("caret-agent.debug.sessions")(function* () {
    const store = yield* SessionStore
    const sessions = yield* store.list()
    yield* Console.log(Formatter.formatJson(sessions, { space: 2 }))
  }, Effect.provide(SessionStoreLayer)),
).pipe(Command.withDescription("List persisted agent sessions from sessions.json."))

export const debugCommand = Command.make("debug").pipe(
  Command.withShortDescription("Debug and introspection"),
  Command.withDescription(
    "Print resolved paths, configuration, and session state. Does not start channels or agents.",
  ),
  Command.withSubcommands([debugPathsCommand, debugConfigCommand, debugSessionsCommand]),
)
