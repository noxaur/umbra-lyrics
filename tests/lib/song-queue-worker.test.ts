import { beforeEach, describe, expect, it } from "vitest"
import {
  clearQueueNotifications,
  listQueueNotifications,
} from "@/lib/queue-notifications"
import {
  clearAllQueuePendingMetadata,
  upsertQueuePendingMetadata,
} from "@/lib/queue-pending-metadata"
import { restoreQueuePendingMetadataNotifications } from "@/lib/song-queue-worker"

describe("song-queue-worker", () => {
  beforeEach(() => {
    clearAllQueuePendingMetadata()
    clearQueueNotifications()
  })

  it("restores metadata confirm toasts for pending localStorage entries", () => {
    upsertQueuePendingMetadata({
      videoId: "abc123",
      title: "Artist - Song",
      artist: "Artist",
      track: "Song",
    })

    restoreQueuePendingMetadataNotifications()

    const notifications = listQueueNotifications()
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      kind: "metadata",
      videoId: "abc123",
      title: "Confirm song details",
      message: "Artist · Song",
    })
  })

  it("does not duplicate metadata toasts on restore", () => {
    upsertQueuePendingMetadata({
      videoId: "abc123",
      title: "Artist - Song",
      artist: "Artist",
      track: "Song",
    })

    restoreQueuePendingMetadataNotifications()
    restoreQueuePendingMetadataNotifications()

    expect(listQueueNotifications()).toHaveLength(1)
  })
})
