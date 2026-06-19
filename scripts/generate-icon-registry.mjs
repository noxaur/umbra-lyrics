#!/usr/bin/env node
import { writeFile, readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { USEANIM_MAP, USEANIM_SOURCE } from "./icon-useanim-map.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, "../src/components/icons/icon-registry.ts")

const names = (await readFile(join(__dirname, "../src/components/icons/icon-names.ts"), "utf8"))
  .match(/"([a-z0-9-]+)"/g)
  ?.map((s) => s.slice(1, -1)) ?? []

const missing = names.filter((name) => !(name in USEANIM_MAP))
if (missing.length > 0) {
  throw new Error(`Missing USEANIM_MAP entries for: ${missing.join(", ")}`)
}

const imports = names.map((n) => `import ${toVar(n)} from "@/assets/lottie/${n}.json"`).join("\n")
const entries = names
  .map((n) => `  "${n}": { data: ${toVar(n)}, source: ${JSON.stringify(USEANIM_SOURCE)} },`)
  .join("\n")

const content = `// Icon assets: cohesive UseAnimations pack (Feather-inspired, MIT / Lottie Simple License)
// Published on LottieFiles: https://lottiefiles.com/useanimations
${imports}
import type { IconName } from "./icon-names"

type IconEntry = {
  data: object
  /** LottieFiles / UseAnimations source URL */
  source: string
}

export const ICON_REGISTRY: Record<IconName, IconEntry> = {
${entries}
}

export function getIconAnimation(name: IconName): object {
  return ICON_REGISTRY[name].data
}
`

await writeFile(OUT, content)
console.log(`Wrote ${OUT} (${names.length} icons)`)

function toVar(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/-/g, "") + "Anim"
}
