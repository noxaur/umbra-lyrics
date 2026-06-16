import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { UrlInput } from "@/components/url-input"

const navigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

const PLACEHOLDER = "Paste YouTube, Spotify, or song.opsec.rent link…"

function renderInput() {
  return render(
    <MemoryRouter>
      <UrlInput />
    </MemoryRouter>,
  )
}

describe("UrlInput", () => {
  it("uses text input with url input mode for bare video ids", () => {
    renderInput()

    const input = screen.getByPlaceholderText(PLACEHOLDER)
    expect(input).toHaveAttribute("type", "text")
    expect(input).toHaveAttribute("inputmode", "url")
  })

  it("navigates with bare 11-char video id", async () => {
    navigate.mockClear()
    renderInput()

    const input = screen.getByPlaceholderText(PLACEHOLDER)
    fireEvent.change(input, { target: { value: "dQw4w9WgXcQ" } })
    fireEvent.click(screen.getByRole("button", { name: /start/i }))

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/play/dQw4w9WgXcQ", {
        state: { fromHome: true },
      })
    })
  })

  it("navigates with karaoke share URL", async () => {
    navigate.mockClear()
    renderInput()

    const input = screen.getByPlaceholderText(PLACEHOLDER)
    fireEvent.change(input, {
      target: { value: "https://song.opsec.rent/play/dQw4w9WgXcQ" },
    })
    fireEvent.click(screen.getByRole("button", { name: /start/i }))

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/play/dQw4w9WgXcQ", {
        state: { fromHome: true },
      })
    })
  })

  it("navigates with karaoke watch URL", async () => {
    navigate.mockClear()
    renderInput()

    const input = screen.getByPlaceholderText(PLACEHOLDER)
    fireEvent.change(input, {
      target: { value: "https://song.opsec.rent/watch?v=dQw4w9WgXcQ" },
    })
    fireEvent.click(screen.getByRole("button", { name: /start/i }))

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/play/dQw4w9WgXcQ", {
        state: { fromHome: true },
      })
    })
  })

  it("shows app validation error for invalid input", async () => {
    renderInput()

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "not-valid" },
    })
    fireEvent.click(screen.getByRole("button", { name: /start/i }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Enter a valid YouTube, Spotify track, or song link",
      )
    })
  })
})
