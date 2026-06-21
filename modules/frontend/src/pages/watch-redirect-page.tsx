import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { YOUTUBE_VIDEO_ID_RE } from "@/lib/youtube-url"

/** Client-side fallback: `/watch?v=VIDEO_ID` → `/play/VIDEO_ID`. */
export function WatchRedirectPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const v = searchParams.get("v")?.trim() ?? ""
    if (YOUTUBE_VIDEO_ID_RE.test(v)) {
      navigate(`/play/${v}`, { replace: true })
      return
    }
    navigate("/", { replace: true })
  }, [searchParams, navigate])

  return (
    <p className="p-8 text-center text-sm text-muted-foreground" role="status">
      Opening player…
    </p>
  )
}
