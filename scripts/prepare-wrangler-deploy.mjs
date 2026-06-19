#!/usr/bin/env node
import fs from "node:fs"

const path = process.argv[2] ?? "dist/song_kara/wrangler.json"
const config = JSON.parse(fs.readFileSync(path, "utf8"))
delete config.routes
if (process.env.DEPLOY_CONTAINERS !== "true") {
  delete config.containers
  delete config.durable_objects
  delete config.migrations
}
fs.writeFileSync(path, JSON.stringify(config))
console.log(
  process.env.DEPLOY_CONTAINERS === "true"
    ? "Prepared wrangler config with containers"
    : "Prepared wrangler config without containers",
)
