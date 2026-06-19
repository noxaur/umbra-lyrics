import { Link } from "react-router-dom"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { AppShell } from "@/components/app-shell"
import { getBlogPosts } from "@/lib/site-content"
import { cn } from "@/lib/utils"

function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`)
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function BlogPage() {
  const posts = getBlogPosts()

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <LottieIcon name="arrow-left" className="size-4" aria-hidden />
          Back home
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-balance">Blog</h1>
          <p className="mt-2 text-muted-foreground">
            Updates, notes, and behind-the-scenes from the umbra team.
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <p className="font-medium">No posts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Check back soon.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {posts.map((post) => (
              <li key={post.slug}>
                <article className="rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted/30">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold">
                      <Link
                        to={`/blog/${post.slug}`}
                        className="text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      >
                        {post.title}
                      </Link>
                    </h2>
                    <time dateTime={post.publishedAt} className="text-sm text-muted-foreground">
                      {formatDate(post.publishedAt)}
                    </time>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{post.summary}</p>
                  {post.tags.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <li
                          key={tag}
                          className={cn(
                            "rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
                          )}
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  )
}
