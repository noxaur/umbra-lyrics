#!/usr/bin/env node
/**
 * Copies cohesive UseAnimations Lottie JSON (Feather-inspired, MIT) into src/assets/lottie/.
 * UseAnimations icons are published on LottieFiles by Patrick Svoboda.
 */
import { cp, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { execSync } from "node:child_process"
import { tmpdir } from "node:os"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, "../src/assets/lottie")
const TGZ = join(tmpdir(), "react-useanimations-2.10.0.tgz")

/** icon name → useanimations lib folder */
const USEANIM_MAP = {
  "alert-circle": "alertCircle",
  "alert-triangle": "alertTriangle",
  "arrow-down": "arrowDown",
  "arrow-left": "arrowLeftCircle",
  "arrow-right": "arrowRightCircle",
  "arrow-up": "arrowUp",
  check: "checkmark",
  "check-circle-2": "checkBox",
  "chevron-down": "scrollDown",
  "chevron-right": "arrowDownCircle",
  "chevron-up": "arrowUpCircle",
  download: "download",
  "help-circle": "help",
  home: "home",
  info: "info",
  loader: "loading",
  "maximize-2": "maximizeMinimize2",
  "mic-2": "microphone2",
  "minimize-2": "maximizeMinimize",
  "octagon-alert": "alertOctagon",
  pause: "playPause",
  pencil: "edit",
  play: "playPause",
  plus: "plusToX",
  refresh: "loading2",
  "rotate-ccw": "loading3",
  search: "searchToX",
  settings: "settings2",
  "skip-back": "skipBack",
  "skip-forward": "skipForward",
  "trash-2": "trash2",
  x: "plusToX",
  "x-circle": "error",
  "file-music": "folder",
  flag: "bookmark",
  "grip-vertical": "menu4",
  languages: "explore",
  "layers-2": "folder",
  "link-2": "share",
  "list-music": "video",
  "list-plus": "userPlus",
  moon: "visibility2",
  "more-horizontal": "menu2",
  music: "activity",
  "music-2": "video2",
  palette: "explore",
  shuffle: "infinity",
  sparkles: "star",
  sun: "heart",
  upload: "download",
  "wifi-off": "notification2",
}

try {
  execSync(`npm pack react-useanimations@2.10.0 --pack-destination ${tmpdir()}`, {
    stdio: "pipe",
  })
} catch {
  /* tgz may already exist */
}

await mkdir(OUT_DIR, { recursive: true })
const extractDir = join(tmpdir(), "useanim-extract")
execSync(`rm -rf ${extractDir} && mkdir -p ${extractDir} && tar -xzf ${TGZ} -C ${extractDir}`)

for (const [iconName, libName] of Object.entries(USEANIM_MAP)) {
  const src = join(extractDir, "package/lib", libName, `${libName}.json`)
  const dest = join(OUT_DIR, `${iconName}.json`)
  await cp(src, dest)
  console.log(`Copied ${iconName} <- ${libName}`)
}
