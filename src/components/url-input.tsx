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
  const navigate = useNavigate()

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const id = extractYouTubeVideoId(url)
    if (!id) {
      setError("Enter a valid YouTube URL or video ID")
      return
    }
    setError(null)
    navigate(`/play/${id}`)
  }

  const onPaste = (value: string) => {
    setUrl(value)
    const id = extractYouTubeVideoId(value)
    if (id) {
      setError(null)
      navigate(`/play/${id}`)
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-xl flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="Paste YouTube URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            setTimeout(() => onPaste(text), 0)
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "url-error" : undefined}
        />
        <Button type="submit" className="shrink-0">
          <AnimatedIcon icon={Music} />
          Start
        </Button>
      </div>
      {error && (
        <p id="url-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
