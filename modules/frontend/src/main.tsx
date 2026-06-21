import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import { bootstrapDisplaySettingsFromStorage } from "@/lib/display-settings"
import { migrateSongKaraStorage } from "@/lib/rebrand-migration"
import "./index.css"

migrateSongKaraStorage()
bootstrapDisplaySettingsFromStorage()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
