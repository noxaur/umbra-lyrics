import { useCallback, useEffect, useState } from "react"
import { francToBcp47 } from "@/lib/language-service"
import { translateLinesWithFallback } from "@/lib/translation-service"

export function useTranslation(sourceLanguage: string) {
  const [available, setAvailable] = useState(false)
  const [translating, setTranslating] = useState(false)

  const bcp47 = francToBcp47(sourceLanguage)

  useEffect(() => {
    if (!window.Translator || bcp47 === "en") {
      setAvailable(false)
      return
    }
    void window.Translator.availability({ sourceLanguage: bcp47, targetLanguage: "en" }).then(
      (status) => setAvailable(status === "available"),
    )
  }, [bcp47])

  const translateLines = useCallback(
    async (lines: string[], videoId?: string) => {
      setTranslating(true)
      try {
        const result = await translateLinesWithFallback(lines, {
          sourceLang: sourceLanguage,
          videoId,
        })
        return result?.lines ?? lines
      } finally {
        setTranslating(false)
      }
    },
    [sourceLanguage],
  )

  return { available, translating, translateLines }
}
