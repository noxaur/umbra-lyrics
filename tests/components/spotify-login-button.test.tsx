import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
    vi.useFakeTimers()
    clearQueueNotifications()
    mockUseSpotifyAuth.mockReset()
    document.body.querySelector(".spotify-easter-egg-overlay")?.remove()
  })

  afterEach(() => {
    vi.useRealTimers()
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
      message: "Spotify login is currently disabled.",
      dismissAfterMs: 3000,
    })
  })

  it("only notifies once while tapping toward the easter egg", () => {
    mockUseSpotifyAuth.mockReturnValue({
      session: null,
      isLoggedIn: false,
      logout: vi.fn(),
    })

    render(<SpotifyLoginButton />)

    const button = screen.getByRole("button", {
      name: "Log in with Spotify (unavailable — click for details)",
    })

    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(button)
    }

    expect(listQueueNotifications()).toHaveLength(1)
  })

  it("triggers the easter egg overlay after ten clicks", () => {
    mockUseSpotifyAuth.mockReturnValue({
      session: null,
      isLoggedIn: false,
      logout: vi.fn(),
    })

    render(<SpotifyLoginButton />)

    const button = screen.getByRole("button", {
      name: "Log in with Spotify (unavailable — click for details)",
    })
    button.getBoundingClientRect = () =>
      ({
        top: 12,
        left: 200,
        width: 160,
        height: 36,
        right: 360,
        bottom: 48,
        x: 200,
        y: 12,
        toJSON: () => ({}),
      }) as DOMRect

    for (let i = 0; i < 9; i += 1) {
      fireEvent.click(button)
    }
    expect(document.body.querySelector(".spotify-easter-egg-overlay")).toBeNull()
    const notificationsBeforeTenth = listQueueNotifications().length

    button.focus()
    expect(button).toHaveFocus()
    fireEvent.click(button)
    expect(document.body.querySelector(".spotify-easter-egg-overlay")).not.toBeNull()
    expect(listQueueNotifications()).toHaveLength(notificationsBeforeTenth)
    expect(button).toHaveAttribute("tabindex", "-1")
    expect(button).toHaveAttribute("aria-hidden", "true")
    expect(button).not.toHaveFocus()
  })

  it("uses a shorter label in compact mode", () => {
    mockUseSpotifyAuth.mockReturnValue({
      session: null,
      isLoggedIn: false,
      logout: vi.fn(),
    })

    render(<SpotifyLoginButton compact />)

    expect(
      screen.getByRole("button", {
        name: "Log in with Spotify (unavailable — click for details)",
      }),
    ).toHaveTextContent("Spotify")
  })

  it("resets the tap counter after the click window expires", () => {
    mockUseSpotifyAuth.mockReturnValue({
      session: null,
      isLoggedIn: false,
      logout: vi.fn(),
    })

    render(<SpotifyLoginButton />)

    const button = screen.getByRole("button", {
      name: "Log in with Spotify (unavailable — click for details)",
    })

    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(button)
    }
    expect(listQueueNotifications()).toHaveLength(1)

    vi.advanceTimersByTime(4001)

    fireEvent.click(button)
    expect(listQueueNotifications()).toHaveLength(2)
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
