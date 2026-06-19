export type BlogPostBlock =
  | {
      type: "paragraph"
      text: string
    }
  | {
      type: "heading"
      level: 2 | 3
      text: string
    }
  | {
      type: "list"
      style: "ordered" | "unordered"
      items: string[]
    }
  | {
      type: "callout"
      title: string
      text: string
    }

export type BlogPost = {
  slug: string
  title: string
  summary: string
  author: string
  publishedAt: string
  tags: string[]
  blocks: BlogPostBlock[]
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
