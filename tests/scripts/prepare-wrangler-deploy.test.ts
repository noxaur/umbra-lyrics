import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
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
    delete process.env.RESULT_CACHE_NAMESPACE_ID
    delete process.env.RESULT_CACHE_PREVIEW_ID
  })

  function runPrepare(
    config: Record<string, unknown>,
    extraEnv: NodeJS.ProcessEnv = {},
    destinationDirectory?: string,
  ) {
    const configPath = path.join(tempDir, "wrangler.json")
    const destinationPath = destinationDirectory
      ? path.join(tempDir, destinationDirectory, "wrangler.json")
      : configPath
    fs.writeFileSync(configPath, JSON.stringify(config))
    const env = { ...process.env, ...extraEnv }
    delete env.STRIP_ZONE_ROUTES
    delete env.DEPLOY_CONTAINERS
    delete env.RESULT_CACHE_NAMESPACE_ID
    delete env.RESULT_CACHE_PREVIEW_ID
    Object.assign(env, extraEnv)
    execFileSync("node", [scriptPath, configPath, destinationPath], {
      cwd: process.cwd(),
      env,
      stdio: "pipe",
    })
    return JSON.parse(fs.readFileSync(destinationPath, "utf8")) as {
      routes?: Array<{ pattern: string }>
      containers?: unknown
      main?: string
      assets?: { directory?: string }
      kv_namespaces?: Array<{ binding: string; id: string; preview_id?: string }>
    }
  }

  it("keeps zone routes by default", () => {
    const result = runPrepare({
      name: "song-kara",
      routes: [{ pattern: "song.opsec.rent/*", zone_name: "opsec.rent" }],
      containers: [{ class_name: "RomajiContainer" }],
    })

    expect(result.routes).toEqual([
      { pattern: "song.opsec.rent/*", zone_name: "opsec.rent" },
    ])
    expect(result.containers).toBeUndefined()
  })

  it("strips routes only when STRIP_ZONE_ROUTES=true", () => {
    const result = runPrepare(
      {
        name: "song-kara",
        routes: [{ pattern: "song.opsec.rent/*", zone_name: "opsec.rent" }],
      },
      { STRIP_ZONE_ROUTES: "true" },
    )

    expect(result.routes).toBeUndefined()
  })

  it("rebases main and asset paths when writing a deploy copy", () => {
    const result = runPrepare(
      {
        name: "song-kara",
        main: "modules/backend/rust-gateway/build/worker/shim.mjs",
        assets: { directory: "dist/client" },
      },
      {},
      "dist/rust-worker",
    )

    expect(result.main).toBe("../../modules/backend/rust-gateway/build/worker/shim.mjs")
    expect(result.assets?.directory).toBe("../client")
  })

  it("strips placeholder KV bindings from deploy configs", () => {
    const result = runPrepare({
      name: "song-kara",
      kv_namespaces: [
        {
          binding: "RESULT_CACHE",
          id: "PRODUCTION_RESULT_CACHE_NAMESPACE_ID_PLACEHOLDER",
          preview_id: "PRODUCTION_RESULT_CACHE_PREVIEW_ID_PLACEHOLDER",
        },
      ],
    })

    expect(result.kv_namespaces).toBeUndefined()
  })

  it("drops placeholder preview_id when only production namespace ID is set", () => {
    const result = runPrepare(
      {
        name: "song-kara",
        kv_namespaces: [
          {
            binding: "RESULT_CACHE",
            id: "PRODUCTION_RESULT_CACHE_NAMESPACE_ID_PLACEHOLDER",
            preview_id: "PRODUCTION_RESULT_CACHE_PREVIEW_ID_PLACEHOLDER",
          },
        ],
      },
      {
        RESULT_CACHE_NAMESPACE_ID: "0123456789abcdef0123456789abcdef",
      },
    )

    expect(result.kv_namespaces).toEqual([
      {
        binding: "RESULT_CACHE",
        id: "0123456789abcdef0123456789abcdef",
      },
    ])
  })

  it("injects configured KV namespace IDs", () => {
    const result = runPrepare(
      {
        name: "song-kara",
        kv_namespaces: [
          {
            binding: "RESULT_CACHE",
            id: "PRODUCTION_RESULT_CACHE_NAMESPACE_ID_PLACEHOLDER",
            preview_id: "PRODUCTION_RESULT_CACHE_PREVIEW_ID_PLACEHOLDER",
          },
        ],
      },
      {
        RESULT_CACHE_NAMESPACE_ID: "0123456789abcdef0123456789abcdef",
        RESULT_CACHE_PREVIEW_ID: "fedcba9876543210fedcba9876543210",
      },
    )

    expect(result.kv_namespaces).toEqual([
      {
        binding: "RESULT_CACHE",
        id: "0123456789abcdef0123456789abcdef",
        preview_id: "fedcba9876543210fedcba9876543210",
      },
    ])
  })
})
