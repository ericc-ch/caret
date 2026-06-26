import { NodeServices } from "@effect/platform-node"
import { Layer } from "effect"

import { DiscordChannel } from "../channel/discord.ts"
import { AgentConfig } from "./config.ts"
import { SessionStore } from "./session-store.ts"
import { Sessions } from "./sessions.ts"

const NodeLayer = NodeServices.layer

const ConfigLayer = AgentConfig.layer.pipe(Layer.provide(NodeLayer))

const SessionStoreLayer = SessionStore.layer.pipe(Layer.provide(NodeLayer))

const SessionsLayer = Sessions.layer.pipe(
  Layer.provide(Layer.merge(ConfigLayer, SessionStoreLayer)),
)

export const SessionLayer = SessionsLayer.pipe(Layer.provideMerge(NodeLayer))

export const AppLayer = Layer.merge(SessionLayer, DiscordChannel.layer).pipe(
  Layer.provide(ConfigLayer),
  Layer.provideMerge(NodeLayer),
)
