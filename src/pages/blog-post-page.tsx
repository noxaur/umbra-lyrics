import { Link, useParams } from "react-router-dom"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { AppShell } from "@/components/app-shell"
import { getBlogPostBySlug } from "@/lib/site-content"
import type { BlogPostBlock } from "@/lib/content-types"
import { cn } from "@/lib/utils"

function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`)
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function BlogBlock({ block }: { block: BlogPostBlock }) {
  if (block.type === "paragraph") {
    return <p className="leading-relaxed text-pretty">{block.text}</p>
  }

  if (block.type === "heading") {
    const className = cn(
      "font-semibold tracking-tight text-balance",
      block.level === 2 ? "pt-5 text-2xl" : "pt-3 text-xl",
    )
    return block.level === 2 ? (
      <h2 className={className}>{block.text}</h2>
    ) : (
      <h3 className={className}>{block.text}</h3>
    )
  }

  if (block.type === "list") {
    const List = block.style === "ordered" ? "ol" : "ul"
    return (
      <List
        className={cn(
          "space-y-2 pl-6 leading-relaxed",
          block.style === "ordered" ? "list-decimal" : "list-disc",
        )}
      >
        {block.items.map((item) => (
          <li key={item} className="pl-1 text-pretty">
            {item}
          </li>
        ))}
      </List>
    )
  }

  return (
    <aside className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3">
      <p className="font-medium text-foreground">{block.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
        {block.text}
      </p>
    </aside>
  )
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
            <LottieIcon name="arrow-left" className="size-4" aria-hidden />
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
          <LottieIcon name="arrow-left" className="size-4" aria-hidden />
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
          {post.blocks.map((block, index) => (
            <BlogBlock key={`${block.type}-${index}`} block={block} />
          ))}
        </div>
      </article>
    </AppShell>
  )
}
