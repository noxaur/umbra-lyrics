import { beforeEach, describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SiteAlertBanner } from "@/components/site-alert-banner"
import type { SiteAlert } from "@/lib/content-types"

const testAlert: SiteAlert = {
  id: "test-banner",
  severity: "info",
  title: "Backend prototype in progress",
  message: "We are moving repeated lyrics work off your device.",
  dismissible: true,
  link: { href: "/blog/rust-rewrite", label: "Why we are rebuilding" },
}

function renderBanner(alert: SiteAlert = testAlert) {
  return render(
    <MemoryRouter>
      <SiteAlertBanner alert={alert} />
    </MemoryRouter>,
  )
}

describe("SiteAlertBanner", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("renders title and message", () => {
    renderBanner()
    expect(screen.getByText("Backend prototype in progress")).toBeInTheDocument()
    expect(screen.getByText("We are moving repeated lyrics work off your device.")).toBeInTheDocument()
  })

  it("renders optional link", () => {
    renderBanner()
    const link = screen.getByRole("link", { name: "Why we are rebuilding" })
    expect(link).toHaveAttribute("href", "/blog/rust-rewrite")
  })

  it("applies warning severity styles", () => {
    renderBanner({ ...testAlert, severity: "warning" })
    expect(screen.getByRole("alert")).toHaveClass("border-amber-500/40")
  })

  it("applies info severity role", () => {
    renderBanner()
    expect(screen.getByRole("status")).toHaveClass("border-sky-500/40")
  })

  it("hides after dismiss", () => {
    renderBanner()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss announcement" }))
    expect(screen.queryByText("Backend prototype in progress")).not.toBeInTheDocument()
    expect(localStorage.getItem("umbra:site-alert-dismissed:test-banner")).toBe("1")
  })

  it("falls back to info styles for unknown severity", () => {
    renderBanner({ ...testAlert, severity: "warn" as SiteAlert["severity"] })
    expect(screen.getByRole("status")).toHaveClass("border-sky-500/40")
  })
})
