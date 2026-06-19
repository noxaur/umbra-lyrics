export class SearchTimeoutError extends Error {
  constructor(message = "Search timed out") {
    super(message)
    this.name = "SearchTimeoutError"
  }
}

export async function withPromiseTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = "Search timed out",
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new SearchTimeoutError(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}
