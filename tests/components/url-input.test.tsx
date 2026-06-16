import { render, screen, fireEvent } from "@testing-library/react"
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

    const input = screen.getByPlaceholderText("Paste YouTube or song.opsec.rent link…")
    expect(input).toHaveAttribute("type", "text")
    expect(input).toHaveAttribute("inputmode", "url")
  })

  it("navigates with bare 11-char video id", () => {
    navigate.mockClear()
    renderInput()

    const input = screen.getByPlaceholderText("Paste YouTube or song.opsec.rent link…")
    fireEvent.change(input, { target: { value: "dQw4w9WgXcQ" } })
    fireEvent.click(screen.getByRole("button", { name: /start/i }))

    expect(navigate).toHaveBeenCalledWith("/play/dQw4w9WgXcQ", {
      state: { fromHome: true },
    })
  })

  it("navigates with karaoke share URL", () => {
    navigate.mockClear()
    renderInput()

    const input = screen.getByPlaceholderText("Paste YouTube or song.opsec.rent link…")
    fireEvent.change(input, {
      target: { value: "https://song.opsec.rent/play/dQw4w9WgXcQ" },
    })
    fireEvent.click(screen.getByRole("button", { name: /start/i }))

    expect(navigate).toHaveBeenCalledWith("/play/dQw4w9WgXcQ", {
      state: { fromHome: true },
    })
  })

  it("navigates with karaoke watch URL", () => {
    navigate.mockClear()
    renderInput()

    const input = screen.getByPlaceholderText("Paste YouTube or song.opsec.rent link…")
    fireEvent.change(input, {
      target: { value: "https://song.opsec.rent/watch?v=dQw4w9WgXcQ" },
    })
    fireEvent.click(screen.getByRole("button", { name: /start/i }))

    expect(navigate).toHaveBeenCalledWith("/play/dQw4w9WgXcQ", {
      state: { fromHome: true },
    })
  })

  it("shows app validation error for invalid input", () => {
    renderInput()

    fireEvent.change(screen.getByPlaceholderText("Paste YouTube or song.opsec.rent link…"), {
      target: { value: "not-valid" },
    })
    fireEvent.click(screen.getByRole("button", { name: /start/i }))

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid YouTube URL, song link, or video ID",
    )
  })
})
