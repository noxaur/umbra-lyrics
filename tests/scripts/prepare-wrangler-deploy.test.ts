import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const scriptPath = path.resolve("scripts/prepare-wrangler-deploy.mjs")

describe("prepare-wrangler-deploy.mjs", () => {
  let tempDir = ""

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-prepare-"))
  })

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
    delete process.env.STRIP_ZONE_ROUTES
    delete process.env.DEPLOY_CONTAINERS
  })

  function runPrepare(config: Record<string, unknown>) {
    const configPath = path.join(tempDir, "wrangler.json")
    fs.writeFileSync(configPath, JSON.stringify(config))
    execFileSync("node", [scriptPath, configPath], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: "pipe",
    })
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      routes?: Array<{ pattern: string }>
      containers?: unknown
    }
  }

  it("keeps zone routes by default", () => {
    const result = runPrepare({
      name: "umbra",
      routes: [{ pattern: "song.opsec.rent/*", zone_name: "opsec.rent" }],
      containers: [{ class_name: "RomajiContainer" }],
    })

    expect(result.routes).toEqual([
      { pattern: "song.opsec.rent/*", zone_name: "opsec.rent" },
    ])
    expect(result.containers).toBeUndefined()
  })

  it("strips routes only when STRIP_ZONE_ROUTES=true", () => {
    process.env.STRIP_ZONE_ROUTES = "true"

    const result = runPrepare({
      name: "umbra",
      routes: [{ pattern: "song.opsec.rent/*", zone_name: "opsec.rent" }],
    })

    expect(result.routes).toBeUndefined()
  })
})
