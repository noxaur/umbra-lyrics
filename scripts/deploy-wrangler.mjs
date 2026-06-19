#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import {
  classifyWranglerDeployOutput,
  routeOnlyFailureMessage,
} from "./deploy-wrangler-logic.mjs"

const configPath = process.argv[2] ?? "dist/song_kara/wrangler.json"
const result = spawnSync(
  "npx",
  ["wrangler", "deploy", "--config", configPath],
  { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] },
)

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)

const outcome = classifyWranglerDeployOutput(result.status ?? 1, output)

if (outcome === "success") {
  process.exit(0)
}

if (outcome === "route_only_failure") {
  console.warn(routeOnlyFailureMessage())
  process.exit(0)
}

process.exit(result.status ?? 1)
