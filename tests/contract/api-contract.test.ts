import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { handleApiRequest } from "../../worker/router"
import routerSource from "../../worker/router.ts?raw"
import routes from "../fixtures/contracts/api-routes.json"
import validationErrors from "../fixtures/contracts/api-responses/validation-errors.json"
import {
  createHttpContractTarget,
  createLegacyContractTarget,
} from "./contract-target"

type RouteFixture = (typeof routes)[number]
const contractBaseUrl = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env?.CONTRACT_BASE_URL
const contractTarget = contractBaseUrl
  ? createHttpContractTarget(contractBaseUrl)
  : createLegacyContractTarget()

function routerLiteral(path: string): string {
  return path.replace(/:[^/]+.*$/, "").replace(/\*$/, "")
}

function smokeRequest(route: RouteFixture): Request {
  const body = route.method === "POST" ? "{" : undefined
  return new Request(`https://song.example${route.smokePath}`, {
    method: route.method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("frozen API route inventory", () => {
  it("matches every API route literal in the legacy router", () => {
    const routerPaths = [
      ...new Set(
        [...routerSource.matchAll(/["'`](\/api\/[A-Za-z0-9_/*:.-]+)/g)].map(
          (match) => match[1],
        ),
      ),
    ].sort((a, b) => a.localeCompare(b))
    const inventoryPaths = routes
      .map((route) => routerLiteral(route.path))
      .sort((a, b) => a.localeCompare(b))

    expect(routes).toHaveLength(36)
    expect(inventoryPaths).toEqual(routerPaths)
    expect(new Set(routes.map((route) => route.id)).size).toBe(routes.length)
  })

  for (const route of routes) {
    it(`${contractTarget.name} recognizes ${route.method} ${route.path}`, async () => {
      if (contractTarget.name === "legacy-typescript-worker") {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("contract upstream offline")))
      }
      const response = await contractTarget.request(smokeRequest(route))

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    })
  }
})

describe("stable validation contracts", () => {
  it("freezes representative error bodies", async () => {
    const cases = [
      {
        request: new Request("https://song.example/api/lyrics/lrc"),
        expected: validationErrors["missing-track"],
      },
      {
        request: new Request("https://song.example/api/youtube/oembed"),
        expected: validationErrors["missing-video-id"],
      },
      {
        request: new Request("https://song.example/api/romaji", {
          method: "POST",
          body: "{",
        }),
        expected: validationErrors["invalid-json"],
      },
      {
        request: new Request("https://song.example/api/auth/spotify/config"),
        expected: validationErrors["spotify-unconfigured"],
      },
    ]

    for (const contractCase of cases) {
      const response = await contractTarget.request(contractCase.request)
      expect(response.status).toBe(contractCase.expected.status)
      await expect(response.json()).resolves.toEqual(contractCase.expected.body)
    }
  })

  it("keeps global OPTIONS independent of route recognition", async () => {
    const response = await contractTarget.request(
      new Request("https://song.example/api/not-a-route", { method: "OPTIONS" }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS")
  })

  it("returns null for an unknown API path", async () => {
    await expect(
      handleApiRequest(new Request("https://song.example/api/not-a-route")),
    ).resolves.toBeNull()
  })
})
