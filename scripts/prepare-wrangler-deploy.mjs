#!/usr/bin/env node
import fs from "node:fs"

const path = process.argv[2] ?? "dist/umbra/wrangler.json"
const config = JSON.parse(fs.readFileSync(path, "utf8"))

// Only strip when explicitly requested (legacy CI tokens without zone access).
if (process.env.STRIP_ZONE_ROUTES === "true") {
  delete config.routes
  console.warn("Prepared wrangler config without zone routes (STRIP_ZONE_ROUTES=true)")
} else if (config.routes?.length) {
  console.log(
    `Prepared wrangler config with routes: ${config.routes.map((route) => route.pattern).join(", ")}`,
  )
}

if (process.env.DEPLOY_CONTAINERS !== "true") {
  delete config.containers
  delete config.durable_objects
}

fs.writeFileSync(path, JSON.stringify(config))

if (process.env.DEPLOY_CONTAINERS === "true") {
  console.log("Prepared wrangler config with containers")
} else if (process.env.STRIP_ZONE_ROUTES !== "true") {
  console.log("Prepared wrangler config for song.opsec.rent deploy")
}
