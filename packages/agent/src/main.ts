#!/usr/bin/env bun

import { NodeRuntime } from "@effect/platform-node"
import { Effect, Stream } from "effect"

import { DiscordChannel, handleDiscordMessage } from "./channel/discord.ts"
import { AppLayer } from "./lib/layers.ts"
import { ensureWorkspace } from "./lib/workspace.ts"

const start = Effect.scoped(
  Effect.gen(function* () {
    yield* ensureWorkspace

    const { messages } = yield* DiscordChannel

    yield* Stream.runForEach(messages, handleDiscordMessage)
  }),
)

start.pipe(Effect.provide(AppLayer), NodeRuntime.runMain)
