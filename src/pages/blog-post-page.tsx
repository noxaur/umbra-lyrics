import { Link, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { getBlogPostBySlug } from "@/lib/site-content"
import { cn } from "@/lib/utils"

function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`)
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const post = slug ? getBlogPostBySlug(slug) : undefined

  if (!post) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <h1 className="text-2xl font-bold">Post not found</h1>
          <p className="mt-2 text-muted-foreground">
            That blog post doesn&apos;t exist or was removed.
          </p>
          <Link
            to="/blog"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to blog
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-8">
        <Link
          to="/blog"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to blog
        </Link>

        <header className="mb-8 border-b border-border pb-6">
          <h1 className="text-3xl font-bold tracking-tight text-balance">{post.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            <span>{post.author}</span>
            <span aria-hidden> · </span>
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          </p>
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
        </header>

        <div className="space-y-4 text-foreground">
          {post.paragraphs.map((paragraph, index) => (
            <p key={index} className="leading-relaxed text-pretty">
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </AppShell>
  )
}
