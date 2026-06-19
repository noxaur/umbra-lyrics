import { Link } from "react-router-dom"
import { useTripleClick } from "@/hooks/use-triple-click"
import { cn } from "@/lib/utils"

type HomeBrandLinkProps = {
  className?: string
  children: React.ReactNode
  onTripleClick: () => void
}

export function HomeBrandLink({ className, children, onTripleClick }: HomeBrandLinkProps) {
  const handleTripleClick = useTripleClick(onTripleClick)

  return (
    <Link to="/" className={cn(className)} onClick={handleTripleClick}>
      {children}
    </Link>
  )
}
