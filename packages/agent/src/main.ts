#!/usr/bin/env bun

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import packageJson from "../package.json" with { type: "json" }

import { chatCommand, runChat } from "./cli/chat.ts"
import { debugCommand } from "./cli/debug.ts"
import { gatewayCommand } from "./cli/gateway.ts"
import { ConfigLayer, SessionLayer } from "./lib/layers.ts"

const command = Command.make("caret-agent", {}, runChat).pipe(
  Command.withShortDescription("Personal multi-channel Cursor agent host"),
  Command.withDescription(
    "Chat platforms in, Cursor SDK as the brain. Run with no subcommand for interactive chat, or use gateway run for Discord.",
  ),
  Command.withSubcommands([chatCommand, gatewayCommand, debugCommand]),
)

const cli = Command.run(command, { version: packageJson.version })

const runtimeLayer = Layer.merge(NodeServices.layer, Layer.merge(SessionLayer, ConfigLayer))

NodeRuntime.runMain(cli.pipe(Effect.provide(runtimeLayer)))
