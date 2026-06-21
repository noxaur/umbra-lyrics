export type QueueNotificationKind = "info" | "success" | "error" | "metadata"

export type QueueNotification = {
  id: string
  kind: QueueNotificationKind
  title: string
  message?: string
  videoId?: string
  createdAt: number
  dismissAfterMs?: number
}

type NotificationListener = () => void
const listeners = new Set<NotificationListener>()
const active: QueueNotification[] = []

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribeQueueNotifications(listener: NotificationListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function listQueueNotifications(): QueueNotification[] {
  return [...active]
}

function createId(): string {
  return `queue-notif-${crypto.randomUUID()}`
}

export function pushQueueNotification(
  input: Omit<QueueNotification, "id" | "createdAt"> & { id?: string },
): QueueNotification {
  const notification: QueueNotification = {
    id: input.id ?? createId(),
    kind: input.kind,
    title: input.title,
    message: input.message,
    videoId: input.videoId,
    createdAt: Date.now(),
    dismissAfterMs: input.dismissAfterMs ?? (input.kind === "metadata" ? undefined : 4000),
  }
  active.unshift(notification)
  if (active.length > 6) active.length = 6
  notify()
  return notification
}

export function dismissQueueNotification(id: string): void {
  const index = active.findIndex((n) => n.id === id)
  if (index === -1) return
  active.splice(index, 1)
  notify()
}

export function dismissQueueNotificationsForVideo(videoId: string): void {
  for (let i = active.length - 1; i >= 0; i -= 1) {
    if (active[i].videoId === videoId) active.splice(i, 1)
  }
  notify()
}

export function clearQueueNotifications(): void {
  active.length = 0
  notify()
}
