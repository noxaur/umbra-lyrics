export const QUEUE_SETTINGS_STORAGE_KEY = "umbra-queue-settings"

export type QueueSettings = {
  autoApproveMetadata: boolean
}

export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  autoApproveMetadata: false,
}

export function readQueueSettings(): QueueSettings {
  try {
    const raw = localStorage.getItem(QUEUE_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_QUEUE_SETTINGS
    const parsed = JSON.parse(raw) as Partial<QueueSettings>
    return {
      autoApproveMetadata:
        typeof parsed.autoApproveMetadata === "boolean"
          ? parsed.autoApproveMetadata
          : DEFAULT_QUEUE_SETTINGS.autoApproveMetadata,
    }
  } catch {
    return DEFAULT_QUEUE_SETTINGS
  }
}

export function persistQueueSettings(settings: QueueSettings): void {
  localStorage.setItem(QUEUE_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

export function setAutoApproveMetadata(enabled: boolean): QueueSettings {
  const settings = { ...readQueueSettings(), autoApproveMetadata: enabled }
  persistQueueSettings(settings)
  return settings
}
