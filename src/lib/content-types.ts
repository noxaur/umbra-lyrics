export type BlogPost = {
  slug: string
  title: string
  summary: string
  author: string
  publishedAt: string
  tags: string[]
  paragraphs: string[]
}

export type BlogContent = {
  posts: BlogPost[]
}

export type ChangelogChangeType = "feature" | "fix" | "improvement" | "breaking"

export type ChangelogChange = {
  type: ChangelogChangeType
  text: string
}

export type ChangelogEntry = {
  version: string
  date: string
  title: string
  changes: ChangelogChange[]
}

export type ChangelogContent = {
  entries: ChangelogEntry[]
}

export type SiteAlertSeverity = "info" | "warning" | "alert"

export type SiteAlertLink = {
  href: string
  label: string
}

export type SiteAlert = {
  id: string
  severity: SiteAlertSeverity
  title: string
  message: string
  dismissible: boolean
  link?: SiteAlertLink
}

export type SiteAlertsContent = {
  alerts: SiteAlert[]
}
