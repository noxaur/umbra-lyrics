import { describe, it, expect } from "vitest"
import {
  extractYouTubeVideoId,
  extractYouTubePlaylistId,
  isKaraokePlayUrl,
  isKaraokeWatchUrl,
  isYouTubePlaylistUrl,
  isYouTubeUrl,
  karaokePlayUrl,
  karaokeWatchUrl,
  KARAOKE_PUBLIC_ORIGIN,
  toKaraokePlayUrl,
  youTubeMusicPlaylistUrl,
  youTubeMusicWatchUrl,
  youTubeWatchUrl,
} from "@/lib/youtube-url"

const ID = "dQw4w9WgXcQ"

describe("extractYouTubeVideoId", () => {
  it("parses watch URLs", () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it("parses watch URLs with extra query params", () => {
    expect(
      extractYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}&list=PLabc&t=120s`),
    ).toBe(ID)
    expect(
      extractYouTubeVideoId(`https://www.youtube.com/watch?si=share123&v=${ID}`),
    ).toBe(ID)
  })

  it("parses youtu.be URLs", () => {
    expect(extractYouTubeVideoId(`https://youtu.be/${ID}`)).toBe(ID)
    expect(extractYouTubeVideoId(`https://youtu.be/${ID}?si=share123`)).toBe(ID)
  })

  it("parses embed URLs", () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
    expect(extractYouTubeVideoId(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(
      ID,
    )
  })

  it("parses shorts URLs", () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
    expect(
      extractYouTubeVideoId(`https://youtube.com/shorts/${ID}?si=share123`),
    ).toBe(ID)
  })

  it("parses live URLs", () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/live/${ID}`)).toBe(ID)
  })

  it("parses YouTube Music URLs", () => {
    expect(extractYouTubeVideoId(`https://music.youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(extractYouTubeVideoId(`https://music.youtube.com/embed/${ID}`)).toBe(ID)
  })

  it("parses mobile YouTube URLs", () => {
    expect(extractYouTubeVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it("parses legacy v/e/vi path URLs", () => {
    expect(extractYouTubeVideoId(`https://www.youtube.com/v/${ID}`)).toBe(ID)
    expect(extractYouTubeVideoId(`https://www.youtube.com/e/${ID}`)).toBe(ID)
    expect(extractYouTubeVideoId(`https://www.youtube.com/vi/${ID}`)).toBe(ID)
  })

  it("parses karaoke share URLs", () => {
    expect(extractYouTubeVideoId(`https://song.opsec.rent/play/${ID}`)).toBe(ID)
    expect(extractYouTubeVideoId(`http://127.0.0.1:5173/play/${ID}`)).toBe(ID)
    expect(extractYouTubeVideoId(`/play/${ID}`)).toBe(ID)
  })

  it("parses karaoke watch URLs", () => {
    expect(extractYouTubeVideoId(`https://song.opsec.rent/watch?v=${ID}`)).toBe(ID)
    expect(extractYouTubeVideoId(`/watch?v=${ID}`)).toBe(ID)
    expect(
      extractYouTubeVideoId(`https://song.opsec.rent/watch?si=share&v=${ID}`),
    ).toBe(ID)
  })

  it("accepts bare video id", () => {
    expect(extractYouTubeVideoId(ID)).toBe(ID)
  })

  it("returns null for invalid input", () => {
    expect(extractYouTubeVideoId("not-a-url")).toBeNull()
    expect(extractYouTubeVideoId("")).toBeNull()
    expect(extractYouTubeVideoId("https://example.com/watch?v=short")).toBeNull()
  })
})

describe("extractYouTubePlaylistId", () => {
  const PL = "PLrAXtmRdnEQy6nuLMH8xZzFw5J5BtEn"

  it("parses playlist URLs", () => {
    expect(
      extractYouTubePlaylistId(`https://www.youtube.com/playlist?list=${PL}`),
    ).toBe(PL)
    expect(
      extractYouTubePlaylistId(`https://music.youtube.com/playlist?list=${PL}`),
    ).toBe(PL)
  })

  it("parses watch URLs with a list param", () => {
    expect(
      extractYouTubePlaylistId(`https://www.youtube.com/watch?v=${ID}&list=${PL}`),
    ).toBe(PL)
  })

  it("accepts bare playlist ids", () => {
    expect(extractYouTubePlaylistId(PL)).toBe(PL)
  })

  it("accepts short mix playlist ids like RDMM", () => {
    expect(
      extractYouTubePlaylistId("https://www.youtube.com/watch?v=5MWcRauCR4w&list=RDMM&start_radio=1"),
    ).toBe("RDMM")
  })

  it("accepts timeline mix playlist ids", () => {
    expect(
      extractYouTubePlaylistId(
        "https://www.youtube.com/watch?v=AqI97zHMoQw&list=TLGGTO9zKWr2W4gxNjA2MjAyNg",
      ),
    ).toBe("TLGGTO9zKWr2W4gxNjA2MjAyNg")
  })

  it("returns null for invalid input", () => {
    expect(extractYouTubePlaylistId(`https://www.youtube.com/watch?v=${ID}`)).toBeNull()
    expect(extractYouTubePlaylistId("not-a-playlist")).toBeNull()
  })
})

describe("isYouTubePlaylistUrl", () => {
  const PL = "PLrAXtmRdnEQy6nuLMH8xZzFw5J5BtEn"

  it("detects playlist URLs", () => {
    expect(isYouTubePlaylistUrl(`https://www.youtube.com/playlist?list=${PL}`)).toBe(true)
  })
})

describe("isYouTubeUrl", () => {
  it("detects YouTube URLs", () => {
    expect(isYouTubeUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(true)
    expect(isYouTubeUrl(`https://youtu.be/${ID}`)).toBe(true)
  })

  it("rejects karaoke and bare ids", () => {
    expect(isYouTubeUrl(`https://song.opsec.rent/play/${ID}`)).toBe(false)
    expect(isYouTubeUrl(ID)).toBe(false)
  })
})

describe("isKaraokeWatchUrl", () => {
  it("detects karaoke watch URLs", () => {
    expect(isKaraokeWatchUrl(`https://song.opsec.rent/watch?v=${ID}`)).toBe(true)
    expect(isKaraokeWatchUrl(`/watch?v=${ID}`)).toBe(true)
  })

  it("rejects play URLs", () => {
    expect(isKaraokeWatchUrl(`https://song.opsec.rent/play/${ID}`)).toBe(false)
  })
})

describe("karaokeWatchUrl", () => {
  it("builds a YouTube-style karaoke share URL", () => {
    expect(karaokeWatchUrl(ID)).toBe(`${KARAOKE_PUBLIC_ORIGIN}/watch?v=${ID}`)
  })
})

describe("isKaraokePlayUrl", () => {
  it("detects karaoke share URLs", () => {
    expect(isKaraokePlayUrl(`https://song.opsec.rent/play/${ID}`)).toBe(true)
    expect(isKaraokePlayUrl(`/play/${ID}`)).toBe(true)
    expect(isKaraokePlayUrl(`http://localhost:5173/play/${ID}`)).toBe(true)
  })

  it("rejects YouTube URLs", () => {
    expect(isKaraokePlayUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(false)
  })
})

describe("youTubeWatchUrl", () => {
  it("builds a YouTube watch URL", () => {
    expect(youTubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`)
  })
})

describe("youTubeMusicWatchUrl", () => {
  it("builds a YouTube Music watch URL", () => {
    expect(youTubeMusicWatchUrl(ID)).toBe(`https://music.youtube.com/watch?v=${ID}`)
  })
})

describe("youTubeMusicPlaylistUrl", () => {
  it("builds a YouTube Music playlist URL", () => {
    expect(youTubeMusicPlaylistUrl("PLabc123")).toBe(
      "https://music.youtube.com/playlist?list=PLabc123",
    )
  })
})

describe("karaokePlayUrl", () => {
  it("builds the public karaoke share URL", () => {
    expect(karaokePlayUrl(ID)).toBe(`${KARAOKE_PUBLIC_ORIGIN}/play/${ID}`)
  })

  it("allows a custom origin for dev", () => {
    expect(karaokePlayUrl(ID, "http://127.0.0.1:5173")).toBe(
      `http://127.0.0.1:5173/play/${ID}`,
    )
  })
})

describe("toKaraokePlayUrl", () => {
  it("converts YouTube watch URLs", () => {
    expect(toKaraokePlayUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(
      `${KARAOKE_PUBLIC_ORIGIN}/play/${ID}`,
    )
  })

  it("converts youtu.be URLs", () => {
    expect(toKaraokePlayUrl(`https://youtu.be/${ID}`)).toBe(
      `${KARAOKE_PUBLIC_ORIGIN}/play/${ID}`,
    )
  })

  it("converts shorts URLs", () => {
    expect(toKaraokePlayUrl(`https://www.youtube.com/shorts/${ID}`)).toBe(
      `${KARAOKE_PUBLIC_ORIGIN}/play/${ID}`,
    )
  })

  it("converts bare video ids", () => {
    expect(toKaraokePlayUrl(ID)).toBe(`${KARAOKE_PUBLIC_ORIGIN}/play/${ID}`)
  })

  it("passes through karaoke URLs unchanged in shape", () => {
    expect(toKaraokePlayUrl(`https://song.opsec.rent/play/${ID}`)).toBe(
      `${KARAOKE_PUBLIC_ORIGIN}/play/${ID}`,
    )
  })

  it("converts karaoke watch URLs", () => {
    expect(toKaraokePlayUrl(`https://song.opsec.rent/watch?v=${ID}`)).toBe(
      `${KARAOKE_PUBLIC_ORIGIN}/play/${ID}`,
    )
  })

  it("returns null for invalid input", () => {
    expect(toKaraokePlayUrl("not-valid")).toBeNull()
  })
})
