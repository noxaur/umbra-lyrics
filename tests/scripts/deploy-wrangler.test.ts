import { describe, expect, it } from "vitest"
import {
  classifyWranglerDeployOutput,
  routeOnlyFailureMessage,
} from "../../scripts/deploy-wrangler-logic.mjs"

const routeFailureLog = `
Uploaded umbra (3.69 sec)
Deployed umbra triggers (1.09 sec)
  https://umbra.nox-heights.workers.dev

✘ [ERROR] Some triggers failed to deploy for umbra:
    - A request to the Cloudflare API (/zones/.../workers/routes) failed.
`

describe("classifyWranglerDeployOutput", () => {
  it("treats a clean deploy as success", () => {
    expect(classifyWranglerDeployOutput(0, "Uploaded umbra\nDeployed umbra triggers")).toBe(
      "success",
    )
  })

  it("tolerates route-only failures after the worker uploads", () => {
    expect(classifyWranglerDeployOutput(1, routeFailureLog)).toBe("route_only_failure")
  })

  it("fails when the worker never uploaded", () => {
    expect(
      classifyWranglerDeployOutput(1, "✘ [ERROR] Some triggers failed to deploy for umbra:"),
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
