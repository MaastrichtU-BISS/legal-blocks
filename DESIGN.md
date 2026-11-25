---
# gstack: design-md-format=spec
name: Legal Blocks
description: Friendly coral and teal on clean white, quiet chrome framing the pipeline.
colors:
  primary: "#C9443A"
  on-primary: "#FFFFFF"
  surface: "#F9FAFB"
  ground: "#FFFFFF"
  text: "#1F2937"
  text-muted: "#6B7280"
  rule: "#E5E7EB"
  accent-live: "#E85A4F"
  accent-live-fill: "#C9443A"
  accent-live-fill-hover: "#B93C33"
  field-edge: "#858C97"
  accent-interactive: "#0F766E"
  accent-success: "#10B981"
  success: "#10B981"
  warning: "#F59E0B"
  error: "#C9443A"
typography:
  display:
    fontFamily: Cabinet Grotesk
    fontWeight: 700
    fontSize: clamp(32px, 4.2vw, 56px)
    letterSpacing: -0.02em
  body:
    fontFamily: DM Sans
    fontSize: 1rem
    lineHeight: 1.6
  label:
    fontFamily: DM Sans
    fontSize: 0.8125rem
    fontWeight: 600
    letterSpacing: 0
    textTransform: none
  mono:
    fontFamily: JetBrains Mono
    fontFeature: tnum
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
  button-primary-hover:
    backgroundColor: "{colors.accent-live-fill-hover}"
  button-secondary:
    backgroundColor: "{colors.accent-interactive}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
  input:
    borderColor: "{colors.field-edge}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
  nav-link:
    textColor: "{colors.text}"
---

# Legal Blocks

## Overview

**Creative North Star:** Friendly and inviting — soft coral and teal on clean white, gentle rounded shapes, warm type. Approachable to non-technical users; calm, not loud.

**Product context:** Legal Blocks composes applications out of existing packages. The composer designs an application (a session pipeline or an application with persistent data); the platform runs it. Audience: developers and researchers (legal/annotation research). Project type: web app (Nuxt 4 / Vue 3), two apps sharing one layer.

**Mode per surface:** Composer = Operate (designing applications and pipelines). Platform = Operate (annotating, reviewing, measuring agreement).

**Reference sites:** Retool IDE, n8n editor, Label Studio, Hypothesis, CVAT.

**Key characteristics:** White ground with a soft gray surface for chrome; coral for the primary action and the live pipeline; teal for interaction; soft 8/12/16px corners; DM Sans labels, mono only for data; a horizontal pipeline canvas; motion reserved for state.

## Colors

**Strategy:** Restrained two-accent. Coral marks the one primary action on a screen, the chosen tab, the chosen step and the pipeline's flow; teal marks interaction (links, hover, focus, secondary actions such as "Add"). Calm, friendly, not loud. Every text pairing meets WCAG AA.

**Light or dark:** Light by default, with an optional dark mode (soft charcoal ground). Toggleable per surface.

- `accent-live` (#E85A4F) soft coral — coral as a line, dot, arrow or border: the chosen step's ring, pipeline arrows. Never a fill under text (white on it is 3.5:1).
- `primary` / `accent-live-fill` (#C9443A) deeper coral — the fill of primary buttons and the chosen tab, with white text at 4.8:1. Hover: #B93C33.
- `accent-interactive` (#0F766E) teal — links, focus rings, secondary actions. Darkened from #0D9488 (3.7:1 on white) to 5.5:1 so it can be text.
- `field-edge` (#858C97) — input borders, 3:1 against the page so a field reads as a field.
- `accent-success` (#10B981) emerald — success, completed states.
- Neutrals are soft grays; accents are muted but distinct. No yellow.

**Dark mode:** optional. Dark uses soft charcoal surfaces (#0F1115 / #1A1D23) with off-white text; accents shift lighter for contrast (coral #F06A5F, teal #2DD4BF, emerald #34D399). Toggle is Light / Dark / System, persisted per browser. Modules keep their own styling.

## Typography

- **Display — Cabinet Grotesk** (Fontshare; load it from `api.fontshare.com`, Google Fonts does not serve it): modern, friendly, slightly geometric. Warm but not childish. Used for headlines and the memorable first impression.
- **Body — DM Sans** (Google Fonts): clean, highly legible, neutral-warm. UI text and body copy.
- **Labels** (section labels, field labels, table heads, nav links): DM Sans 13px / 600, sentence case, untracked. Never uppercase or letter-spaced.
- **Mono — JetBrains Mono** (Google Fonts): data and code only: ports (corpus@1), hints that name ports, code samples. Tabular numerals via `tnum`.

Scale: display 32–56px / 700 (56px only on the landing hero); section heads 24–44px; body 16px / 400 (the root size, so `rem` is 16px); labels 13px / 600. Generous, readable.

## Layout

- Breakpoints: 375 / 768 / 1024 / 1280.
- Max content width: 1120px on the landing (one container for every section), 900px on Docs and Projects; headers run full width; the composer is full-bleed.
- Density: moderate. Spacing rhythm 4/8/16/24/32/48.
- Chrome (palette, settings, forms) is grid-disciplined; the pipeline canvas is a creative-editorial horizontal flow.

## Elevation & Depth

- Depth via 1px borders on the white ground. Shadows are at most a 1–2px soft shadow on controls and nodes, and a light coral shadow under primary buttons; never a large drop shadow or a hard offset shadow.
- The chosen node gets a coral border and a 1px coral ring (box-shadow 0 0 0 1px).
- No zero-offset glow; no radial halos.

## Shapes

- Radius hierarchy: sm 8px (buttons, inputs), md 12px (cards), lg 16px (panels). Soft, friendly, approachable.
- Nested inner radius = outer radius − gap.

## Components

- **Button:** 8px radius, 1px border, 8/20px padding, 14px / 600. Primary = coral fill; secondary = teal fill; default = surface with a rule border. Disabled = gray fill, gray ink, not-allowed cursor (never opacity alone).
- **Input:** 8px radius, 1px `field-edge` border, label above.
- **Node (pipeline step):** 8px radius, 1px border, icon + title + package id in muted body text. The whole card is a button; chosen = coral border + ring, never a coral fill.
- **Connector:** a coral → between steps. A flowing coral dot along a 2px rule (`.lb-connector`) is defined in the base stylesheet but not yet used.
- **Card:** 12px radius, surface background, 1px border. No nested cards.
- **Nav link:** text only, no border or fill; hover turns it teal; the current page has a 2px teal underline.
- **Status:** a label in words. A pulse dot (`.status-dot`) is allowed only next to a label for a real running state, never as decoration.

## Do's and Don'ts

- Do: use coral for one primary action per screen, the chosen tab or step, and the pipeline; teal for everything interactive.
- Do: keep chrome quiet so the canvas is the loud element.
- Do: respect prefers-reduced-motion (static dots, no pulse).
- Do: meet AA: white text only on `accent-live-fill` (#C9443A) or teal (#0F766E); in dark mode, dark text on the lighter accents.
- Don't: use colored status badges/pills — use motion + label.
- Don't: nest cards.
- Don't: use purple/indigo gradients, 3-column feature grids, centered everything, decorative blobs, icon tiles above headings.
- Don't: use system-ui or -apple-system as primary display/body font.

## Motion & Interaction

- **Approach:** motion is state, never decoration: hover, press, focus and the pipeline's flow. Animate `transform` and `opacity` only.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms) long(400-700ms)
- **The one authored moment (planned):** dots flowing along pipeline connectors while a platform assembles. The styles exist (`.lb-connector`, `.status-dot`); the composer does not use them yet.
- **Hover:** nodes lift 1px and take a teal border; buttons shift border and text to teal; primary buttons deepen.
- **Press:** buttons move down 1px.
- **Focus:** an instant 2px teal outline, 2px offset, on every focusable element; never transitioned.
- **Empty states:** centered headline + guidance + shortcut hint; never a bare "no data".
- **Keyboard:** Escape deselects; arrow keys move between steps in a pipeline.
- **Respects prefers-reduced-motion:** all animation disabled; static indicators remain.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-23 | Initial design system created | Created by /design-consultation based on product context + research + Claude subagent direction ("Living Paper Schematic") |
| 2026-11-17 | Hallmark polish: tokens moved to `layers/base/app/assets/tokens.css`; deeper coral fill and teal for AA contrast; field edge token; Cabinet Grotesk from Fontshare; labels in DM Sans sentence case; focus as an instant 2px teal outline; disabled shown by fill, ink and cursor | The audit found white on coral at 3.5:1, the display face never loading, and `--danger` resolving to nothing in light mode |
| 2026-11-17 | Removed contradictions: soft 8/12/16px corners (not 2px), DM Sans sentence-case labels (not mono), coral for primary action and chosen state as well as the pipeline, teal focus (not blue), real hover colours, Nuxt 4, content widths, connector and pulse marked as planned | The doc described an earlier "Living Paper Schematic" direction in places; it now describes what ships |
