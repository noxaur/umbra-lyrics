import { extractYouTubeVideoId, YOUTUBE_VIDEO_ID_RE } from "@/lib/youtube-url"

export type RouteSuggestion = {
  href: string
  label: string
  reason: string
}

type KnownRoute = {
  path: string
  label: string
  aliases: string[]
}

const KNOWN_ROUTES: KnownRoute[] = [
  { path: "/", label: "Home", aliases: ["home", "index", "start"] },
  { path: "/themes", label: "Themes", aliases: ["theme", "themes", "palette", "style", "styles"] },
  {
    path: "/themes/build",
    label: "Theme builder",
    aliases: ["build", "builder", "custom", "create"],
  },
  { path: "/watch", label: "Watch link", aliases: ["watch"] },
]

const PLAY_ALIASES = ["play", "player", "song", "songs", "karaoke", "video", "videos", "p"]

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = Array.from<number>({ length: b.length + 1 })

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }

  return prev[b.length]
}

function bestAliasScore(segment: string, aliases: string[]): number {
  let best = Infinity
  for (const alias of aliases) {
    if (segment === alias) return 0
    if (segment.startsWith(alias) || alias.startsWith(segment)) {
      best = Math.min(best, 1)
      continue
    }
    if (segment.length < 2 || alias.length < 2) continue
    const dist = levenshtein(segment, alias)
    const threshold = segment.length <= 4 ? 1 : 2
    if (dist <= threshold) best = Math.min(best, dist + 1)
  }
  return best
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "")
  return trimmed || "/"
}

export function suggestRoutes(pathname: string, search = ""): RouteSuggestion[] {
  const suggestions: RouteSuggestion[] = []
  const seen = new Set<string>()

  const add = (href: string, label: string, reason: string) => {
    if (seen.has(href)) return
    seen.add(href)
    suggestions.push({ href, label, reason })
  }

  const normalized = normalizePathname(pathname)
  const fullPath = `${pathname}${search}`
  const segments = normalized.split("/").filter(Boolean)
  const first = segments[0]?.toLowerCase() ?? ""

  const videoId =
    extractYouTubeVideoId(fullPath) ??
    (() => {
      try {
        const v = new URL(fullPath, "https://song.opsec.rent").searchParams.get("v")?.trim()
        return v && YOUTUBE_VIDEO_ID_RE.test(v) ? v : null
      } catch {
        return null
      }
    })()
  if (videoId) {
    add(`/play/${videoId}`, "Open player", "We spotted a YouTube video ID in that URL")
  }

  if (segments.length >= 2 && YOUTUBE_VIDEO_ID_RE.test(segments[1])) {
    add(`/play/${segments[1]}`, "Open player", "That path looks like a song link")
  }

  const playScore = bestAliasScore(first, PLAY_ALIASES)
  if (playScore <= 2 && first) {
    if (segments[1] && YOUTUBE_VIDEO_ID_RE.test(segments[1])) {
      add(`/play/${segments[1]}`, "Open player", "Did you mean the karaoke player?")
    } else {
      add("/", "Home", "Paste a YouTube link to start singing")
    }
  }

  if (first === "themes" || first === "theme" || bestAliasScore(first, ["theme", "themes"]) <= 1) {
    const second = segments[1]?.toLowerCase() ?? ""
    if (second && bestAliasScore(second, ["build", "builder", "custom", "create"]) <= 2) {
      add("/themes/build", "Theme builder", "You might be looking for the theme builder")
    }
    add("/themes", "Themes", "Browse karaoke stage themes")
  }

  for (const route of KNOWN_ROUTES) {
    const pathSegment = route.path === "/" ? "" : route.path.slice(1).split("/")[0]
    const score = bestAliasScore(first, [...route.aliases, pathSegment].filter(Boolean))
    if (score <= 2 && first && route.path !== normalized) {
      add(route.path, route.label, `Did you mean ${route.label.toLowerCase()}?`)
    }
  }

  if ((first === "watch" || normalized.startsWith("/watch")) && !videoId) {
    add("/", "Home", "Paste a YouTube link — we'll take it from there")
  }

  if (normalized === "/themes/build" || normalized === "/themes") {
    return suggestions.slice(0, 4)
  }

  if (suggestions.length === 0) {
    add("/", "Home", "Start fresh with a YouTube link")
    add("/themes", "Themes", "Customize your karaoke stage")
  }

  return suggestions.slice(0, 4)
}
