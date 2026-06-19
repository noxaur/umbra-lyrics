import { useState } from "react"
import type { IconName } from "@/components/icons/icon-names"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import type { SiteAlert, SiteAlertSeverity } from "@/lib/content-types"
import { dismissSiteAlert } from "@/lib/site-alert-dismiss"
import { getActiveSiteAlerts } from "@/lib/site-content"
import { cn } from "@/lib/utils"

const SEVERITY_STYLES: Record<
  SiteAlertSeverity,
  { container: string; text: string; icon: IconName }
> = {
  info: {
    container: "border-sky-500/40 bg-sky-50/95 dark:bg-sky-950/90",
    text: "text-sky-950 dark:text-sky-50",
    icon: "info",
  },
  warning: {
    container: "border-amber-500/40 bg-amber-50/95 dark:bg-amber-950/90",
    text: "text-amber-950 dark:text-amber-50",
    icon: "alert-triangle",
  },
  alert: {
    container: "border-red-500/40 bg-red-50/95 dark:bg-red-950/90",
    text: "text-red-950 dark:text-red-50",
    icon: "octagon-alert",
  },
}

type SiteAlertBannerProps = {
  alert?: SiteAlert
}

export function SiteAlertBanner({ alert: alertProp }: SiteAlertBannerProps = {}) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set())

  const activeAlerts = alertProp
    ? [alertProp].filter((entry) => !dismissedIds.has(entry.id))
    : getActiveSiteAlerts().filter((entry) => !dismissedIds.has(entry.id))

  const alert = activeAlerts[0]
  if (!alert) return null

  const styles = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info
  const iconName = styles.icon
  const isAssertive = alert.severity === "warning" || alert.severity === "alert"

  const handleDismiss = () => {
    if (alert.dismissible) {
      dismissSiteAlert(alert.id)
      setDismissedIds((prev) => new Set(prev).add(alert.id))
    }
  }

  return (
    <div
      className={cn("shrink-0 border-b px-3 py-2.5 sm:px-4", styles.container)}
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
    >
      <div className="mx-auto flex w-full max-w-6xl items-start gap-3">
        <LottieIcon name={iconName} className={cn("mt-0.5 size-4 shrink-0", styles.text)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", styles.text)}>{alert.title}</p>
          <p className={cn("mt-0.5 text-sm opacity-90", styles.text)}>{alert.message}</p>
          {alert.link ? (
            <Link
              to={alert.link.href}
              className={cn(
                "mt-1 inline-block text-sm font-medium underline underline-offset-2",
                styles.text,
              )}
            >
              {alert.link.label}
            </Link>
          ) : null}
        </div>
        {alert.dismissible ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-8 shrink-0", styles.text)}
            onClick={handleDismiss}
            aria-label="Dismiss announcement"
          >
            <LottieIcon name="x" className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
