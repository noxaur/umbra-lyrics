import { describe, expect, it, vi, beforeEach } from "vitest"
import { searchSongs } from "@/lib/youtube-search"

vi.mock("@/lib/lyrics-providers/api-base", () => ({
  proxyFetch: vi.fn(),
}))

vi.mock("@/lib/youtube-search-browser", () => ({
  searchSongsInBrowser: vi.fn(),
}))

import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { searchSongsInBrowser } from "@/lib/youtube-search-browser"

const mockProxyFetch = vi.mocked(proxyFetch)
const mockBrowserSearch = vi.mocked(searchSongsInBrowser)

describe("searchSongs", () => {
  beforeEach(() => {
    mockProxyFetch.mockReset()
    mockBrowserSearch.mockReset()
  })

  it("returns worker results when the API succeeds", async () => {
    mockProxyFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          query: "queen",
          results: [{ videoId: "abc", title: "Queen", channel: "Queen", durationSec: 200 }],
        }),
        { status: 200 },
      ),
    )

    const results = await searchSongs("queen")
    expect(results).toHaveLength(1)
    expect(mockBrowserSearch).not.toHaveBeenCalled()
  })

  it("does not fall back when the worker request is aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    mockProxyFetch.mockRejectedValue(new DOMException("Aborted", "AbortError"))

    await expect(searchSongs("queen", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(mockBrowserSearch).not.toHaveBeenCalled()
  })

  it("falls back to browser search when the worker API is blocked", async () => {
    mockProxyFetch.mockResolvedValue(
      new Response("<!DOCTYPE html><html>Just a moment...", {
        status: 403,
        headers: { "Content-Type": "text/html" },
      }),
    )
    mockBrowserSearch.mockResolvedValue([
      { videoId: "abc", title: "Queen", channel: "Queen", durationSec: 200 },
    ])

    const results = await searchSongs("queen")
    expect(results).toHaveLength(1)
    expect(mockBrowserSearch).toHaveBeenCalledWith("queen", undefined)
  })
})
