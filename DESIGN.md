---
# gstack: design-md-format=spec
name: Legal Blocks
description: A living schematic — quiet industrial chrome framing a breathing pipeline.
colors:
  primary: "#E3000B"
  on-primary: "#FFFFFF"
  surface: "#F5F5F5"
  ground: "#FFFFFF"
  text: "#1A1A1A"
  text-muted: "#6B7280"
  rule: "#E5E7EB"
  accent-live: "#E3000B"
  accent-interactive: "#0057A3"
  accent-warm: "#FFD500"
  accent-success: "#00852B"
  success: "#00852B"
  warning: "#FFD500"
  error: "#E3000B"
typography:
  display:
    fontFamily: Nunito
    fontWeight: 800
    fontSize: clamp(28px, 4vw, 40px)
    letterSpacing: -0.01em
  body:
    fontFamily: Nunito Sans
    fontSize: 1rem
    lineHeight: 1.5
  label:
    fontFamily: Nunito Sans
    fontSize: 0.75rem
    letterSpacing: 0.04em
  mono:
    fontFamily: JetBrains Mono
    fontFeature: tnum
rounded:
  sm: 0px
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

**Creative North Star:** Playful blocks — bright primary colors on clean white, chunky blocky shapes, friendly type. Lego-inspired: every module is a brick you snap into place.

**Product context:** Legal Blocks composes platforms out of existing packages. A composer designs a platform (pipeline or workspace); the platform runs it. Audience: developers and researchers (legal/annotation research). Project type: web app (Nuxt 3 / Vue 3), two apps sharing one layer.

**Mode per surface:** Composer = Operate (designing pipelines). Platform = Operate (annotating, reviewing, measuring agreement).

**Reference sites:** Retool IDE, n8n editor, Label Studio, Hypothesis, CVAT.

**Key characteristics:** Cool paper ground; vermillion as the single live-flow accent; sharp 2px corners; monospace labels; horizontal breathing pipeline canvas; motion reserved for assembly status.

## Colors

**Strategy:** Full palette — primary Lego red for CTAs, Lego blue for interaction, Lego yellow for highlights, Lego green for success. Bright primaries on clean white, like a box of bricks.

**Light or dark:** Light. Playful, inviting, high-contrast. White ground, near-black ink, bright primary accents.

- `primary` (#E3000B) Lego red — primary CTAs and the "live flow" accent. The one color that owns the action.
- `accent-interactive` (#0057A3) Lego blue — links, focus rings, secondary actions.
- `accent-warm` (#FFD500) Lego yellow — highlights, badges, warnings.
- `accent-success` (#00852B) Lego green — success, completed states.
- Neutrals are pure white/gray; primaries carry all the energy.

## Typography

- **Display — Nunito** (Google Fonts): rounded, friendly, playful. Bold 800 for headlines. Carries the Lego-box energy.
- **Body — Nunito Sans** (Google Fonts): clean, legible, warm. UI text and body copy.
- **Label/Mono — JetBrains Mono** (Google Fonts): data, code, ports (corpus@1), step labels. Tabular numerals via `tnum`.

Scale: display 28–40px / 800; body 16px / 400; label 12px tracked. Friendly, not tiny.

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

- Radius hierarchy: sm 0px (buttons, inputs, bricks — blocky), md 4px (cards), lg 8px (panels). Sharp corners reinforce the Lego-block feel.
- Nested inner radius = outer radius − gap.

## Components

- **Button:** blocky 0px radius, 2px border, 10/18px padding. Primary = Lego red; interactive = Lego blue; warm = Lego yellow. Bold, chunky.
- **Input:** 0px radius (blocky), 2px rule border, friendly label above.
- **Node (pipeline):** 4px radius (brick), 2px border, title + mono port label. Active state: Lego red border + ring.
- **Connector:** 2px rule line with animated Lego red dot (flow). Respects prefers-reduced-motion.
- **Card:** 4px radius (brick), surface background, 2px border. No nested cards.
- **Status:** motion + label + color. Pulse dot for "assembling". Playful, not subtle.

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