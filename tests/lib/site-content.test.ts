import { beforeEach, describe, expect, it } from "vitest"
import {
  dismissSiteAlert,
  isSiteAlertDismissed,
  siteAlertDismissKey,
} from "@/lib/site-alert-dismiss"
import {
  getActiveSiteAlerts,
  getBlogPostBySlug,
  getBlogPosts,
  getChangelogEntries,
} from "@/lib/site-content"

describe("site-content", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("returns blog posts sorted by publishedAt descending", () => {
    const posts = getBlogPosts()
    expect(posts.length).toBeGreaterThan(0)
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i - 1].publishedAt.localeCompare(posts[i].publishedAt)).toBeGreaterThanOrEqual(0)
    }
  })

  it("finds a blog post by slug", () => {
    const post = getBlogPostBySlug("rust-rewrite")
    expect(post).toMatchObject({
      slug: "rust-rewrite",
      title: "Why we are rebuilding umbra around a Rust backend",
    })
    expect(post?.blocks.some((block) => block.type === "heading")).toBe(true)
    expect(post?.blocks.some((block) => block.type === "list")).toBe(true)
    expect(post?.blocks.some((block) => block.type === "callout")).toBe(true)
  })

  it("returns undefined for unknown blog slug", () => {
    expect(getBlogPostBySlug("does-not-exist")).toBeUndefined()
  })

  it("returns changelog entries sorted by date descending", () => {
    const entries = getChangelogEntries()
    expect(entries.length).toBeGreaterThan(0)
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].date.localeCompare(entries[i].date)).toBeGreaterThanOrEqual(0)
    }
  })

  it("filters dismissed site alerts", () => {
    const alerts = getActiveSiteAlerts()
    expect(alerts.length).toBeGreaterThan(0)

    dismissSiteAlert(alerts[0].id)
    const afterDismiss = getActiveSiteAlerts()
    expect(afterDismiss.some((alert) => alert.id === alerts[0].id)).toBe(false)
  })
})

describe("site-alert-dismiss", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("tracks dismiss state in localStorage", () => {
    const id = "test-alert"
    expect(isSiteAlertDismissed(id)).toBe(false)
    dismissSiteAlert(id)
    expect(localStorage.getItem(siteAlertDismissKey(id))).toBe("1")
    expect(isSiteAlertDismissed(id)).toBe(true)
  })
})
