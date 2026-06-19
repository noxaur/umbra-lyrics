/**
 * Wrangler exits non-zero when custom-domain route attachment fails even if the
 * worker script uploaded successfully. CI should stay green in that case while
 * surfacing a warning so the token can be fixed.
 */
export function classifyWranglerDeployOutput(status, output) {
  if (status === 0) return "success"

  const workerUploaded = /Uploaded song-kara\b/.test(output)
  const routeTriggerFailed = /Some triggers failed to deploy/.test(output)

  if (workerUploaded && routeTriggerFailed) return "route_only_failure"
  return "failure"
}

export function routeOnlyFailureMessage() {
  const body =
    "Worker deployed to workers.dev but song.opsec.rent route attachment failed. " +
    "Grant CLOUDFLARE_API_TOKEN Workers Routes:Edit and Zone:Read on opsec.rent, " +
    "or run STRIP_ZONE_ROUTES=true npm run deploy until the token is updated."

  if (process.env.GITHUB_ACTIONS === "true") {
    return `::warning::${body}`
  }

  return `Warning: ${body}`
}
