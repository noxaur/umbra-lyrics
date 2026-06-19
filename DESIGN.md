---
name: umbra
description: Dimmed-venue karaoke player — lyrics-first, stage-lit, product UI
colors:
  stage-violet: "oklch(0.72 0.28 320)"
  stage-violet-ink: "oklch(0.12 0.02 280)"
  stage-floor: "oklch(0.1 0.025 280)"
  lyric-active: "oklch(0.78 0.3 320)"
  lyric-muted: "oklch(0.5 0.04 280)"
  lyric-unsung: "oklch(0.5 0.04 280 / 0.7)"
  surface-card: "oklch(0.16 0.025 280)"
  surface-muted: "oklch(0.22 0.03 280)"
  ink-primary: "oklch(0.95 0.01 280)"
  ink-muted: "oklch(0.65 0.03 280)"
  border-subtle: "oklch(0.28 0.03 280)"
  status-success: "oklch(0.72 0.16 155)"
  status-warning: "oklch(0.78 0.14 75)"
  status-info: "oklch(0.74 0.12 240)"
typography:
  body:
    fontFamily: '"DM Sans Variable", "DM Sans", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: '"DM Sans Variable", "DM Sans", ui-sans-serif, system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.25
  lyric-active:
    fontFamily: '"DM Sans Variable", "DM Sans", ui-sans-serif, system-ui, sans-serif'
    fontSize: "clamp(3rem, 4.5vw, 6rem)"
    fontWeight: 600
    lineHeight: 1.1
  lyric-inactive:
    fontFamily: '"DM Sans Variable", "DM Sans", ui-sans-serif, system-ui, sans-serif'
    fontSize: "clamp(1rem, 2.8vw, 1.65rem)"
    fontWeight: 600
    lineHeight: 1.375
  label:
    fontFamily: '"DM Sans Variable", "DM Sans", ui-sans-serif, system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
rounded:
  sm: "calc(0.5rem - 4px)"
  md: "calc(0.5rem - 2px)"
  lg: "0.5rem"
  xl: "calc(0.5rem + 4px)"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.stage-violet}"
    textColor: "{colors.stage-violet-ink}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "{colors.stage-violet}"
    textColor: "{colors.stage-violet-ink}"
    rounded: "{rounded.lg}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.lg}"
  input-field:
    backgroundColor: "{colors.stage-violet-ink}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    height: "2.75rem"
    padding: "0 0.75rem"
---

# Design System: umbra

## Overview

**Creative North Star: "The Dimmed Venue"**

umbra is a product UI for singing along, not a marketing site. Chrome stays quiet; the lyric stage carries the room. Surfaces read like a karaoke booth after lights-down: tinted neutrals, one violet accent, legible type at arm's length. Density is comfortable, not dashboard-dense. Motion follows the active line and playback state, never page-load theater.

The system rejects generic SaaS dashboards, cream marketing pages, decorative glass cards, hero metric layouts, and busy landing-page scaffolding. It is not a lyrics database admin tool.

**Key Characteristics:**

- Lyrics-first hierarchy on the player route
- OKLCH tokens with per-theme palettes (20+ presets + custom builder)
- Single sans family (DM Sans) at fixed rem scale
- Tonal layering over decorative shadows
- Semantic status chips (synced, auto-timed, translated)
- WCAG AA contrast, visible focus rings, reduced-motion fallbacks

## Colors

Default palette character: cool violet stage lighting on charcoal floors, magenta accent for primary actions and karaoke highlight.

### Primary

- **Stage Violet** (oklch(0.72 0.28 320)): Primary buttons, seek bar accent, active karaoke highlight, focus rings. The one saturated voice in the UI.
- **Stage Violet Ink** (oklch(0.12 0.02 280)): Text on primary buttons in dark themes.

### Neutral

- **Stage Floor** (oklch(0.1 0.025 280)): Karaoke stage background behind lyric lines.
- **Surface Card** (oklch(0.16 0.025 280)): Transport bar, cards, elevated panels.
- **Surface Muted** (oklch(0.22 0.03 280)): Secondary fills, segmented control selection, chip backgrounds.
- **Ink Primary** (oklch(0.95 0.01 280)): Headings, active labels, lyric text on dark stages.
- **Ink Muted** (oklch(0.65 0.03 280)): Supporting copy, timestamps, helper text. Darkened on light themes for AA.
- **Border Subtle** (oklch(0.28 0.03 280)): Dividers, input strokes, list separators.

### Karaoke (signature)

- **Lyric Active** (oklch(0.78 0.3 320)): Active line color and clip-reveal highlight.
- **Lyric Muted** (oklch(0.5 0.04 280)): Inactive lines on stage.
- **Lyric Unsung** (oklch(0.5 0.04 280 / 0.7)): Unsung portion of synced lines.

### Status

- **Status Success** (oklch(0.72 0.16 155)): "Synced" badge.
- **Status Warning** (oklch(0.78 0.14 75)): Approximate timing, line-count mismatch.
- **Status Info** (oklch(0.74 0.12 240)): Auto-timed, translated badges.

### Named Rules

**The Lyrics Star Rule.** Accent color and glow belong on the lyric stage and primary actions only. Never decorate chrome with saturated violet.

**The No Cream Rule.** Light themes use true off-white or cool tints, not warm sand/paper defaults. Warmth comes from accent and stage tokens, not body background.

## Typography

**Body Font:** DM Sans Variable (with DM Sans, system-ui fallback)
**Display Font:** Same family — product UI uses one sans throughout.

**Character:** Warm geometric sans, readable at distance, weight contrast instead of display pairing.

### Hierarchy

- **Page title** (600, 1.875rem, 1.2): Home, themes, builder headings. `text-balance` on heroes.
- **Track title** (600, 1rem, 1.25): Now-playing header on player.
- **Body** (400, 1rem, 1.5): Descriptions, errors, helper text. Max 65–75ch for prose blocks.
- **Label** (500, 0.875rem, 1.25): Section labels, form labels, badge text. Sentence case only.
- **Lyric active** (600, clamp 3rem–6rem, 1.1): Active karaoke line on large screens; capped at 6rem.
- **Lyric inactive** (600, clamp 1rem–1.65rem, 1.375): Context lines above/below active.

### Named Rules

**The One Family Rule.** Do not introduce a second display typeface. Hierarchy is size and weight, not font pairing.

**The Six Rem Ceiling Rule.** Active lyric clamp max is 6rem. Larger reads comical on desktop stages.

## Elevation

Flat-by-default product surfaces. Depth comes from background shifts (`bg-card` on `bg-background`, `bg-karaoke-stage-bg` behind lyrics), not stacked shadows.

Popovers and dialogs may use a single shadow (`shadow-md` / `shadow-lg`) without an additional decorative border on the same element. Cards use border OR tonal fill, not border plus wide blur shadow.

### Shadow Vocabulary

- **Popover** (`shadow-md`): Dropdown menus, lyrics source picker.
- **Dialog** (`shadow-lg`): Paste lyrics modal only.

### Named Rules

**The No Ghost Card Rule.** Never pair `border: 1px solid` with a soft wide drop shadow on the same card or button. Pick one treatment.

## Components

### Buttons

- **Shape:** Gently rounded (0.5rem / `rounded-md`). Play control is circular (`rounded-full`, 44px).
- **Primary:** Stage violet fill, ink foreground. Hover: 90% opacity.
- **Outline:** Border input color, background transparent. Hover: accent fill.
- **Ghost:** No border. Hover: accent fill. Icon buttons 44×44px minimum.
- **Focus:** 2px ring using `--ring` token. Never remove without replacement.

### Segmented control

- **Style:** Bordered pill group (`border-input`, `p-0.5`). Selected segment uses `bg-secondary`.
- **Use:** Lyric display mode (Native / English / Both). Replaces native `<select>`.

### Cards / Containers

- **Corner style:** 0.5rem (`rounded-lg`). No 24px+ card radii.
- **Background:** `bg-card` or `bg-muted/30` for informational panels.
- **Border:** Single `border-border` when needed. No nested card-in-card layouts.
- **Padding:** 0.75–1rem internal; 1.5rem for page sections.

### Inputs / Fields

- **Style:** 44px min height, `border-input`, `rounded-md`, placeholder in `muted-foreground`.
- **Focus:** Ring via `--ring`. No glow stacks.
- **Color picker:** Theme builder uses native color input + OKLCH code display.

### Navigation

- **App shell:** Top bar, brand link left, theme toggle right. `border-b` separator only.
- **Player subnav:** Text link "Back home", muted default, foreground on hover.
- **Themes:** Back link with arrow icon, sentence-case section headings.

### Karaoke stage (signature)

- **Stage floor:** `--karaoke-stage-bg` full-bleed scroll region.
- **Active line:** Scale 1.04 (desktop), clip-path word progress (not gradient text), optional soft text-shadow glow on active line only.
- **Inactive lines:** Reduced opacity and scale via motion spring; blur max 2px for far lines.
- **Section labels:** Small sentence-case labels, not uppercase eyebrows.

### Dialogs

- **Paste lyrics:** Native `<dialog>` with `::backdrop` scrim. Shadow only, no border+shadow pair.
- **Shortcuts:** Radix dropdown, not modal.

### Badges

- **Sync status:** Rounded-full chips using semantic success/warning/info tokens at 15% opacity background.
- **Source chip:** Muted border pill for provider name.

## Do's and Don'ts

### Do:

- **Do** keep lyrics as the largest, highest-contrast element on the player screen.
- **Do** use semantic tokens (`primary`, `muted-foreground`, `karaoke-*`, `success`, `warning`, `info`) instead of raw Tailwind color names.
- **Do** respect `prefers-reduced-motion`: instant clip reveal, no blur choreography, reduced scroll animation.
- **Do** use portal-based dropdowns (Radix) for menus that must escape overflow containers.
- **Do** label every interactive control with verb + object ("Save theme", "Hide video", "Retry all sources").

### Don't:

- **Don't** build generic SaaS dashboards, cream marketing pages, decorative glass cards, hero metric layouts, or busy landing-page scaffolding.
- **Don't** use gradient text (`background-clip: text`) for decoration or karaoke progress; use clip-path dual-layer reveal.
- **Don't** use `backdrop-blur` on transport bars or loading overlays.
- **Don't** use uppercase tracked eyebrows on every section ("DARK STAGES", "YOUR THEMES").
- **Don't** exceed 6rem on active lyric clamp max.
- **Don't** pair 1px borders with wide soft shadows on the same element.
- **Don't** use nested cards for related metadata; use one panel with dividers.
- **Don't** use native `<select>` where a segmented control matches the button vocabulary.
