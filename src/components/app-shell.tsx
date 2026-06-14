import { ModeToggle } from "@/components/mode-toggle"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <a href="/" className="text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          song-kara
        </a>
        <ModeToggle />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
