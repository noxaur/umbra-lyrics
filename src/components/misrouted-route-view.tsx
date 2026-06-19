import { Link } from "react-router-dom"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { motion, useReducedMotion } from "motion/react"
import { AppShell } from "@/components/app-shell"
import { RouteSuggestionList } from "@/components/route-suggestion-list"
import { Button } from "@/components/ui/button"
import { formatRecentLabel, getRecentSongs } from "@/lib/recent-songs"
import type { RouteIssue } from "@/lib/route-suggestions"
import { cn } from "@/lib/utils"
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail"

const GHOST_LYRICS = [
  "Is this the real life?",
  "Caught in a landslide",
  "No escape from reality",
  "Open your eyes",
]

function GhostLyrics() {
  const reducedMotion = useReducedMotion()

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.07] dark:opacity-[0.12]"
      aria-hidden
    >
      {GHOST_LYRICS.map((line, index) => (
        <motion.p
          key={line}
          className="absolute whitespace-nowrap text-2xl font-semibold tracking-tight text-primary sm:text-4xl"
          style={{
            left: `${8 + index * 18}%`,
            top: `${12 + index * 18}%`,
          }}
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={
            reducedMotion
              ? undefined
              : {
                  opacity: [0.4, 0.9, 0.4],
                  y: [0, -10, 0],
                }
          }
          transition={
            reducedMotion
              ? undefined
              : {
                  duration: 7 + index,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: index * 0.6,
                }
          }
        >
          {line}
        </motion.p>
      ))}
    </div>
  )
}

type MisroutedRouteViewProps = {
  issue: RouteIssue
}

export function MisroutedRouteView({ issue }: MisroutedRouteViewProps) {
  const recent = getRecentSongs().slice(0, 3)
  const is404 = issue.kind === "not_found" && issue.title === "404"

  return (
    <AppShell>
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-16">
        <GhostLyrics />

        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,var(--color-primary)/0.18,transparent)]"
          aria-hidden
        />

        <div className="relative z-10 w-full max-w-xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-lg shadow-primary/10"
          >
            <LottieIcon name="mic-2" className="size-8" aria-hidden />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05, ease: "easeOut" }}
            className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground"
          >
            {is404 ? "Off the setlist" : "Wrong turn"}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
            className={cn(
              "mt-3 font-bold tracking-tight",
              is404
                ? "bg-gradient-to-br from-foreground via-primary to-foreground bg-clip-text text-5xl text-transparent sm:text-6xl"
                : "text-3xl text-foreground sm:text-4xl",
            )}
          >
            {issue.title}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15, ease: "easeOut" }}
            className="mt-4 text-lg text-muted-foreground"
          >
            {issue.message}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2, ease: "easeOut" }}
            className="mt-2 text-sm text-muted-foreground"
          >
            You tried{" "}
            <code className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-xs text-foreground">
              {issue.attempted}
            </code>
          </motion.p>

          {issue.suggestions.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.25, ease: "easeOut" }}
              className="mt-8 space-y-3 text-left"
            >
              <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-foreground">
                <LottieIcon name="sparkles" className="size-4 text-primary" aria-hidden />
                Maybe you meant
              </p>
              <RouteSuggestionList suggestions={issue.suggestions} />
            </motion.div>
          ) : null}

          {recent.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.3, ease: "easeOut" }}
              className="mt-8 text-left"
            >
              <p className="mb-2 text-center text-sm font-medium text-muted-foreground">
                Or pick up where you left off
              </p>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card/30">
                {recent.map((song) => {
                  const label = formatRecentLabel(song)
                  return (
                    <li key={song.videoId}>
                      <Link
                        to={`/play/${song.videoId}`}
                        state={{ fromHome: true }}
                        title={label}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <img
                          src={youtubeThumbnailUrl(song.videoId)}
                          alt=""
                          width={68}
                          height={38}
                          loading="lazy"
                          decoding="async"
                          className="h-[2.375rem] w-[4.25rem] shrink-0 rounded-md border border-border/60 bg-muted object-cover"
                        />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </motion.div>
          ) : null}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.35, ease: "easeOut" }}
            className={cn("mt-8 flex justify-center", recent.length > 0 && "mt-6")}
          >
            <Button asChild className="gap-2">
              <Link to="/">
                <LottieIcon name="home" className="size-4" aria-hidden />
                Back to home
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>
    </AppShell>
  )
}
