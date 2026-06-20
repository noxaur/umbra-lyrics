export type LyricsResolverMode = "rust" | "browser"

const BROWSER_RESOLVER_VALUES = new Set(["browser", "legacy"])
const RUST_RESOLVER_VALUES = new Set(["rust"])
const BROWSER_ENV_VALUES = new Set(["0", "false", "off", "browser", "legacy"])
const RUST_ENV_VALUES = new Set(["1", "true", "on", "rust"])

export function getLyricsResolverMode(
  searchParams: Pick<URLSearchParams, "get">,
  envResolverFlag: string | undefined = import.meta.env.VITE_RUST_LYRICS_RESOLVER,
): LyricsResolverMode {
  const requested = searchParams.get("lyricsResolver")?.trim().toLowerCase()
  if (requested && BROWSER_RESOLVER_VALUES.has(requested)) return "browser"
  if (requested && RUST_RESOLVER_VALUES.has(requested)) return "rust"

  if (typeof envResolverFlag === "string" && envResolverFlag.trim()) {
    const normalized = envResolverFlag.trim().toLowerCase()
    if (BROWSER_ENV_VALUES.has(normalized)) return "browser"
    if (RUST_ENV_VALUES.has(normalized)) return "rust"
  }

  return "rust"
}
