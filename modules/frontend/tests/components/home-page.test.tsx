import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HomePage } from "@/pages/home-page"
import { ThemeProvider } from "@/components/theme-provider"

vi.mock("@/lib/recent-songs", () => ({
  clearRecentSongs: vi.fn(),
  enrichRecentSongEnglish: vi.fn().mockResolvedValue(null),
  formatRecentLabel: vi.fn(),
  getRecentSongs: vi.fn(() => []),
  needsEnglishSubtitle: vi.fn(() => false),
}))

vi.mock("@/lib/playlists", () => ({
  readPlaylists: vi.fn(() => []),
}))

function renderHomePage() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <HomePage />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows umbra as the hero title with sing-along copy in the subtitle", () => {
    renderHomePage()

    expect(screen.getByRole("heading", { level: 1, name: "umbra" })).toBeInTheDocument()
    expect(screen.getByText(/Sing along — search for a song/i)).toBeInTheDocument()
  })
})
