import { cn } from "@/lib/utils"

type SpotifyAngryLogoProps = {
  className?: string
  dragging?: boolean
  exiting?: boolean
}

/** Stylized Spotify mark with an angry face — easter-egg only. */
export function SpotifyAngryLogo({ className, dragging, exiting }: SpotifyAngryLogoProps) {
  return (
    <div
      className={cn(
        "spotify-angry-logo",
        dragging && "spotify-angry-logo--dragging",
        exiting && "spotify-angry-logo--exiting",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="size-14" role="presentation">
        <circle cx="32" cy="32" r="30" className="fill-[#1DB954]" />
        <path
          d="M18 28c10-3 20-3 28 0M16 36c12-3 24-3 32 0M14 44c14-3 28-3 36 0"
          fill="none"
          stroke="#121212"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="24" cy="24" r="2.5" fill="#121212" />
        <circle cx="40" cy="24" r="2.5" fill="#121212" />
        <path d="M22 18 L28 21 M42 18 L36 21" stroke="#121212" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M26 30 Q32 34 38 30" fill="none" stroke="#121212" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {dragging ? (
        <span className="spotify-angry-logo__rope" aria-hidden />
      ) : null}
    </div>
  )
}
