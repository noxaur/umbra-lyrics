import { franc } from "franc-min"

export function detectLanguage(text: string): string {
  const sample = text.slice(0, 500)
  const code = franc(sample)
  return code === "und" ? "eng" : code
}

export function isEnglish(code: string): boolean {
  return code === "eng"
}
