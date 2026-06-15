import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePlayerStore } from "@/stores/player-store"

export function PlayerViewMenu() {
  const videoHidden = usePlayerStore((s) => s.videoHidden)
  const setVideoHidden = usePlayerStore((s) => s.setVideoHidden)
  const focusMode = usePlayerStore((s) => s.focusMode)
  const setFocusMode = usePlayerStore((s) => s.setFocusMode)
  const tvMode = usePlayerStore((s) => s.tvMode)
  const setTvMode = usePlayerStore((s) => s.setTvMode)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 px-2.5 text-xs">
          <MoreHorizontal className="size-3.5" aria-hidden />
          <span>View</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Display</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={tvMode}
          onCheckedChange={setTvMode}
          onSelect={(e) => e.preventDefault()}
        >
          TV mode
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={focusMode}
          onCheckedChange={setFocusMode}
          onSelect={(e) => e.preventDefault()}
        >
          Focus mode
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={videoHidden}
          onCheckedChange={setVideoHidden}
          onSelect={(e) => e.preventDefault()}
        >
          {videoHidden ? "Show video" : "Hide video"}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
