import { Link } from "react-router-dom"
import { Moon, Palette, Settings2, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedIcon } from "@/components/icons/animated-icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme, useThemePreviewEnter } from "@/components/theme-provider"
import {
  TEXT_SIZE_LABELS,
  TEXT_SIZE_PRESETS,
  type TextSizePreset,
} from "@/lib/display-settings"
import { useDisplaySettingsStore } from "@/stores/display-settings-store"
import { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID } from "@/lib/themes"

function TextSizeGroup({
  label,
  value,
  onChange,
}: {
  label: string
  value: TextSizePreset
  onChange: (size: TextSizePreset) => void
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as TextSizePreset)}>
          {TEXT_SIZE_PRESETS.map((preset) => (
            <DropdownMenuRadioItem
              key={preset}
              value={preset}
              onSelect={(e) => e.preventDefault()}
            >
              {TEXT_SIZE_LABELS[preset]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function ThemeMenuItem({
  entryId,
  name,
  selected,
  onSelect,
}: {
  entryId: string
  name: string
  selected: boolean
  onSelect: () => void
}) {
  const previewHandlers = useThemePreviewEnter(entryId)

  return (
    <DropdownMenuItem
      {...previewHandlers}
      onSelect={(e) => e.preventDefault()}
      onClick={onSelect}
      className={selected ? "bg-accent/60" : undefined}
    >
      {name}
    </DropdownMenuItem>
  )
}

function ThemeSubmenu() {
  const {
    theme,
    themeId,
    presetThemes,
    customThemes,
    setTheme,
    setDarkTheme,
    setLightTheme,
    clearThemePreview,
  } = useTheme()

  const darkPreviewHandlers = useThemePreviewEnter(DEFAULT_DARK_THEME_ID)
  const lightPreviewHandlers = useThemePreviewEnter(DEFAULT_LIGHT_THEME_ID)

  const darkThemes = presetThemes.filter((entry) => entry.category === "dark")
  const lightThemes = presetThemes.filter((entry) => entry.category === "light")

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <span>Theme</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{theme.name}</span>
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-56"
        onPointerLeave={() => clearThemePreview()}
      >
        <DropdownMenuItem
          {...darkPreviewHandlers}
          onSelect={(e) => e.preventDefault()}
          onClick={setDarkTheme}
        >
          <Moon className="size-4" aria-hidden />
          Quick dark
        </DropdownMenuItem>
        <DropdownMenuItem
          {...lightPreviewHandlers}
          onSelect={(e) => e.preventDefault()}
          onClick={setLightTheme}
        >
          <Sun className="size-4" aria-hidden />
          Quick light
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {customThemes.length > 0 ? (
          <>
            <DropdownMenuLabel>Your themes</DropdownMenuLabel>
            {customThemes.map((entry) => (
              <ThemeMenuItem
                key={entry.id}
                entryId={entry.id}
                name={entry.name}
                selected={themeId === entry.id}
                onSelect={() => setTheme(entry.id)}
              />
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuLabel>Dark stages</DropdownMenuLabel>
        {darkThemes.map((entry) => (
          <ThemeMenuItem
            key={entry.id}
            entryId={entry.id}
            name={entry.name}
            selected={themeId === entry.id}
            onSelect={() => setTheme(entry.id)}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Light stages</DropdownMenuLabel>
        {lightThemes.map((entry) => (
          <ThemeMenuItem
            key={entry.id}
            entryId={entry.id}
            name={entry.name}
            selected={themeId === entry.id}
            onSelect={() => setTheme(entry.id)}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/themes" className="gap-2">
            <Palette className="size-4" aria-hidden />
            Browse all themes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/themes/build" className="gap-2">
            <Palette className="size-4" aria-hidden />
            Build custom theme
          </Link>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function SettingsMenu() {
  const { clearThemePreview } = useTheme()
  const lyricsTextSize = useDisplaySettingsStore((s) => s.lyricsTextSize)
  const secondaryTextSize = useDisplaySettingsStore((s) => s.secondaryTextSize)
  const uiTextSize = useDisplaySettingsStore((s) => s.uiTextSize)
  const setLyricsTextSize = useDisplaySettingsStore((s) => s.setLyricsTextSize)
  const setSecondaryTextSize = useDisplaySettingsStore((s) => s.setSecondaryTextSize)
  const setUiTextSize = useDisplaySettingsStore((s) => s.setUiTextSize)
  const resetDisplaySettings = useDisplaySettingsStore((s) => s.resetDisplaySettings)

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) clearThemePreview() }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings" title="Settings">
          <AnimatedIcon icon={Settings2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Text size</DropdownMenuLabel>
        <TextSizeGroup
          label="Lyrics"
          value={lyricsTextSize}
          onChange={setLyricsTextSize}
        />
        <TextSizeGroup
          label="Translations & romaji"
          value={secondaryTextSize}
          onChange={setSecondaryTextSize}
        />
        <TextSizeGroup
          label="Timestamps & labels"
          value={uiTextSize}
          onChange={setUiTextSize}
        />
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={resetDisplaySettings}
          className="text-muted-foreground"
        >
          Reset text sizes
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeSubmenu />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
