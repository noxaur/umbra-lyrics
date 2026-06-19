#!/usr/bin/env node
/**
 * Copies cohesive UseAnimations Lottie JSON (Feather-inspired, MIT) into src/assets/lottie/.
 * UseAnimations icons are published on LottieFiles by Patrick Svoboda.
 */
import { access, cp, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { execSync } from "node:child_process"
import { tmpdir } from "node:os"
import { USEANIM_MAP } from "./icon-useanim-map.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, "../src/assets/lottie")
const TGZ = join(tmpdir(), "react-useanimations-2.10.0.tgz")

async function ensurePackageTgz() {
  try {
    await access(TGZ)
  } catch {
    execSync(`npm pack react-useanimations@2.10.0 --pack-destination ${tmpdir()}`, {
      stdio: "inherit",
    })
  }
}

await ensurePackageTgz()

await mkdir(OUT_DIR, { recursive: true })
const extractDir = join(tmpdir(), "useanim-extract")
execSync(`rm -rf ${extractDir} && mkdir -p ${extractDir} && tar -xzf ${TGZ} -C ${extractDir}`)

for (const [iconName, libName] of Object.entries(USEANIM_MAP)) {
  const src = join(extractDir, "package/lib", libName, `${libName}.json`)
  const dest = join(OUT_DIR, `${iconName}.json`)
  await cp(src, dest)
  console.log(`Copied ${iconName} <- ${libName}`)
}
