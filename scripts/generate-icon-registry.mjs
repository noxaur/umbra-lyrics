#!/usr/bin/env node
import { writeFile, readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ICONS_DIR = join(__dirname, "../src/assets/lottie")
const OUT = join(__dirname, "../src/components/icons/icon-registry.ts")

const USEANIM_SOURCE = "https://useanimations.com/ (Patrick Svoboda; Lottie Simple License via LottieFiles)"

/** useanimations lib folder per icon — for registry comments */
const SOURCES = {
  "alert-circle": { lib: "alertCircle", source: USEANIM_SOURCE },
  "alert-triangle": { lib: "alertTriangle", source: USEANIM_SOURCE },
  "arrow-down": { lib: "arrowDown", source: USEANIM_SOURCE },
  "arrow-left": { lib: "arrowLeftCircle", source: USEANIM_SOURCE },
  "arrow-right": { lib: "arrowRightCircle", source: USEANIM_SOURCE },
  "arrow-up": { lib: "arrowUp", source: USEANIM_SOURCE },
  check: { lib: "checkmark", source: USEANIM_SOURCE },
  "check-circle-2": { lib: "checkBox", source: USEANIM_SOURCE },
  "chevron-down": { lib: "scrollDown", source: USEANIM_SOURCE },
  "chevron-right": { lib: "arrowDownCircle", source: USEANIM_SOURCE },
  "chevron-up": { lib: "arrowUpCircle", source: USEANIM_SOURCE },
  download: { lib: "download", source: USEANIM_SOURCE },
  "file-music": { lib: "folder", source: USEANIM_SOURCE },
  flag: { lib: "bookmark", source: USEANIM_SOURCE },
  "grip-vertical": { lib: "menu4", source: USEANIM_SOURCE },
  "help-circle": { lib: "help", source: USEANIM_SOURCE },
  home: { lib: "home", source: USEANIM_SOURCE },
  info: { lib: "info", source: USEANIM_SOURCE },
  languages: { lib: "explore", source: USEANIM_SOURCE },
  "layers-2": { lib: "folder", source: USEANIM_SOURCE },
  "link-2": { lib: "share", source: USEANIM_SOURCE },
  "list-music": { lib: "video", source: USEANIM_SOURCE },
  "list-plus": { lib: "userPlus", source: USEANIM_SOURCE },
  loader: { lib: "loading", source: USEANIM_SOURCE },
  "maximize-2": { lib: "maximizeMinimize2", source: USEANIM_SOURCE },
  "mic-2": { lib: "microphone2", source: USEANIM_SOURCE },
  "minimize-2": { lib: "maximizeMinimize", source: USEANIM_SOURCE },
  moon: { lib: "visibility2", source: USEANIM_SOURCE },
  "more-horizontal": { lib: "menu2", source: USEANIM_SOURCE },
  music: { lib: "activity", source: USEANIM_SOURCE },
  "music-2": { lib: "video2", source: USEANIM_SOURCE },
  "octagon-alert": { lib: "alertOctagon", source: USEANIM_SOURCE },
  palette: { lib: "explore", source: USEANIM_SOURCE },
  pause: { lib: "playPause", source: USEANIM_SOURCE },
  pencil: { lib: "edit", source: USEANIM_SOURCE },
  play: { lib: "playPause", source: USEANIM_SOURCE },
  plus: { lib: "plusToX", source: USEANIM_SOURCE },
  refresh: { lib: "loading", source: USEANIM_SOURCE },
  "rotate-ccw": { lib: "loading3", source: USEANIM_SOURCE },
  search: { lib: "searchToX", source: USEANIM_SOURCE },
  settings: { lib: "settings2", source: USEANIM_SOURCE },
  shuffle: { lib: "infinity", source: USEANIM_SOURCE },
  "skip-back": { lib: "skipBack", source: USEANIM_SOURCE },
  "skip-forward": { lib: "skipForward", source: USEANIM_SOURCE },
  sparkles: { lib: "star", source: USEANIM_SOURCE },
  sun: { lib: "heart", source: USEANIM_SOURCE },
  "trash-2": { lib: "trash2", source: USEANIM_SOURCE },
  upload: { lib: "download", source: USEANIM_SOURCE },
  "wifi-off": { lib: "notification2", source: USEANIM_SOURCE },
  x: { lib: "plusToX", source: USEANIM_SOURCE },
  "x-circle": { lib: "error", source: USEANIM_SOURCE },
}

const names = (await readFile(join(__dirname, "../src/components/icons/icon-names.ts"), "utf8"))
  .match(/"([a-z0-9-]+)"/g)
  ?.map((s) => s.slice(1, -1)) ?? []

const imports = names.map((n) => `import ${toVar(n)} from "@/assets/lottie/${n}.json"`).join("\n")
const entries = names
  .map((n) => `  "${n}": { data: ${toVar(n)}, source: ${JSON.stringify(SOURCES[n]?.source ?? USEANIM_SOURCE)} },`)
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
