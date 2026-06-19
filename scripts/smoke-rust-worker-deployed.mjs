#!/usr/bin/env node
import { spawnSync } from "node:child_process"

if (!process.env.CONTRACT_BASE_URL) {
  console.error("CONTRACT_BASE_URL must point to a deployed Rust Worker")
  process.exit(2)
}

const result = spawnSync("npm", ["test", "--", "tests/contract"], {
  stdio: "inherit",
  env: process.env,
})
process.exit(result.status ?? 1)
