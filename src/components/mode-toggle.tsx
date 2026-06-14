import { Link } from "react-router-dom"
import { Moon, Palette, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedIcon } from "@/components/icons/animated-icon"
import { useTheme } from "@/components/theme-provider"

export function ModeToggle() {
  const { theme, setLightTheme, setDarkTheme } = useTheme()

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={theme.category === "dark" ? setLightTheme : setDarkTheme}
        aria-label={theme.category === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {theme.category === "dark" ? (
          <AnimatedIcon icon={Sun} />
        ) : (
          <AnimatedIcon icon={Moon} />
        )}
      </Button>
      <Button variant="ghost" size="icon" asChild>
        <Link to="/themes" aria-label="Browse themes">
          <AnimatedIcon icon={Palette} />
        </Link>
      </Button>
    </div>
  )
}
