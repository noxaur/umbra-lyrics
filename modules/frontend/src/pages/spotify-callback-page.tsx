import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { completeSpotifyLogin } from "@/lib/spotify-auth"

export function SpotifyCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const spotifyError = searchParams.get("error")

    if (spotifyError) {
      setError("Spotify login was cancelled.")
      return
    }

    if (!code || !state) {
      setError("Missing Spotify login response.")
      return
    }

    let cancelled = false

    void completeSpotifyLogin(code, state)
      .then((returnPath) => {
        if (!cancelled) navigate(returnPath, { replace: true })
      })
      .catch(() => {
        if (!cancelled) setError("Could not complete Spotify login.")
      })

    return () => {
      cancelled = true
    }
  }, [navigate, searchParams])

  return (
    <AppShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        {error ? (
          <>
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <Button asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            Finishing Spotify login…
          </p>
        )}
      </div>
    </AppShell>
  )
}
