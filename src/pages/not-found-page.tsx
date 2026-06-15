import { useLocation } from "react-router-dom"
import { MisroutedRouteView } from "@/components/misrouted-route-view"
import { analyzeRoute } from "@/lib/route-suggestions"

export function NotFoundPage() {
  const location = useLocation()
  const issue = analyzeRoute(location.pathname, location.search)
  return <MisroutedRouteView issue={issue} />
}
