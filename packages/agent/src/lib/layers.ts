import { NodeServices } from "@effect/platform-node"
import { Layer } from "effect"

import { AgentConfig } from "./config.ts"
import { SessionStore } from "./session-store.ts"
import { Sessions } from "./sessions.ts"

const NodeLayer = NodeServices.layer

export const ConfigLayer = AgentConfig.layer.pipe(Layer.provide(NodeLayer))

export const SessionStoreLayer = SessionStore.layer.pipe(Layer.provide(NodeLayer))

const SessionsLayer = Sessions.layer.pipe(
  Layer.provide(Layer.merge(ConfigLayer, SessionStoreLayer)),
)

export const SessionLayer = SessionsLayer.pipe(Layer.provideMerge(NodeLayer))
