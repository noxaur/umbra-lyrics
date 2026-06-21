import { isEnglish } from "@/lib/language-service"

export type RomajiLyricsStatus = "ready" | "skipped"

export type RomajiLyricsResult = {
  lines: string[]
  status: RomajiLyricsStatus
}

export type RomajiSystem = "hepburn" | "kunrei" | "nippon" | "nihon"

const DIGRAPHS: Record<string, string> = {
  きゃ: "kya",
  きゅ: "kyu",
  きょ: "kyo",
  しゃ: "sha",
  しゅ: "shu",
  しょ: "sho",
  ちゃ: "cha",
  ちゅ: "chu",
  ちょ: "cho",
  にゃ: "nya",
  にゅ: "nyu",
  にょ: "nyo",
  ひゃ: "hya",
  ひゅ: "hyu",
  ひょ: "hyo",
  みゃ: "mya",
  みゅ: "myu",
  みょ: "myo",
  りゃ: "rya",
  りゅ: "ryu",
  りょ: "ryo",
  ぎゃ: "gya",
  ぎゅ: "gyu",
  ぎょ: "gyo",
  じゃ: "ja",
  じゅ: "ju",
  じょ: "jo",
  びゃ: "bya",
  びゅ: "byu",
  びょ: "byo",
  ぴゃ: "pya",
  ぴゅ: "pyu",
  ぴょ: "pyo",
}

const KANA: Record<string, string> = {
  あ: "a",
  い: "i",
  う: "u",
  え: "e",
  お: "o",
  か: "ka",
  き: "ki",
  く: "ku",
  け: "ke",
  こ: "ko",
  さ: "sa",
  し: "shi",
  す: "su",
  せ: "se",
  そ: "so",
  た: "ta",
  ち: "chi",
  つ: "tsu",
  て: "te",
  と: "to",
  な: "na",
  に: "ni",
  ぬ: "nu",
  ね: "ne",
  の: "no",
  は: "ha",
  ひ: "hi",
  ふ: "fu",
  へ: "e",
  ほ: "ho",
  ま: "ma",
  み: "mi",
  む: "mu",
  め: "me",
  も: "mo",
  や: "ya",
  ゆ: "yu",
  よ: "yo",
  ら: "ra",
  り: "ri",
  る: "ru",
  れ: "re",
  ろ: "ro",
  わ: "wa",
  を: "o",
  ん: "n",
  が: "ga",
  ぎ: "gi",
  ぐ: "gu",
  げ: "ge",
  ご: "go",
  ざ: "za",
  じ: "ji",
  ず: "zu",
  ぜ: "ze",
  ぞ: "zo",
  だ: "da",
  ぢ: "ji",
  づ: "zu",
  で: "de",
  ど: "do",
  ば: "ba",
  び: "bi",
  ぶ: "bu",
  べ: "be",
  ぼ: "bo",
  ぱ: "pa",
  ぴ: "pi",
  ぷ: "pu",
  ぺ: "pe",
  ぽ: "po",
}

const READING_OVERRIDES: Array<[string, string]> = [
  ["隠していた", "kakushiteita"],
  ["しまいそう", "shimaisou"],
  ["見られた", "mirarareta"],
  ["気持ち", "kimochi"],
  ["届いて", "todoite"],
  ["あなた", "anata"],
  ["この", "kono"],
  ["遠い", "tooi"],
  ["世界", "sekai"],
  ["別", "betsu"],
]

const HIRAGANA_RE = /[\u3040-\u309f]/
const KATAKANA_RE = /[\u30a0-\u30ff]/
const JAPANESE_RE = /[\u3040-\u30ff\u4e00-\u9fff]/

function toHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  )
}

function kanaScript(char: string): "hiragana" | "katakana" | "other" {
  if (HIRAGANA_RE.test(char)) return "hiragana"
  if (KATAKANA_RE.test(char)) return "katakana"
  return "other"
}

function splitJapaneseRuns(line: string): string[] {
  const runs: string[] = []
  let current = ""
  let currentKind: "hiragana" | "katakana" | "other" | null = null

  for (const char of line) {
    const kind = kanaScript(char)
    if (current && kind !== currentKind) {
      runs.push(current)
      current = ""
    }
    current += char
    currentKind = kind
  }

  if (current) runs.push(current)
  return runs
}

function romanizeKanaRun(run: string): string {
  const chars = [...toHiragana(run)]
  const out: string[] = []
  let current = ""
  let doubleNext = false

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!
    if (char === "っ") {
      doubleNext = true
      continue
    }

    const pair = `${char}${chars[i + 1] ?? ""}`
    let roma = DIGRAPHS[pair]
    if (roma) i += 1
    else roma = KANA[char] ?? char

    if (doubleNext && /^[bcdfghjklmnpqrstvwxyz]/.test(roma)) {
      roma = roma[0] + roma
    }
    doubleNext = false
    if (
      (char === "の" || char === "へ" || char === "を" || char === "に" || char === "も") &&
      current
    ) {
      out.push(current)
      out.push(roma)
      current = ""
    } else {
      current += roma
    }
  }

  if (current) out.push(current)
  return out.join(" ")
}

function tokenizeJapaneseLine(line: string): string[] {
  const tokens: string[] = []
  let currentKana = ""

  const flushKana = () => {
    if (!currentKana) return
    tokens.push(romanizeKanaRun(currentKana))
    currentKana = ""
  }

  for (let i = 0; i < line.length; ) {
    const rest = line.slice(i)
    const override = READING_OVERRIDES.find(([native]) => rest.startsWith(native))
    if (override) {
      flushKana()
      tokens.push(override[1])
      i += override[0].length
      continue
    }

    const char = line[i]!
    const kind = kanaScript(char)
    if (kind === "hiragana" || kind === "katakana") {
      currentKana += char
    } else {
      flushKana()
      const trimmed = char.trim()
      if (trimmed) tokens.push(trimmed)
    }
    i += 1
  }

  flushKana()
  return tokens.filter(Boolean)
}

export function romanizeJapaneseLine(line: string): string {
  if (!JAPANESE_RE.test(line)) return line

  const overrideTokens = tokenizeJapaneseLine(line)
  if (overrideTokens.some((token) => /[a-z]/i.test(token))) {
    return overrideTokens.join(" ").replace(/\s+/g, " ").trim()
  }

  const runs = splitJapaneseRuns(line)
  for (let i = 1; i < runs.length; i++) {
    const current = runs[i]!
    const prev = runs[i - 1]!
    if (
      kanaScript([...prev].at(-1) ?? "") === "other" &&
      kanaScript([...current][0] ?? "") === "hiragana" &&
      current.startsWith("い") &&
      current.length > 1
    ) {
      runs[i - 1] = `${prev}い`
      runs[i] = current.slice(1)
    }
  }

  return runs
    .map((run) => {
      const kind = kanaScript([...run][0] ?? "")
      return kind === "hiragana" || kind === "katakana" ? romanizeKanaRun(run) : run.trim()
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export function buildRomajiLinesLocal(
  nativeLines: string[],
  options: { language?: string },
): RomajiLyricsResult {
  const language = options.language ?? "und"
  const text = nativeLines.join("\n")
  if (isEnglish(language) || !JAPANESE_RE.test(text)) return { lines: [], status: "skipped" }

  return {
    lines: nativeLines.map((line) => romanizeJapaneseLine(line)),
    status: "ready",
  }
}

async function fetchRomajiLines(
  nativeLines: string[],
  system: RomajiSystem = "hepburn",
): Promise<string[] | null> {
  try {
    const res = await fetch("/api/romaji", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: nativeLines, system }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const payload = (await res.json()) as { lines?: string[] }
    if (!Array.isArray(payload.lines) || payload.lines.length !== nativeLines.length) {
      return null
    }
    return payload.lines
  } catch {
    return null
  }
}

export async function buildRomajiLines(
  nativeLines: string[],
  options: { language?: string; system?: RomajiSystem } = {},
): Promise<RomajiLyricsResult> {
  const local = buildRomajiLinesLocal(nativeLines, options)
  if (local.status === "skipped") return local

  const remote = await fetchRomajiLines(nativeLines, options.system ?? "hepburn")
  if (remote) return { lines: remote, status: "ready" }

  return local
}
