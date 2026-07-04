import { render } from "@opentui/solid"
import { RegistryProvider } from "@effect/atom-solid"
import { App } from "./app.tsx"
import { registerImage } from "./components/register.ts"
import { ThemeProvider } from "./lib/theme.tsx"

registerImage()

render(
  () => (
    <RegistryProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </RegistryProvider>
  ),
  {
    screenMode: "split-footer",
    footerHeight: 3,
  },
)
