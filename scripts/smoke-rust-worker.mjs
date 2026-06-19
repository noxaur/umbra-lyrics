#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process"

const port = Number.parseInt(process.env.RUST_WORKER_PORT ?? "8787", 10)
const baseUrl = `http://127.0.0.1:${port}`

async function waitForWorker(child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev exited with status ${child.exitCode}`)
    }
    try {
      const response = await fetch(baseUrl)
      await response.body?.cancel()
      return
    } catch {
      // Wrangler is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Rust Worker did not become ready at ${baseUrl}`)
}

function runContracts(extraEnv = {}, testPaths = ["tests/contract"]) {
  const result = spawnSync("npm", ["test", "--", ...testPaths], {
    stdio: "inherit",
    env: {
      ...process.env,
      CONTRACT_BASE_URL: baseUrl,
      ...extraEnv,
    },
  })
  if (result.status !== 0) {
    throw new Error(`contract tests exited with status ${result.status ?? 1}`)
  }
}

async function withWorkers(configs, callback) {
  const args = ["wrangler", "dev"]
  for (const config of configs) args.push("--config", config)
  args.push(
    "--port",
    String(port),
    "--log-level",
    "error",
    "--show-interactive-dev-session=false",
  )

  const child = spawn("npx", args, { stdio: "inherit" })
  try {
    await waitForWorker(child)
    callback()
  } finally {
    child.kill("SIGTERM")
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve()
      else child.once("exit", resolve)
    })
  }
}

await withWorkers(
  ["wrangler.rust.local.jsonc", "dist/song_kara_legacy/wrangler.json"],
  () => runContracts(),
)

await withWorkers(
  ["wrangler.rust.local.jsonc", "tests/fixtures/rust-worker/wrangler.jsonc"],
  () =>
    runContracts(
      { RUST_GATEWAY_FIXTURE: "1" },
      ["tests/contract/rust-gateway-contract.test.ts"],
    ),
)

await withWorkers(
  [
    "tests/fixtures/rust-worker/no-assets.wrangler.jsonc",
    "tests/fixtures/rust-worker/wrangler.jsonc",
  ],
  () =>
    runContracts(
      { RUST_GATEWAY_NO_ASSETS: "1" },
      ["tests/contract/rust-gateway-contract.test.ts"],
    ),
)
