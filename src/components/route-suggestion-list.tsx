import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { formatRecentLabel, getRecentSongs } from "@/lib/recent-songs"
import type { RouteSuggestion } from "@/lib/route-suggestions"
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail"

type RouteSuggestionListProps = {
  suggestions: RouteSuggestion[]
}

export function RouteSuggestionList({ suggestions }: RouteSuggestionListProps) {
  const recentById = new Map(getRecentSongs().map((song) => [song.videoId, song]))

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/50 backdrop-blur-sm">
      {suggestions.map((item) => {
        const recent = item.videoId ? recentById.get(item.videoId) : undefined
        const label = recent ? formatRecentLabel(recent) : item.label

        return (
          <li key={item.href}>
            <Link
              to={item.href}
              state={item.videoId ? { fromHome: true } : undefined}
              className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {item.videoId ? (
                <img
                  src={youtubeThumbnailUrl(item.videoId)}
                  alt=""
                  width={68}
                  height={38}
                  loading="lazy"
                  decoding="async"
                  className="h-[2.375rem] w-[4.25rem] shrink-0 rounded-md border border-border/60 bg-muted object-cover"
                />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">{label}</span>
                <span className="block text-sm text-muted-foreground">{item.reason}</span>
                {item.videoId && !recent ? (
                  <span className="mt-0.5 block font-mono text-xs text-muted-foreground/80">
                    {item.videoId}
                  </span>
                ) : null}
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                aria-hidden
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
