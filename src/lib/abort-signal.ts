/** Merge an optional caller signal with a timeout into one abort signal. */
export function signalWithTimeout(
  timeoutMs: number,
  parent?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  const abortFromParent = () => {
    window.clearTimeout(timeoutId)
    controller.abort()
  }

  if (parent?.aborted) {
    abortFromParent()
  } else {
    parent?.addEventListener("abort", abortFromParent, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeoutId)
      parent?.removeEventListener("abort", abortFromParent)
    },
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError"
}
