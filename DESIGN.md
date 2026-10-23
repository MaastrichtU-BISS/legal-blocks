---
# gstack: design-md-format=spec
name: Legal Blocks
description: A living schematic — quiet industrial chrome framing a breathing pipeline.
colors:
  primary: "#E85A4F"
  on-primary: "#FFFFFF"
  surface: "#F9FAFB"
  ground: "#FFFFFF"
  text: "#1F2937"
  text-muted: "#6B7280"
  rule: "#E5E7EB"
  accent-live: "#E85A4F"
  accent-interactive: "#0D9488"
  accent-success: "#10B981"
  success: "#10B981"
  warning: "#F59E0B"
  error: "#E85A4F"
typography:
  display:
    fontFamily: Cabinet Grotesk
    fontWeight: 700
    fontSize: clamp(32px, 4vw, 48px)
    letterSpacing: -0.02em
  body:
    fontFamily: DM Sans
    fontSize: 1rem
    lineHeight: 1.6
  label:
    fontFamily: DM Sans
    fontSize: 0.8125rem
    letterSpacing: 0.02em
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

**Creative North Star:** Friendly and inviting — soft coral and teal on clean white, gentle rounded shapes, warm type. Approachable to non-technical users; calm, not loud.

**Product context:** Legal Blocks composes platforms out of existing packages. A composer designs a platform (pipeline or workspace); the platform runs it. Audience: developers and researchers (legal/annotation research). Project type: web app (Nuxt 3 / Vue 3), two apps sharing one layer.

**Mode per surface:** Composer = Operate (designing pipelines). Platform = Operate (annotating, reviewing, measuring agreement).

**Reference sites:** Retool IDE, n8n editor, Label Studio, Hypothesis, CVAT.

**Key characteristics:** Cool paper ground; vermillion as the single live-flow accent; sharp 2px corners; monospace labels; horizontal breathing pipeline canvas; motion reserved for assembly status.

## Colors

**Strategy:** Restrained two-accent — soft coral for primary actions, teal for interaction. Calm, friendly, not loud. High contrast without harshness.

**Light or dark:** Light. Clean white ground, soft gray surfaces, warm coral CTAs, teal links.

- `primary` / `accent-live` (#E85A4F) soft coral — primary CTAs and the "live flow" accent. Warm, inviting, not aggressive.
- `accent-interactive` (#0D9488) teal — links, focus rings, secondary actions.
- `accent-success` (#10B981) emerald — success, completed states.
- Neutrals are soft grays; accents are muted but distinct. No yellow.

## Typography

- **Display — Cabinet Grotesk** (Fontshare): modern, friendly, slightly geometric. Warm but not childish. Used for headlines and the memorable first impression.
- **Body — DM Sans** (Google Fonts): clean, highly legible, neutral-warm. UI text and body copy.
- **Label/Mono — JetBrains Mono** (Google Fonts): data, code, ports (corpus@1), step labels. Tabular numerals via `tnum`.

Scale: display 32–48px / 700; body 16px / 400; label 13px tracked. Generous, readable.

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

- Radius hierarchy: sm 8px (buttons, inputs), md 12px (cards), lg 16px (panels). Soft, friendly, approachable.
- Nested inner radius = outer radius − gap.

## Components

- **Button:** 8px radius, 1px border, 10/20px padding. Primary = coral; interactive = teal. Soft, friendly, with subtle shadow (not chunky).
- **Input:** 8px radius, 1px rule border, friendly label above.
- **Node (pipeline):** 12px radius, 1px border, title + mono port label. Active state: coral border + soft ring.
- **Connector:** 2px rule line with animated coral dot (flow). Respects prefers-reduced-motion.
- **Card:** 12px radius, surface background, 1px border, subtle shadow. No nested cards.
- **Status:** motion + label + color. Pulse dot for "assembling". Gentle, not loud.

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