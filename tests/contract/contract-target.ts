import legacyWorker from "../../worker"

export interface ContractTarget {
  name: string
  request(request: Request): Promise<Response>
}

type LegacyEnvironment = Parameters<typeof legacyWorker.fetch>[1]

export function createLegacyContractTarget(
  environment: Partial<LegacyEnvironment> = {},
): ContractTarget {
  const assets = environment.ASSETS ?? {
    fetch: async () =>
      new Response("asset fallback", {
        headers: { "Content-Type": "text/html" },
      }),
  }

  return {
    name: "legacy-typescript-worker",
    request: (request) =>
      legacyWorker.fetch(request, {
        ...environment,
        ASSETS: assets,
      }),
  }
}

export function createHttpContractTarget(baseUrl: string): ContractTarget {
  const base = new URL(baseUrl)

  return {
    name: `http:${base.origin}`,
    request: (request) => {
      const source = new URL(request.url)
      const target = new URL(`${source.pathname}${source.search}`, base)
      return fetch(
        new Request(target, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          redirect: request.redirect,
          // Required when forwarding a Request body in Node's fetch implementation.
          duplex: request.body ? "half" : undefined,
        } as RequestInit),
      )
    },
  }
}
