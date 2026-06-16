import { useCallback, useEffect, useState } from "react"
import {
  clearSpotifySession,
  ensureSpotifyAccessToken,
  getSpotifySession,
  startSpotifyLogin,
  subscribeSpotifyAuth,
  type SpotifySession,
} from "@/lib/spotify-auth"

export function useSpotifyAuth() {
  const [session, setSession] = useState<SpotifySession | null>(() => getSpotifySession())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => subscribeSpotifyAuth(() => setSession(getSpotifySession())), [])

  const login = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await startSpotifyLogin(window.location.pathname)
    } catch {
      setError("Spotify login is unavailable right now.")
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    clearSpotifySession()
    setError(null)
  }, [])

  const getAccessToken = useCallback(async () => ensureSpotifyAccessToken(), [])

  return {
    session,
    isLoggedIn: Boolean(session),
    loading,
    error,
    login,
    logout,
    getAccessToken,
  }
}
