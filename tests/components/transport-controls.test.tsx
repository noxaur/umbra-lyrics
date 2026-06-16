import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, beforeEach } from "vitest"
import { TransportControls } from "@/components/transport-controls"
import { usePlayerStore } from "@/stores/player-store"

const noop = () => {}

function renderControls(overrides: Partial<Parameters<typeof TransportControls>[0]> = {}) {
  return render(
    <TransportControls
      duration={120}
      currentTime={30}
      isPlaying={false}
      onPlay={noop}
      onPause={noop}
      onSeek={noop}
      {...overrides}
    />,
  )
}

describe("TransportControls", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      syncOffsetMs: 0,
      videoHidden: false,
      focusMode: false,
      tvMode: false,
      displayMode: "native",
      languageCode: "ja",
      englishLines: [],
    })
  })

  it("groups view options in the View menu", () => {
    renderControls()

    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Hide video" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Enable TV mode" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Focus mode" })).not.toBeInTheDocument()
  })

  it("labels lyrics timing controls", () => {
    renderControls()

    expect(screen.getByLabelText("Lyrics timing offset 0.0 seconds")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Lyrics 0.5 seconds earlier" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Lyrics 0.5 seconds later" })).toBeInTheDocument()
  })

  it("keeps English enabled without lines and shows helper", () => {
    renderControls()

    const select = screen.getByRole("combobox", { name: "Lyric display mode" })
    const english = screen.getByRole("option", { name: "English" })
    const both = screen.getByRole("option", { name: "Both" })

    expect(english).toBeEnabled()
    expect(both).toBeEnabled()
    expect(screen.getByText("No English lyrics found")).toBeInTheDocument()
    expect(select).toHaveAttribute("aria-describedby", "bilingual-helper")
  })

  it("enables English/Both when english lines exist", () => {
    usePlayerStore.setState({ englishLines: ["Hello", "World"] })
    renderControls()

    expect(screen.getByRole("option", { name: "English" })).toBeEnabled()
    expect(screen.getByRole("option", { name: "Both" })).toBeEnabled()
    expect(screen.queryByText("No English lyrics found")).not.toBeInTheDocument()
  })

  it("resets display mode to native when english lines removed", async () => {
    usePlayerStore.setState({ displayMode: "english", englishLines: ["Line"] })
    const { rerender } = renderControls()

    usePlayerStore.setState({ englishLines: [] })
    rerender(
      <TransportControls
        duration={120}
        currentTime={30}
        isPlaying={false}
        onPlay={noop}
        onPause={noop}
        onSeek={noop}
      />,
    )

    expect(usePlayerStore.getState().displayMode).toBe("native")
  })

  it("adjusts sync offset via timing buttons", () => {
    renderControls()

    fireEvent.click(screen.getByRole("button", { name: "Lyrics 0.5 seconds later" }))
    expect(usePlayerStore.getState().syncOffsetMs).toBe(500)

    fireEvent.click(screen.getByRole("button", { name: "Lyrics 0.5 seconds earlier" }))
    expect(usePlayerStore.getState().syncOffsetMs).toBe(0)
  })

  it("auto-switches to both when translated english arrives", () => {
    usePlayerStore.setState({ displayMode: "native", englishLines: [], englishSource: null })
    const { rerender } = renderControls()

    usePlayerStore.setState({
      englishLines: ["Hello"],
      englishSource: "translated",
    })
    rerender(
      <TransportControls
        duration={120}
        currentTime={30}
        isPlaying={false}
        onPlay={noop}
        onPause={noop}
        onSeek={noop}
      />,
    )

    expect(usePlayerStore.getState().displayMode).toBe("both")
  })
})
