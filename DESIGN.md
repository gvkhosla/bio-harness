---
name: Bio Harness evidence workbench
description: A source-linked scientific evidence ledger
colors:
  paper: "#f5f7f8"
  surface: "#ffffff"
  ink: "#182d38"
  muted: "#50626e"
  rule: "#cdd7dd"
  accent: "#08645a"
  accent-soft: "#e4f2ed"
  warning: "#79510a"
  warning-soft: "#fff2d9"
  danger: "#98342a"
  danger-soft: "#fff0ee"
  focus: "#1262af"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "clamp(25px, 2.35vw, 34px)"
    fontWeight: 650
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  title:
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: 1.55
  label:
    fontSize: "12px"
rounded:
  control: "5px"
  surface: "6px"
  well: "3px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
---

# Design System: Bio Harness

## Overview

**Creative North Star: "The evidence ledger"**

A precise, light scientific review surface for a laptop in a meeting room. Evidence occupies the largest working region; visual emphasis distinguishes observations, local judgments, and permitted actions. This is an operating interface, not a promotional display page.

**Key Characteristics:**

- Dense, inspectable measurements.
- Restrained color with explicit state labels.
- Source provenance alongside interpretation.
- No network fonts, decorative imagery, or unnecessary motion.

## Colors

Teal identifies actions and selected conditions. Cool paper, white surfaces, slate text, and thin neutral dividers establish hierarchy. Plum intensity encodes measured concentration; it is not a quality score. Amber identifies source flags and red identifies the injected failure scenario.

**The State Has Words Rule.** Color always has a label, marker, or equivalent inspectable explanation.

## Typography

The workbench uses the system UI stack with tabular numerals for measurement comparison. Titles are compact; long lines stay within a 72-character measure. Monospace appears only for actual source hashes. Plate-coordinate labels use 11px type; the adjacent measurement inspector and table provide larger readable values.

## Layout

The working area has context, evidence, and inspection regions within a 1640px maximum container. At widths below 1150px, context moves above the two work regions. Below 760px, regions stack and the plate remains locally scrollable rather than shrinking its controls. The page itself must not overflow horizontally.

The plate uses 16 rows and 24 columns with a minimum 24px well target and 3px gaps. A roving tab stop and arrow-key navigation avoid requiring hundreds of Tab presses.

## Elevation & Depth

Flat surfaces, no shadows. A white evidence plane and thin border separate the plate from its cool-paper background. Selection uses outlines rather than simulated physical depth.

## Shapes

Softly squared controls and surfaces. Well geometry remains consistent; measurement magnitude never changes target size. Borders are structural, not decorative framing around every paragraph.

## Components

### Buttons and fields

Actions have at least 42px height except dense data-navigation controls. Disabled actions include a visible reason. Keyboard focus uses a 3px focus-color outline with a 3px offset. Scenario controls expose pressed state in both text context and accessibility attributes.

### Plate

A semantic table contains named well buttons. Selecting a condition outlines all its replicates; the active well has a distinct focus-colored outline. Every measured value, source flag, and injected marker is available through accessible names and the inspector. Selection transitions are brief and disabled under reduced motion.

### Evidence tables and inspector

Right-aligned tabular measurements, explicit units, visible eligible counts, and named exclusions. Clickable condition names are conventional underlined text buttons. A selected observation is a detail pane, never an interrupting modal.

## Do's and Don'ts

- **Do** preserve units, flags, provenance, and explicit uncertainty near the measurements.
- **Do** use visible labels alongside state colors.
- **Do** keep the source record and injected demonstration state distinct.
- **Don't** imply a live order, provider-qualified QC, or approval through visual treatment.
- **Don't** use decorative scientific imagery in place of inspectable evidence.
- **Don't** shrink the entire plate to fit a phone; preserve operable wells and local scrolling.
