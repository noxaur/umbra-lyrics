import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type PlaylistFormDialogProps = {
  open: boolean
  title: string
  initialName?: string
  submitLabel?: string
  onSubmit: (name: string) => void
  onClose: () => void
}

export function PlaylistFormDialog({
  open,
  title,
  initialName = "",
  submitLabel = "Save",
  onSubmit,
  onClose,
}: PlaylistFormDialogProps) {
  const [name, setName] = useState(initialName)
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(initialName)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open, initialName])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${inputId}-title`}
        className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-lg"
      >
        <h2 id={`${inputId}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(name)
          }}
        >
          <div>
            <label htmlFor={inputId} className="text-sm font-medium">
              Playlist name
            </label>
            <Input
              ref={inputRef}
              id={inputId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My karaoke set"
              className="mt-1.5"
              maxLength={80}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
