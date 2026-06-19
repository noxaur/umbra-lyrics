import { useEffect, useState } from "react"
import type { IconName } from "@/components/icons/icon-names"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  dismissQueueNotification,
  listQueueNotifications,
  subscribeQueueNotifications,
  type QueueNotification,
} from "@/lib/queue-notifications"
import { getQueuePendingMetadata } from "@/lib/queue-pending-metadata"
import {
  confirmQueuePendingMetadata,
  dismissQueuePendingMetadata,
} from "@/lib/song-queue-worker"
import { cn } from "@/lib/utils"

function iconFor(kind: QueueNotification["kind"]): IconName {
  switch (kind) {
    case "success":
      return "check-circle-2"
    case "error":
      return "x-circle"
    default:
      return "info"
  }
}

function MetadataConfirmToast({
  notification,
  onDone,
}: {
  notification: QueueNotification
  onDone: () => void
}) {
  const pending = notification.videoId ? getQueuePendingMetadata(notification.videoId) : undefined
  const [artist, setArtist] = useState(pending?.artist ?? "")
  const [track, setTrack] = useState(pending?.track ?? "")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!pending) return
    setArtist(pending.artist)
    setTrack(pending.track)
  }, [pending])

  useEffect(() => {
    if (!pending) {
      dismissQueueNotification(notification.id)
      onDone()
    }
  }, [notification.id, onDone, pending])

  if (!notification.videoId || !pending) return null

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await confirmQueuePendingMetadata(notification.videoId!, artist, track)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const handleDismiss = () => {
    dismissQueuePendingMetadata(notification.videoId!)
    dismissQueueNotification(notification.id)
    onDone()
  }

  return (
    <div
      className="w-full max-w-sm rounded-lg border border-border bg-card p-3 shadow-lg"
      role="dialog"
      aria-labelledby={`queue-meta-${notification.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p id={`queue-meta-${notification.id}`} className="text-sm font-medium">
            Confirm song details
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{pending.title}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <LottieIcon name="x" className="size-3.5" aria-hidden />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist"
          aria-label="Artist"
          disabled={busy}
          className="h-8 text-xs"
        />
        <Input
          value={track}
          onChange={(e) => setTrack(e.target.value)}
          placeholder="Track title"
          aria-label="Track title"
          disabled={busy}
          required
          className="h-8 text-xs"
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleDismiss}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !track.trim()}
          onClick={() => void handleConfirm()}
        >
          {busy ? "Adding…" : "Add to queue"}
        </Button>
      </div>
    </div>
  )
}

function SimpleToast({
  notification,
  onDismiss,
}: {
  notification: QueueNotification
  onDismiss: () => void
}) {
  const iconName = iconFor(notification.kind)

  return (
    <div
      className={cn(
        "flex w-full max-w-sm items-start gap-2 rounded-lg border bg-card p-3 shadow-lg",
        notification.kind === "success" && "border-emerald-500/30",
        notification.kind === "error" && "border-destructive/30",
      )}
      role="status"
    >
      <LottieIcon
        name={iconName}
        className={cn(
          "mt-0.5 size-4 shrink-0",
          notification.kind === "success" && "text-emerald-600 dark:text-emerald-400",
          notification.kind === "error" && "text-destructive",
          notification.kind !== "success" && notification.kind !== "error" && "text-muted-foreground",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{notification.title}</p>
        {notification.message ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{notification.message}</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <LottieIcon name="x" className="size-3.5" aria-hidden />
      </Button>
    </div>
  )
}

export function QueueToastHost() {
  const [notifications, setNotifications] = useState<QueueNotification[]>(() =>
    listQueueNotifications(),
  )

  useEffect(() => subscribeQueueNotifications(() => setNotifications(listQueueNotifications())), [])

  useEffect(() => {
    const timers: number[] = []
    for (const notification of notifications) {
      if (notification.kind === "metadata" || !notification.dismissAfterMs) continue
      timers.push(
        window.setTimeout(() => dismissQueueNotification(notification.id), notification.dismissAfterMs),
      )
    }
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [notifications])

  if (notifications.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[70] flex max-h-[min(60dvh,24rem)] w-[min(100vw-1.5rem,24rem)] flex-col-reverse gap-2 overflow-y-auto"
      aria-live="polite"
      aria-relevant="additions"
    >
      {notifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto">
          {notification.kind === "metadata" ? (
            <MetadataConfirmToast
              notification={notification}
              onDone={() => setNotifications(listQueueNotifications())}
            />
          ) : (
            <SimpleToast
              notification={notification}
              onDismiss={() => dismissQueueNotification(notification.id)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
