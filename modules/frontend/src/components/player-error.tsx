import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

type PlayerErrorProps = {
  title: string
  message: string
  onRetry?: () => void
}

export function PlayerError({ title, message, onRetry }: PlayerErrorProps) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
      role="alert"
    >
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        <Button variant="outline" size="sm" asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </div>
  )
}
