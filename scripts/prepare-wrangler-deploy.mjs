#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const sourcePath = process.argv[2] ?? "dist/song_kara_legacy/wrangler.json"
const destinationPath = process.argv[3] ?? sourcePath
const config = JSON.parse(fs.readFileSync(sourcePath, "utf8"))

function relativeToDestination(value) {
  const absolute = path.resolve(path.dirname(sourcePath), value)
  const relative = path
    .relative(path.dirname(destinationPath), absolute)
    .split(path.sep)
    .join("/")
  return relative.startsWith(".") ? relative : `./${relative}`
}

if (path.resolve(sourcePath) !== path.resolve(destinationPath)) {
  if (typeof config.main === "string") {
    config.main = relativeToDestination(config.main)
  }
  if (typeof config.assets?.directory === "string") {
    config.assets.directory = relativeToDestination(config.assets.directory)
  }
}

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

fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
fs.writeFileSync(destinationPath, JSON.stringify(config))

if (process.env.DEPLOY_CONTAINERS === "true") {
  console.log("Prepared wrangler config with containers")
} else if (process.env.STRIP_ZONE_ROUTES !== "true") {
  console.log("Prepared wrangler config for song.opsec.rent deploy")
}
