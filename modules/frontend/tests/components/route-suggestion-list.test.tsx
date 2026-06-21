import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { RouteSuggestionList } from "@/components/route-suggestion-list"

const ID = "dQw4w9WgXcQ"

describe("RouteSuggestionList", () => {
  it("renders thumbnails for play suggestions", () => {
    render(
      <MemoryRouter>
        <RouteSuggestionList
          suggestions={[
            {
              href: `/play/${ID}`,
              label: "Open player",
              reason: "Did you mean the karaoke player?",
              videoId: ID,
            },
          ]}
        />
      </MemoryRouter>,
    )

    const link = screen.getByRole("link", { name: /open player/i })
    expect(link).toHaveAttribute("href", `/play/${ID}`)
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`,
    )
  })
})
