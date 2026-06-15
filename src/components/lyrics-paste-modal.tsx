import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type LyricsPasteModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (text: string) => void
}

export function LyricsPasteModal({ open, onClose, onSubmit }: LyricsPasteModalProps) {
  const [text, setText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setText("")
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paste-lyrics-title"
      onClick={onClose}
    >
      <div
        className="my-auto flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="paste-lyrics-title" className="text-lg font-semibold">
            Paste lyrics
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste LRC (synced) or plain text. Saved for this video on this device.
          </p>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"[00:12.00] First line\n[00:18.50] Second line\n\nor plain text, one line per lyric"}
          className={cn(
            "min-h-[12rem] flex-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(text.trim())} disabled={!text.trim()}>
            Use lyrics
          </Button>
        </div>
      </div>
    </div>
  )
}
