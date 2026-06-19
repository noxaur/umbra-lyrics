import { describe, expect, it, vi, afterEach } from "vitest"
import { signalWithTimeout, isAbortError } from "@/lib/abort-signal"

describe("signalWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("aborts when the timeout elapses", async () => {
    vi.useFakeTimers()
    const { signal, cleanup } = signalWithTimeout(1_000)

    const abortPromise = new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true })
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await abortPromise
    expect(signal.aborted).toBe(true)
    cleanup()
  })

  it("aborts when the parent signal aborts", () => {
    const parent = new AbortController()
    const { signal, cleanup } = signalWithTimeout(5_000, parent.signal)

    parent.abort()
    expect(signal.aborted).toBe(true)
    cleanup()
  })
})

describe("isAbortError", () => {
  it("detects DOMException abort errors", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true)
    expect(isAbortError(new Error("nope"))).toBe(false)
  })
})
