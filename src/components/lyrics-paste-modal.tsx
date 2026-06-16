import { useEffect, useRef, useState } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type LyricsPasteModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (text: string) => void
}

const ACCEPTED_TYPES = ".lrc,.txt,text/plain"

export function LyricsPasteModal({ open, onClose, onSubmit }: LyricsPasteModalProps) {
  const [text, setText] = useState("")
  const [importName, setImportName] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      setText("")
      setImportName(null)
      setImportError(null)
      if (!dialog.open) dialog.showModal()
      requestAnimationFrame(() => textareaRef.current?.focus())
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => onClose()
    dialog.addEventListener("close", handleClose)
    return () => dialog.removeEventListener("close", handleClose)
  }, [onClose])

  const handleImportFile = async (file: File) => {
    setImportError(null)
    const name = file.name.toLowerCase()
    if (!name.endsWith(".lrc") && !name.endsWith(".txt") && file.type !== "text/plain") {
      setImportError("Use an .lrc or .txt file")
      return
    }
    try {
      const imported = await file.text()
      if (!imported.trim()) {
        setImportError("File is empty")
        return
      }
      setText(imported)
      setImportName(file.name)
      textareaRef.current?.focus()
    } catch {
      setImportError("Could not read file")
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "app-dialog fixed inset-0 z-modal m-auto w-[calc(100%-2rem)] max-w-lg",
        "open:flex open:max-h-[calc(100dvh-2rem)] open:flex-col open:gap-4",
      )}
      aria-labelledby="paste-lyrics-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div>
        <h2 id="paste-lyrics-title" className="text-lg font-semibold">
          Paste or import lyrics
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste LRC (synced) or plain text, or import an .lrc / .txt file. Saved for this video on
          this device.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-4" aria-hidden />
          Import file
        </Button>
        {importName ? (
          <span className="text-xs text-muted-foreground">Loaded {importName}</span>
        ) : null}
        {importError ? (
          <span className="text-xs text-destructive" role="alert">
            {importError}
          </span>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleImportFile(file)
            event.target.value = ""
          }}
        />
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (importName) setImportName(null)
        }}
        placeholder={"[00:12.00] First line\n[00:18.50] Second line\n\nor plain text, one line per lyric"}
        className={cn(
          "min-h-[200px] w-full flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={() => onSubmit(text.trim())} disabled={!text.trim()}>
          Use lyrics
        </Button>
      </div>
    </dialog>
  )
}
