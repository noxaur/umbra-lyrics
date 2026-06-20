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

if (Array.isArray(config.kv_namespaces)) {
  const resultCache = config.kv_namespaces.find(
    (namespace) => namespace?.binding === "RESULT_CACHE",
  )
  if (resultCache) {
    const productionId = process.env.RESULT_CACHE_NAMESPACE_ID?.trim()
    const previewId = process.env.RESULT_CACHE_PREVIEW_ID?.trim()
    if (productionId) {
      resultCache.id = productionId
      if (previewId) resultCache.preview_id = previewId
    } else if (
      String(resultCache.id).includes("_PLACEHOLDER") ||
      String(resultCache.preview_id).includes("_PLACEHOLDER")
    ) {
      config.kv_namespaces = config.kv_namespaces.filter(
        (namespace) => namespace?.binding !== "RESULT_CACHE",
      )
      console.warn(
        "Prepared wrangler config without RESULT_CACHE; set RESULT_CACHE_NAMESPACE_ID to enable it",
      )
    }
  }
  if (config.kv_namespaces.length === 0) delete config.kv_namespaces
}

fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
fs.writeFileSync(destinationPath, JSON.stringify(config))

if (process.env.DEPLOY_CONTAINERS === "true") {
  console.log("Prepared wrangler config with containers")
} else if (process.env.STRIP_ZONE_ROUTES !== "true") {
  console.log("Prepared wrangler config for song.opsec.rent deploy")
}
