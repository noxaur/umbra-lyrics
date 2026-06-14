import { useCallback, useEffect, useState } from "react"

type TranslatorInstance = {
  translate: (text: string) => Promise<string>
}

declare global {
  interface Window {
    Translator?: {
      create: (opts: { sourceLanguage: string; targetLanguage: string }) => Promise<TranslatorInstance>
      availability: (opts: { sourceLanguage: string; targetLanguage: string }) => Promise<string>
    }
  }
}

export function useTranslation(sourceLanguage: string) {
  const [available, setAvailable] = useState(false)
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    if (!window.Translator || sourceLanguage === "eng" || sourceLanguage === "en") {
      setAvailable(false)
      return
    }
    void window.Translator.availability({ sourceLanguage, targetLanguage: "en" }).then(
      (status) => setAvailable(status === "available"),
    )
  }, [sourceLanguage])

  const translateLines = useCallback(
    async (lines: string[]): Promise<string[]> => {
      if (!window.Translator) return lines
      setTranslating(true)
      try {
        const translator = await window.Translator.create({
          sourceLanguage,
          targetLanguage: "en",
        })
        const results: string[] = []
        for (const line of lines) {
          results.push(line ? await translator.translate(line) : "")
        }
        return results
      } catch {
        return lines
      } finally {
        setTranslating(false)
      }
    },
    [sourceLanguage],
  )

  return { available, translating, translateLines }
}
