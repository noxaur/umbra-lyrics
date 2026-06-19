const DISMISS_PREFIX = "umbra:site-alert-dismissed:"

export function siteAlertDismissKey(id: string): string {
  return `${DISMISS_PREFIX}${id}`
}

export function isSiteAlertDismissed(id: string): boolean {
  try {
    return localStorage.getItem(siteAlertDismissKey(id)) === "1"
  } catch {
    return false
  }
}

export function dismissSiteAlert(id: string): void {
  try {
    localStorage.setItem(siteAlertDismissKey(id), "1")
  } catch {
    // ignore quota / private mode
  }
}
