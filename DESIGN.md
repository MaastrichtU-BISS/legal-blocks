---
# gstack: design-md-format=spec
name: Legal Blocks
description: A living schematic — quiet industrial chrome framing a breathing pipeline.
colors:
  primary: "#13171F"
  on-primary: "#EAEFF5"
  surface: "#F4F7FB"
  ground: "#EAEFF5"
  text: "#13171F"
  text-muted: "#5B6370"
  rule: "#C9D2DE"
  accent-live: "#E63946"
  accent-interactive: "#2563EB"
  success: "#2A8F5B"
  warning: "#C97A1A"
  error: "#C0392B"
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontWeight: 600
    fontSize: clamp(24px, 3vw, 32px)
    letterSpacing: -0.01em
  body:
    fontFamily: Manrope
    fontSize: 0.875rem
    lineHeight: 1.5
  label:
    fontFamily: IBM Plex Mono
    fontSize: 0.6875rem
    letterSpacing: 0.06em
  mono:
    fontFamily: IBM Plex Mono
    fontFeature: tnum
rounded:
  sm: 2px
  md: 4px
  lg: 8px
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
    backgroundColor: "#1F2530"
  button-live:
    backgroundColor: "{colors.accent-live}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
  input:
    borderColor: "{colors.rule}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
  nav-link:
    textColor: "{colors.text}"
---

# Legal Blocks

## Overview

**Creative North Star:** A living schematic — quiet industrial chrome framing a breathing pipeline.

**Product context:** Legal Blocks composes platforms out of existing packages. A composer designs a platform (pipeline or workspace); the platform runs it. Audience: developers and researchers (legal/annotation research). Project type: web app (Nuxt 3 / Vue 3), two apps sharing one layer.

**Mode per surface:** Composer = Operate (designing pipelines). Platform = Operate (annotating, reviewing, measuring agreement).

**Reference sites:** Retool IDE, n8n editor, Label Studio, Hypothesis, CVAT.

**Key characteristics:** Cool paper ground; vermillion as the single live-flow accent; sharp 2px corners; monospace labels; horizontal breathing pipeline canvas; motion reserved for assembly status.

## Colors

**Strategy:** Restrained — one accent (vermillion) for live flow, neutrals derived from a cool blue-gray. Color on the canvas is reserved for live flow only.

**Light or dark:** Light. Research and annotation work happens in bright offices; the canvas is the only dark-ish contrast surface (cool paper ground #EAEFF5 vs. ink #13171F).

- `accent-live` (#E63946) signals live flow and active assembly. Never used for static decoration.
- `accent-interactive` (#2563EB) for links and focus rings.
- Neutrals derive from the cool paper ground; hierarchy via ink/muted/rule.
- Dark-mode surfaces preserve hierarchy by shifting ground/surface lightness, not inverting.

## Typography

- **Display — Bricolage Grotesque** (Google Fonts): quirky geometric grotesk; carries the indie-studio voice. Used for page titles and the memorable first impression.
- **Body — Manrope** (Google Fonts): humanist, legible at small sizes. UI text and body copy.
- **Label/Mono — IBM Plex Mono** (Google Fonts): data, code, ports (corpus@1), step labels, settings field labels. Tabular numerals via `tnum`.

Scale: display 24–32px / 600; body 14px / 400; label 11px uppercase tracked.

## Layout

- Breakpoints: 375 / 768 / 1024 / 1280.
- Max content width: 1280px; composer canvas is full-bleed horizontal.
- Density: moderate. Spacing rhythm 4/8/16/24/32/48.
- Chrome (palette, settings, forms) is grid-disciplined; the pipeline canvas is a creative-editorial horizontal flow.

## Elevation & Depth

- Depth via 1px borders on cool paper ground. No drop shadows as default.
- Active node gets a 1px vermillion ring (box-shadow 0 0 0 1px).
- No zero-offset glow; no radial halos.

## Shapes

- Radius hierarchy: sm 2px (buttons, inputs, nodes), md 4px (cards), lg 8px (panels). Sharp corners reinforce the industrial/utilitarian feel.
- Nested inner radius = outer radius − gap.

## Components

- **Button:** sharp 2px radius, 1px border, 8/14px padding. Primary = ink ground; live = vermillion; ghost = transparent.
- **Input:** 2px radius, 1px rule border, monospace uppercase label above.
- **Node (pipeline):** 2px radius, 1px border, title + mono port label. Active state: vermillion border + ring.
- **Connector:** 2px rule line with animated vermillion dot (flow). Respects prefers-reduced-motion (dot static).
- **Card:** 4px radius, surface background, 1px border. No nested cards.
- **Status:** motion + label, never color alone. Pulse dot for "assembling".

## Do's and Don'ts

- Do: use vermillion only for live flow/assembly status.
- Do: keep chrome quiet so the canvas is the loud element.
- Do: respect prefers-reduced-motion (static dots, no pulse).
- Do: ensure AA contrast (vermillion on cool paper — verify; use ink text on vermillion buttons).
- Don't: use colored status badges/pills — use motion + label.
- Don't: nest cards.
- Don't: use purple/indigo gradients, 3-column feature grids, centered everything, decorative blobs, icon tiles above headings.
- Don't: use system-ui or -apple-system as primary display/body font.

## Motion & Interaction

- **Approach:** intentional — the assembly pulse is the one authored moment; everything else is micro-interaction (hover lift, focus ring, transition).
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms) long(400-700ms)
- **The one authored moment:** animated dots flowing along pipeline connectors + breathing pulse on the active node, communicating assembly status.
- **Hover:** cards and nodes lift 1px with a soft shadow; buttons shift border/text color.
- **Focus:** 2px interactive-blue ring on all focusable elements (keyboard accessibility).
- **Empty states:** centered headline + guidance + shortcut hint; never a bare "no data".
- **Keyboard:** Escape deselects; arrow keys move between steps in a pipeline.
- **Respects prefers-reduced-motion:** all animation disabled; static indicators remain.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-23 | Initial design system created | Created by /design-consultation based on product context + research + Claude subagent direction ("Living Paper Schematic") |