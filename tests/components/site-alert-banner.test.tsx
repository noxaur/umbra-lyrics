import { beforeEach, describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SiteAlertBanner } from "@/components/site-alert-banner"
import type { SiteAlert } from "@/lib/content-types"

const testAlert: SiteAlert = {
  id: "test-banner",
  severity: "warning",
  title: "Under the hood",
  message: "We are currently rewriting to Rust.",
  dismissible: true,
  link: { href: "/blog/rust-rewrite", label: "Learn more" },
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
    expect(screen.getByText("Under the hood")).toBeInTheDocument()
    expect(screen.getByText("We are currently rewriting to Rust.")).toBeInTheDocument()
  })

  it("renders optional link", () => {
    renderBanner()
    const link = screen.getByRole("link", { name: "Learn more" })
    expect(link).toHaveAttribute("href", "/blog/rust-rewrite")
  })

  it("applies warning severity styles", () => {
    renderBanner()
    expect(screen.getByRole("alert")).toHaveClass("border-amber-500/40")
  })

  it("applies info severity role", () => {
    renderBanner({ ...testAlert, severity: "info" })
    expect(screen.getByRole("status")).toHaveClass("border-sky-500/40")
  })

  it("hides after dismiss", () => {
    renderBanner()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss announcement" }))
    expect(screen.queryByText("Under the hood")).not.toBeInTheDocument()
    expect(localStorage.getItem("umbra:site-alert-dismissed:test-banner")).toBe("1")
  })
})
