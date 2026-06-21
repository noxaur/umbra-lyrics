import blogData from "@/content/blog.json"
import changelogData from "@/content/changelog.json"
import siteAlertsData from "@/content/site-alerts.json"
import type {
  BlogContent,
  BlogPost,
  ChangelogContent,
  ChangelogEntry,
  SiteAlert,
  SiteAlertsContent,
} from "@/lib/content-types"
import { isSiteAlertDismissed } from "@/lib/site-alert-dismiss"

const blogContent = blogData as BlogContent
const changelogContent = changelogData as ChangelogContent
const siteAlertsContent = siteAlertsData as SiteAlertsContent

function sortByDateDesc<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date))
}

function sortBlogPosts(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export function getBlogPosts(): BlogPost[] {
  return sortBlogPosts(blogContent.posts)
}

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return blogContent.posts.find((post) => post.slug === slug)
}

export function getChangelogEntries(): ChangelogEntry[] {
  return sortByDateDesc(changelogContent.entries)
}

export function getSiteAlerts(): SiteAlert[] {
  return siteAlertsContent.alerts
}

export function getActiveSiteAlerts(): SiteAlert[] {
  return getSiteAlerts().filter((alert) => !isSiteAlertDismissed(alert.id))
}
