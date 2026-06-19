import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { PlaylistTrackRow } from "@/components/playlist-track-row"

describe("PlaylistTrackRow", () => {
  it("shows a Music YouTube badge when the track was swapped", () => {
    render(
      <PlaylistTrackRow
        track={{
          videoId: "canonical01",
          title: "Track Name - Artist Name",
          artist: "Artist Name",
          track: "Track Name",
          mediaSource: "music.youtube",
          addedAt: 1,
        }}
      />,
    )

    expect(screen.getByLabelText(/swapped to music youtube/i)).toBeInTheDocument()
  })
})
