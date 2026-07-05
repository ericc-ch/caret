import { createComponent, createContext, useContext, type ParentProps } from "solid-js"

export function createSimpleContext<T, Props extends Record<string, unknown>>(input: {
  name: string
  init: ((input: Props) => T) | (() => T)
}) {
  const ctx = createContext<T>()

  function Provider(props: ParentProps<Props>) {
    const value = input.init(props as Props)
    const ready = (value as { ready?: boolean }).ready
    if (ready === false) return null
    return createComponent(ctx.Provider, {
      value,
      get children() {
        return props.children
      },
    })
  }

  return {
    context: ctx,
    provider: Provider,
    use() {
      const value = useContext(ctx)
      if (!value) throw new Error(`${input.name} context must be used within a context provider`)
      return value
    },
  }
}
