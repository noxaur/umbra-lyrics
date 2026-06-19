import { Component, type ErrorInfo, type ReactNode } from "react"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { Link } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <AppShell>
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-16">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,var(--color-destructive)/0.12,transparent)]"
          aria-hidden
        />

        <div className="relative z-10 w-full max-w-md text-center" role="alert">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10 text-destructive">
            <LottieIcon name="alert-triangle" className="size-8" aria-hidden />
          </div>

          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Technical difficulties
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">The stage lights flickered</h1>
          <p className="mt-3 text-muted-foreground">
            {error?.message || "An unexpected error interrupted playback."}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" className="gap-2" onClick={onRetry}>
              <LottieIcon name="rotate-ccw" className="size-4" aria-hidden />
              Try again
            </Button>
            <Button asChild className="gap-2">
              <Link to="/">
                <LottieIcon name="home" className="size-4" aria-hidden />
                Back to home
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </AppShell>
  )
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App error boundary caught:", error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />
    }

    return this.props.children
  }
}
