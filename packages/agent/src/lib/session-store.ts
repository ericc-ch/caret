import path from "node:path"

import { Context, Effect, FileSystem, Layer, Predicate, Schema } from "effect"

import { paths } from "./paths.ts"

const SESSIONS_FILE_NAME = "sessions.json"

const sessionsFile = path.join(paths.data, SESSIONS_FILE_NAME)

const emptyStoreContent = `${JSON.stringify({ threads: {} }, null, 2)}\n`

const SessionRecordSchema = Schema.Struct({
  channel: Schema.String,
  agentId: Schema.String,
  createdAt: Schema.Number,
  lastActiveAt: Schema.Number,
})

export type SessionRecord = typeof SessionRecordSchema.Type

const SessionsFileSchema = Schema.Struct({
  threads: Schema.Record(Schema.String, SessionRecordSchema),
})

const SessionsFileJson = Schema.fromJsonString(SessionsFileSchema)

export class SessionStore extends Context.Service<SessionStore>()("@caret/agent/SessionStore", {
  make: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    const readStore = () =>
      Effect.gen(function* () {
        const raw = yield* fs.readFileString(sessionsFile).pipe(
          Effect.catchTag("PlatformError", (cause) =>
            Predicate.isTagged(cause.reason, "NotFound")
              ? Effect.gen(function* () {
                  yield* fs.makeDirectory(paths.data, { recursive: true })
                  yield* fs.writeFileString(sessionsFile, emptyStoreContent)
                  return emptyStoreContent
                })
              : Effect.fail(cause),
          ),
        )

        return yield* Schema.decodeUnknownEffect(SessionsFileJson)(raw)
      })

    const writeStore = (data: typeof SessionsFileSchema.Type) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(paths.data, { recursive: true })
        yield* fs.writeFileString(sessionsFile, `${JSON.stringify(data, null, 2)}\n`)
      })

    const get = (sessionId: string) =>
      readStore().pipe(Effect.map((data) => data.threads[sessionId]))

    const upsert = (
      sessionId: string,
      record: { channel: string; agentId: string; createdAt?: number },
    ) =>
      Effect.gen(function* () {
        const data = yield* readStore()
        const now = Date.now()
        const existing = data.threads[sessionId]

        yield* writeStore({
          threads: {
            ...data.threads,
            [sessionId]: {
              channel: record.channel,
              agentId: record.agentId,
              createdAt: existing?.createdAt ?? record.createdAt ?? now,
              lastActiveAt: now,
            },
          },
        })
      })

    const touch = (sessionId: string) =>
      Effect.gen(function* () {
        const data = yield* readStore()
        const row = data.threads[sessionId]
        if (!row) return

        yield* writeStore({
          threads: {
            ...data.threads,
            [sessionId]: { ...row, lastActiveAt: Date.now() },
          },
        })
      })

    return { get, upsert, touch }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
