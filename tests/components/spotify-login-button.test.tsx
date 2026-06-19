import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SpotifyLoginButton } from "@/components/spotify-login-button"
import {
  clearQueueNotifications,
  listQueueNotifications,
} from "@/lib/queue-notifications"

const mockUseSpotifyAuth = vi.fn()

vi.mock("@/hooks/use-spotify-auth", () => ({
  useSpotifyAuth: () => mockUseSpotifyAuth(),
}))

describe("SpotifyLoginButton", () => {
  beforeEach(() => {
    clearQueueNotifications()
    mockUseSpotifyAuth.mockReset()
  })

  it("shows a greyed-out login button when logged out", () => {
    mockUseSpotifyAuth.mockReturnValue({
      session: null,
      isLoggedIn: false,
      logout: vi.fn(),
    })

    render(<SpotifyLoginButton />)

    const button = screen.getByRole("button", {
      name: "Log in with Spotify (unavailable — click for details)",
    })
    expect(button).toHaveClass("opacity-60")
    expect(button).not.toHaveAttribute("aria-disabled")
  })

  it("pushes an info notification when the disabled login button is clicked", () => {
    mockUseSpotifyAuth.mockReturnValue({
      session: null,
      isLoggedIn: false,
      logout: vi.fn(),
    })

    render(<SpotifyLoginButton />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "Log in with Spotify (unavailable — click for details)",
      }),
    )

    const notifications = listQueueNotifications()
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      kind: "info",
      title: "Spotify login unavailable",
      message: "Spotify login is disabled currently.",
      dismissAfterMs: 3000,
    })
  })

  it("shows profile and logout when logged in", () => {
    const logout = vi.fn()
    mockUseSpotifyAuth.mockReturnValue({
      session: {
        displayName: "Test User",
        imageUrl: "https://example.com/avatar.jpg",
      },
      isLoggedIn: true,
      logout,
    })

    render(<SpotifyLoginButton />)

    expect(screen.getByText("Test User")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Log out" }))
    expect(logout).toHaveBeenCalledOnce()
  })
})
