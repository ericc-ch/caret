import { ManagedRuntime } from "effect"
import { Session } from "../services/session.ts"

export const runtime = ManagedRuntime.make(Session.layer)
