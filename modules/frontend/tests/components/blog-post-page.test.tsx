import { render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vite-plus/test"
import { BlogPostPage } from "@/pages/blog-post-page"

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

describe("BlogPostPage", () => {
  it("renders structured article blocks", () => {
    render(
      <MemoryRouter initialEntries={["/blog/rust-rewrite"]}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPostPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Why we are rebuilding umbra around a Rust backend",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "What a backend unlocks" }))
      .toBeInTheDocument()

    const list = screen
      .getAllByRole("list")
      .find((candidate) =>
        within(candidate).queryByText(
          "Cache a resolved song once and serve it quickly to the next listener.",
        ),
      )
    expect(list).toBeDefined()
    expect(
      within(list!).getByText(
        "Cache a resolved song once and serve it quickly to the next listener.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("This is an architecture prototype")).toBeInTheDocument()
  })
})
