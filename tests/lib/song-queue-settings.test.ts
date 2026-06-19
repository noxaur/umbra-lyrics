import { beforeEach, describe, expect, it } from "vitest"
import {
  DEFAULT_QUEUE_SETTINGS,
  readQueueSettings,
  setAutoApproveMetadata,
  QUEUE_SETTINGS_STORAGE_KEY,
} from "@/lib/song-queue-settings"

describe("song-queue-settings", () => {
  beforeEach(() => {
    localStorage.removeItem(QUEUE_SETTINGS_STORAGE_KEY)
  })

  it("returns defaults when unset", () => {
    expect(readQueueSettings()).toEqual(DEFAULT_QUEUE_SETTINGS)
  })

  it("persists auto approve metadata", () => {
    setAutoApproveMetadata(true)
    expect(readQueueSettings().autoApproveMetadata).toBe(true)
  })
})
