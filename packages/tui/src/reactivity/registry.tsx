import { RegistryContext } from "@effect/atom-solid"
import { AtomRegistry } from "effect/unstable/reactivity"
import { createComponent, onCleanup, type JSX, type ParentProps } from "solid-js"
import { sessionSnapshotAtom } from "./atoms.ts"

export const appRegistry = AtomRegistry.make({
  initialValues: [[sessionSnapshotAtom, undefined]],
})

export function AppRegistryProvider(props: ParentProps): JSX.Element {
  onCleanup(() => {
    appRegistry.dispose()
  })

  return createComponent(RegistryContext.Provider, {
    value: appRegistry,
    get children() {
      return props.children
    },
  })
}
