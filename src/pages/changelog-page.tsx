import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import type { ChangelogChangeType } from "@/lib/content-types"
import { getChangelogEntries } from "@/lib/site-content"
import { cn } from "@/lib/utils"

const CHANGE_TYPE_LABELS: Record<ChangelogChangeType, string> = {
  feature: "Feature",
  fix: "Fix",
  improvement: "Improvement",
  breaking: "Breaking",
}

const CHANGE_TYPE_STYLES: Record<ChangelogChangeType, string> = {
  feature: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  fix: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  improvement: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  breaking: "bg-red-500/15 text-red-700 dark:text-red-300",
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`)
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function ChangelogPage() {
  const entries = getChangelogEntries()

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back home
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-balance">Changelog</h1>
          <p className="mt-2 text-muted-foreground">
            What&apos;s new in umbra — features, fixes, and improvements.
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <p className="font-medium">No releases yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Check back soon.</p>
          </div>
        ) : (
          <ol className="space-y-8">
            {entries.map((entry) => (
              <li key={`${entry.version}-${entry.date}`}>
                <article className="rounded-lg border border-border bg-card p-5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
                      v{entry.version}
                    </span>
                    <time dateTime={entry.date} className="text-sm text-muted-foreground">
                      {formatDate(entry.date)}
                    </time>
                  </div>
                  <h2 className="mt-2 text-lg font-semibold">{entry.title}</h2>
                  <ul className="mt-4 space-y-2">
                    {entry.changes.map((change, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                            CHANGE_TYPE_STYLES[change.type],
                          )}
                        >
                          {CHANGE_TYPE_LABELS[change.type]}
                        </span>
                        <span className="text-foreground">{change.text}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>
    </AppShell>
  )
}
