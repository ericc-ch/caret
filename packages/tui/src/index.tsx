import { extend, render } from "@opentui/solid"
import { SpinnerRenderable } from "opentui-spinner"
import "opentui-spinner/solid" // JSX types; register on root catalogue below
import { App } from "./app.tsx"
import { PromptRefProvider } from "./context/prompt.tsx"
import { ThemeProvider } from "./lib/theme.tsx"

extend({ spinner: SpinnerRenderable })

render(
  () => (
    <ThemeProvider>
      <PromptRefProvider>
        <App />
      </PromptRefProvider>
    </ThemeProvider>
  ),
  { exitOnCtrlC: true },
)
