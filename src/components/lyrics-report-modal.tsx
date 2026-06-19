import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  LYRICS_REPORT_ISSUES,
  type LyricsReportIssueType,
} from "@/lib/lyrics-rejection-report"

type LyricsReportModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (issueType: LyricsReportIssueType) => void
}

export function LyricsReportModal({ open, onClose, onSubmit }: LyricsReportModalProps) {
  const [selectedIssue, setSelectedIssue] = useState<LyricsReportIssueType | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      setSelectedIssue(null)
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal()
        } else {
          dialog.setAttribute("open", "")
        }
      }
    } else if (dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close()
      } else {
        dialog.removeAttribute("open")
      }
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => onClose()
    dialog.addEventListener("close", handleClose)
    return () => dialog.removeEventListener("close", handleClose)
  }, [onClose])

  const selectedLabel = useMemo(
    () => LYRICS_REPORT_ISSUES.find((issue) => issue.value === selectedIssue)?.label ?? null,
    [selectedIssue],
  )

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "app-dialog fixed inset-0 z-modal m-auto w-[calc(100%-2rem)] max-w-2xl",
        "open:flex open:max-h-[calc(100dvh-2rem)] open:flex-col open:gap-4",
      )}
      aria-labelledby="lyrics-report-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div>
        <h2 id="lyrics-report-title" className="text-lg font-semibold">
          What kind of lyrics issue is this?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the closest match. We use this to route the report and prefill the GitHub issue.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {LYRICS_REPORT_ISSUES.map((issue) => {
          const selected = issue.value === selectedIssue
          return (
            <button
              key={issue.value}
              type="button"
              onClick={() => setSelectedIssue(issue.value)}
              className={cn(
                "flex min-h-[5.5rem] flex-col rounded-lg border px-4 py-3 text-left transition-colors",
                "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-foreground",
              )}
              aria-pressed={selected}
            >
              <span className="text-sm font-semibold">{issue.label}</span>
              <span className="mt-1 text-sm text-muted-foreground">{issue.description}</span>
            </button>
          )
        })}
      </div>

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {selectedLabel ? (
          <span>
            Selected <span className="font-medium text-foreground">{selectedLabel}</span>.
          </span>
        ) : (
          <span>Select one option to continue.</span>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!selectedIssue}
          onClick={() => {
            if (selectedIssue) onSubmit(selectedIssue)
          }}
        >
          Open GitHub issue
        </Button>
      </div>
    </dialog>
  )
}
