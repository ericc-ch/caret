import { Atom } from "effect/unstable/reactivity"
import type { SessionSnapshot } from "../services/session.ts"

export const sessionSnapshotAtom = Atom.make<SessionSnapshot | undefined>(undefined).pipe(Atom.keepAlive)
