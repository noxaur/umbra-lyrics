import { describe, expect, it } from "vitest"
import {
  classifyWranglerDeployOutput,
  routeOnlyFailureMessage,
} from "../../scripts/deploy-wrangler-logic.mjs"

const routeFailureLog = `
Uploaded song-kara (3.69 sec)
Deployed song-kara triggers (1.09 sec)
  https://song-kara.nox-heights.workers.dev

✘ [ERROR] Some triggers failed to deploy for song-kara:
    - A request to the Cloudflare API (/zones/.../workers/routes) failed.
`

describe("classifyWranglerDeployOutput", () => {
  it("treats a clean deploy as success", () => {
    expect(classifyWranglerDeployOutput(0, "Uploaded song-kara\nDeployed song-kara triggers")).toBe(
      "success",
    )
  })

  it("tolerates route-only failures after the worker uploads", () => {
    expect(classifyWranglerDeployOutput(1, routeFailureLog)).toBe("route_only_failure")
  })

  it("fails when the worker never uploaded", () => {
    expect(
      classifyWranglerDeployOutput(1, "✘ [ERROR] Some triggers failed to deploy for song-kara:"),
    ).toBe("failure")
  })

  it("fails on unrelated wrangler errors", () => {
    expect(classifyWranglerDeployOutput(1, "✘ [ERROR] Authentication error")).toBe("failure")
  })

  it("documents the route-only failure warning", () => {
    expect(routeOnlyFailureMessage()).toContain("song.opsec.rent")
    expect(routeOnlyFailureMessage()).toContain("::warning::")
  })
})
