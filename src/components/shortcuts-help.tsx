import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const SHORTCUTS = [
  { key: "Space", action: "Play / Pause" },
  { key: "← / →", action: "Seek ±5s" },
  { key: "Shift + ← / →", action: "Previous / next playlist track" },
  { key: "F", action: "Fullscreen lyrics and video" },
  { key: "+ / −", action: "Sync offset ±0.5s" },
]

export function ShortcutsHelp({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-3">
        <p className="mb-2 text-sm font-semibold">Keyboard shortcuts</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {SHORTCUTS.map((s) => (
            <li key={s.key} className="flex justify-between gap-4">
              <kbd className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {s.key}
              </kbd>
              <span>{s.action}</span>
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
