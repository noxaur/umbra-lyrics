import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Music } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AnimatedIcon } from "@/components/icons/animated-icon"
import { extractYouTubeVideoId } from "@/lib/youtube-url"

export function UrlInput() {
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const navigate = useNavigate()

  const goToPlayer = (id: string) => {
    setOpening(true)
    navigate(`/play/${id}`, { state: { fromHome: true } })
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const id = extractYouTubeVideoId(url)
    if (!id) {
      setError("Enter a valid YouTube URL or video ID")
      return
    }
    setError(null)
    goToPlayer(id)
  }

  const onPaste = (value: string) => {
    setUrl(value)
    const id = extractYouTubeVideoId(value)
    if (id) {
      setError(null)
      goToPlayer(id)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-xl flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="text"
          inputMode="url"
          placeholder="Paste YouTube URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            setTimeout(() => onPaste(text), 0)
          }}
          disabled={opening}
          aria-invalid={!!error}
          aria-describedby={error ? "url-error" : opening ? "url-opening" : undefined}
        />
        <Button type="submit" className="shrink-0" disabled={opening}>
          <AnimatedIcon icon={Music} />
          {opening ? "Opening…" : "Start"}
        </Button>
      </div>
      {opening && (
        <p id="url-opening" className="text-sm text-muted-foreground" role="status">
          Opening player…
        </p>
      )}
      {error && (
        <p id="url-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
