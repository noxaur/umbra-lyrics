# Tinted Theme Catalog

## Problem

Theme presets are hard-coded and maintained in-repo. That creates ongoing upkeep for palette curation, blocks easy expansion, and keeps app disconnected from a broader community theme ecosystem.

App already has solid local theme UX:

- preset gallery at `/themes`;
- active theme persistence;
- custom theme builder/import/export;
- semantic karaoke token model tuned for app surfaces.

Need replace in-house preset catalog without losing that UX.

## Decision

Adopt [`tinted-theming/schemes`](https://github.com/tinted-theming/schemes) as upstream preset source and vendor a snapshot of selected Base16 YAML schemes into repo.

App will not fetch GitHub at runtime. A local sync step will refresh vendored files and regenerate TypeScript preset data consumed by app.

## Why Tinted

- standardized scheme format with active builder ecosystem;
- broad community catalog including Gruvbox, Catppuccin, Nord, Rosé Pine, Tokyo Night, Solarized, Dracula, Kanagawa, GitHub, and more;
- machine-readable YAML files suitable for code generation;
- MIT license;
- dark and light variants available for many families.

## Source Model

Vendored upstream files live separately from app code, under a dedicated directory such as:

`vendor/tinted-themes/base16/`

A sync script will:

1. download pinned YAML files from `tinted-theming/schemes`;
2. write raw vendored copies into repo;
3. transform vendored Base16 palettes into app `Theme` objects;
4. emit generated preset registry for runtime use.

Generated runtime output will live in a file such as:

`src/lib/generated-tinted-themes.ts`

That file will include a do-not-edit header and be committed.

## Catalog Scope

Do not vendor full upstream catalog initially. `/themes` renders full preview cards, so dropping 230+ presets into current UI would create poor browsing performance and weak information scent.

Initial snapshot should be curated to roughly 30-60 presets with:

- strong dark/light coverage;
- recognizable families;
- enough variety to justify catalog shift;
- at least one dark and one light Gruvbox variant.

Later expansion can be done by editing curated source list and re-running sync.

## Theme Mapping

Keep existing `Theme`, `ThemeTokens`, storage keys, provider contract, and `/themes` UI.

Generator maps Base16 `base00..base0F` palette into app semantic tokens:

- `background` ← `base00`
- `card` / `popover` ← `base01`
- `secondary` / `muted` / `input` ← `base01` or `base02`
- `border` ← `base02`
- `foreground` / `cardForeground` / `popoverForeground` ← `base05`
- `primary` ← `base0D` or `base0E`
- `primaryForeground` ← whichever of `base00` or `base07` yields better contrast
- `accent` ← `base0C` or `base0A`
- `accentForeground` ← contrast-aware choice between `base00` and `base07`
- `destructive` ← `base08`
- `ring` ← `primary`
- `karaokeActive` ← strongest readable highlight among `base0D`, `base0E`, `base0A`
- `karaokeMuted` ← `base03` or `base04`
- `karaokeUnsung` ← muted token with alpha
- `karaokeStageBg` ← contrast-tuned stage background derived from `base00`

Mapping is deterministic and generated, not hand-tuned per preset.

## Defaults

Set stable defaults to vendored Gruvbox variants:

- dark default: `gruvbox-dark-hard`
- light default: `gruvbox-light-soft`

This preserves familiar theme names and gives good contrast baselines while moving to external catalog.

## App Behavior

- Preset themes come from generated Tinted registry.
- Custom themes remain local-only and keep current builder/import/export flow.
- `/themes` still presents presets and custom themes via same UI.
- Theme provider still merges presets with custom themes into one registry.
- Existing local storage keys remain unchanged.

If a stored preset id no longer exists after migration, provider falls back to new default theme. Custom theme ids remain untouched.

## Testing

Update tests to validate generated catalog behavior instead of hand-authored preset count.

Required coverage:

- generated preset list is non-empty;
- default dark/light ids exist;
- every generated theme has complete token set;
- Gruvbox dark and light mapping produce expected ids/categories and stable token assignments;
- theme persistence still falls back safely when stored preset id is invalid;
- custom themes still merge correctly with generated presets.

Run focused theme tests plus full test suite and build after implementation.

## Non-Goals

- runtime network fetching of themes from GitHub;
- replacing custom theme builder;
- redesigning `/themes` browsing UI;
- supporting every upstream Tinted scheme on day one;
- introducing a new public theme file format for app-specific exports.

## Implementation Notes

- Keep raw vendored YAML separate from generated TS.
- Generator should be idempotent so repeated sync produces stable output ordering.
- Use slug generation based on upstream file names to keep ids predictable.
- Prefer explicit curated manifest over directory glob alone, so additions/removals are reviewable.
- Preserve enough metadata for UI labels and descriptions, even if description must be synthesized from upstream name/author when upstream lacks one.
