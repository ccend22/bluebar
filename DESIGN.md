---
name: BlueBar
description: Simple, practical restaurant POS for bars, cafés and restaurants in Albania.
colors:
  action-blue: "#0867c9"
  action-blue-hover: "#0077ed"
  action-blue-strong: "#0057ad"
  action-blue-soft: "#eaf3fd"
  brand-navy: "#174e65"
  parchment: "#f4f6f8"
  surface: "#ffffff"
  ink: "#1d1d1f"
  ink-app: "#202428"
  muted: "#697078"
  line: "#dfe4e8"
  occupied-green: "#27654f"
  occupied-green-soft: "#e8f4ee"
  lp-night: "#0b0c0d"
  lp-night-raised: "#121416"
  lp-seam: "#23262a"
  lp-steel: "#2a2d31"
  lp-clip: "#4a4f56"
  lp-screen-hairline: "#2c3035"
  lp-paper: "#f4f1ea"
  lp-paper-ink: "#16130f"
  lp-muted: "#a9a49b"
  lp-bell: "#ff5a1f"
  lp-bell-hot: "#ff7a45"
typography:
  app-body:
    fontFamily: "SF Pro Text, -apple-system, BlinkMacSystemFont, system-ui, Segoe UI, sans-serif"
    fontSize: "14px"
  lp-display:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(46px, 5.6vw, 88px)"
    fontWeight: 850
    lineHeight: 1.02
    fontVariation: "\"wdth\" 72"
  lp-headline:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(36px, 4.4vw, 64px)"
    fontWeight: 850
    lineHeight: 1.02
    fontVariation: "\"wdth\" 72"
  lp-label:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    letterSpacing: "0.02em"
    fontVariation: "\"wdth\" 85"
  lp-body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "17px"
    lineHeight: 1.6
  lp-print:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "14px"
    lineHeight: 1.5
rounded:
  pill: "9999px"
  app-card: "16px"
  app-control: "10px"
  lp-cta: "6px"
  lp-rail: "2px"
  lp-clip: "3px"
  lp-screen-phone: "16px"
  lp-screen-wide: "12px"
spacing:
  lp-gutter: "clamp(16px, 5vw, 72px)"
  lp-section: "clamp(64px, 8vw, 120px)"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-hover}"
  lp-cta:
    backgroundColor: "{colors.lp-bell}"
    textColor: "{colors.lp-night}"
    typography: "{typography.lp-label}"
    rounded: "{rounded.lp-cta}"
    padding: "0 30px"
    height: "56px"
  lp-cta-hover:
    backgroundColor: "{colors.lp-bell-hot}"
  lp-cta-small:
    backgroundColor: "{colors.lp-bell}"
    textColor: "{colors.lp-night}"
    rounded: "{rounded.lp-cta}"
    padding: "0 16px"
    height: "40px"
  lp-rail:
    backgroundColor: "{colors.lp-steel}"
    rounded: "{rounded.lp-rail}"
    height: "14px"
  lp-sheet:
    backgroundColor: "{colors.lp-paper}"
    textColor: "{colors.lp-paper-ink}"
    typography: "{typography.lp-print}"
    padding: "26px 18px 24px"
    width: "clamp(200px, 19.5vw, 300px)"
  lp-sheet-wide:
    backgroundColor: "{colors.lp-paper}"
    textColor: "{colors.lp-paper-ink}"
    typography: "{typography.lp-print}"
    width: "min(340px, 100%)"
  lp-screen:
    backgroundColor: "{colors.lp-night-raised}"
    rounded: "{rounded.lp-screen-wide}"
---

# BlueBar design

BlueBar has two worlds, kept apart on purpose. The app (everything behind sign-in) is **Operate**: light, Apple-derived, quiet. The public landing at "/" is **Persuade**: "Shina e kuzhinës", the kitchen pass at night. Tokens prefixed `lp-` belong to the landing only and never enter the app; app tokens never appear on the landing except BlueBar's navy "b." mark. The frontmatter is normative for both.

# App (Operate)

Mode: Operate. Simple, practical restaurant POS. No external fonts or heavy UI libraries. Motion is functional only: press feedback (scale .97), ≤200ms colour transitions and the payment dialog entrance; hover styles apply to hover-capable pointers only; reduced motion is respected.

## Shared system
Apple-derived (awesome-design-md/apple): SF/system sans, ink #1d1d1f on parchment #f5f5f7, one Action Blue (#0066cc) for actions, selection and focus, pill CTAs/tabs/chips/search, 18px cards and 11px controls, hairline borders, no card shadows, frosted sticky top bar and blurred dialog backdrop, green occupied/positive states, amber attention states and red errors. Status always has a text label. Shared fields, search, badges, section headings and empty states in src/components.jsx. Consistent authored SVG icons; no runtime icon library. Visible keyboard focus, skip link, native form validation and a native modal dialog for payment review. Amounts use tabular numerals. Dates have explicit Albanian month names and 24-hour time.

## Navigation and layout
White persistent left navigation on desktop, with six visible icon/text destinations on mobile. Main page title, description and contextual action use a consistent hierarchy. Management pages pair working lists with supporting forms on wide screens and stack on smaller screens. Data tables turn into labeled records on phones. Search and filters offer recovery from empty results.

The operating display may be a touchscreen desktop. Coarse-pointer devices get at least 48px controls for frequent actions, including quantity changes, filters, icon buttons and floor-plan edit handles. Cash payment has an on-screen number pad on touch desktops. Mobile navigation shows icons above readable labels; the floor plan scrolls horizontally on narrow phones instead of shrinking tables into overlapping targets. Normal table taps allow page scrolling; dragging is reserved for floor-edit mode. Mobile form controls use 16px text to avoid browser focus zoom.

## Operational flows
Tables use zone and occupancy filters, visible amounts, waiter names and a simple table symbol. Desktop has an adjacent order panel; mobile focuses and scrolls directly to the order, hiding redundant page summary content. Availability deducts reservations from open orders. Cash payments have a review dialog with received amount and change; cards require explicit terminal confirmation. Dialog supports Escape and focus containment. Successful payment provides a direct print action.

Inventory exposes on-hand, reserved and available quantities. Products support creation and inline editing; categories are searchable via selection. Staff deactivation explains blocking conditions. Shift closure shows expected cash, counted cash and the live difference, and blocks closure while orders are open. Invoices support payment filtering and a separate receipt preview. Print CSS isolates a 72mm receipt region for an 80mm driver setting.

## Boundaries
Persistent demo disclosure. Roles come from the server session (both a 6-digit PIN); waiters are limited to order commands and the venue IP. Neon connectivity is real and status is shown in the interface; fiscalization remains unimplemented. Historical local demo data under bluebar-demo-v1 is not read or imported. Database loading, unavailable-state and pending-command recovery screens prevent false success on network failures.

## Verification
All six pages checked at 1440, 820 and 390px without document overflow. Browser flows verified for cash/change, cards, product edit/create, stock entry, staff creation, shift block/close/reopen, reload persistence and no-result recovery. Physical printing and production backend remain outside the prototype.

## Known drift (app)
The Shared system prose above predates the build and is not repaired here; the frontmatter wins. The app ground is #f4f6f8 (not #f5f5f7) and Action Blue is #0867c9 (not #0066cc); the primary button hovers to #0077ed. Card radius is 16px and control radius 10px (not 18px / 11px). #f5f5f7 still appears as two one-off values in src/style.css.

# Landing (Persuade): "Shina e kuzhinës"

Source: src/Landing.jsx, src/landing.css. Everything below applies to the landing only.

## Overview

**Creative North Star: "The Kitchen Pass at Night"**

The landing is the pass of a working kitchen after dark: a near-black room under one warm heat-lamp glow, a steel rail running across the page, and BlueBar's own thermal printouts clipped to it. The rail is the page's spine; each section gets its own full-width rail with a printout hanging from it. Proof is BlueBar's real printed formats (department tickets, the fiscal invoice, the shift report, the printer test slip) and real app screenshots, never drawn devices or invented numbers.

Dark, heavy, warm, literal. The one bright colour is the order-bell orange, and it only ever means "act". The display voice is a heavy condensed grotesque in uppercase, loud the way a kitchen order is loud; body copy stays in the system sans so reading is easy.

**Key Characteristics:**
- Near-black ground with warm radial lamp-light at the top of each section
- Steel rail as the spine; printouts hang from it on clips
- Thermal paper in monospace with dashed rules and a torn bottom edge
- Order-bell orange for actions, focus and selection only
- Archivo condensed uppercase display; system sans body
- Real app screenshots, flat, with a hairline
- Sheets drop onto the rail and swing on their clip

## Colors

A dark, warm-neutral room with one hot accent.

### Primary
- **Order-Bell Orange** (lp-bell): the Regjistro CTA, the CTA stripe on the closing "POROSI E RE" sheet, the 3px focus outline (4px offset) and text selection. Hover warms to **Bell Hot** (lp-bell-hot). Text on orange is Kitchen Night, never white.

### Neutral
- **Kitchen Night** (lp-night): page ground, also set on `html` so overscroll and the scrollbar track match.
- **Raised Night** (lp-night-raised): the backing behind screenshots.
- **Seam** (lp-seam): 1px hairline under the sticky bar and above the footer.
- **Rail Steel** (lp-steel): the rail. **Clip Steel** (lp-clip): the clip that grips rail and paper.
- **Screen Hairline** (lp-screen-hairline): the 1px border around screenshots.
- **Thermal Paper** (lp-paper): paper and, at the same value, headline and link ink on night. Paper carries a warm vertical gradient (#fbf5e9 → paper at 45% → #e9e2d3), the lamp falling on it.
- **Paper Ink** (lp-paper-ink): print on paper; dashed rules at 70% of it.
- **Ash** (lp-muted): body copy and the point-list dashes on night. Hero subline is a lighter #cfcac0.
- **Lamp Warmth** (rgba(255,150,70,0.2) in the hero; 0.12–0.14 on later sections): radial glow at the top of each rail section.

### Named Rules
**The Bell Rule.** Orange means act: CTAs, focus, selection. Never decoration, never a heading, never a background band.

**The One Blue Rule.** BlueBar's navy (brand-navy) appears on the landing only as the 30px "b." mark (8px radius) in the bar and footer. App Action Blue never appears here.

## Typography

**Display Font:** Archivo (self-hosted variable woff2, OFL, weights 100–900, widths 62–125%), fallback Arial Narrow, system-ui
**Body Font:** system sans (-apple-system, SF Pro Text, Segoe UI)
**Print Font:** system monospace (ui-monospace, SF Mono, Menlo, Consolas)

**Character:** A condensed, heavy kitchen-order shout over a calm, legible system sans; the printouts speak in the same monospace BlueBar actually prints.

### Hierarchy
- **Display** (lp-display; 850, font-stretch 72%, line-height 1.02, uppercase, balanced): hero h1. Below 981px it uses clamp(46px, 6vw, 96px). Closing h2 is clamp(40px, 6vw, 88px).
- **Headline** (lp-headline; same face and treatment): section h2s.
- **Label** (lp-label; 800, font-stretch 85%, 0.02em, uppercase): CTAs; 15px in the bar's small CTA, 17px in the sheet stripe.
- **Body** (lp-body; capped at 46–50ch, text-wrap pretty): section copy. Point lists are 15px/550 in thermal-paper colour with a 10×2px ash dash.
- **Print** (lp-print): everything on paper. Department name 22px with 0.04em tracking, item 16px bold, totals 16px/800. The receipt brand "BlueBar" stays in the sans at 26px, as on the real printout.

### Named Rules
**The Diacritic Room Rule.** Display and headline carry 0.06em top padding so Ç, Ë and cedillas never touch the line above at line-height 1.02.

**The Legible Print Rule.** Print never goes below 12px where it carries content; on phones the hero tickets print less (optional lines hidden) instead of printing smaller.

## Layout

A full-bleed dark page, gutter lp-gutter. Sticky bar: brand left, "Hyr" link and small orange CTA right, rgba(11,12,13,0.85) with saturate(140%) blur(14px), seam bottom, safe-area aware.

**Hero:** two-column grid (1.3fr / 1fr above 980px, 1.1fr / 1fr otherwise) with the rail spanning both columns; three department tickets hang in the left column, copy on the right. On desktop the tickets are fixed width (clamp(210px, 17.4vw, 250px)), never shrink, and overlap 26px on the rail like a real pass; the middle ticket hangs 34px lower, the third 10px.

**Pass sections:** each has its own full-width rail with one wide printout hanging in the left column (0.8fr) and copy on the right (1fr), copy vertically centred. **Screenshot rows:** 1200px max, copy plus a flat screenshot (phone 320px max, floor 980px max centred under centred copy). Section padding lp-section; pass sections close with clamp(80px, 10vw, 130px). **Close:** a rail, the "POROSI E RE" sheet as the CTA link, then centred h2, line and sign-in link.

**Responsive:** at ≤980px everything stacks to one column; in pass sections the copy comes first, then rail, then sheet. At ≤560px the three hero tickets stay side by side at a third of the width each (8px gap, 32px clip), and the hero actions stack full width.

## Elevation & Depth

Depth is physical: things hang, so they cast shadows downward onto a dark room. Flat surfaces (bar, copy) have none.

### Shadow Vocabulary
- **Hanging paper** (`filter: drop-shadow(0 18px 22px rgba(0,0,0,0.75)) drop-shadow(0 2px 2px rgba(0,0,0,0.4))`): on the sheet wrapper, so it follows the torn edge.
- **Rail** (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.6), 0 12px 26px -10px rgba(0,0,0,0.9)`): one top highlight, one bottom shade, a soft drop.
- **Clip** (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.35), 0 2px 3px rgba(0,0,0,0.5)`).
- **Screenshot** (`box-shadow: 0 30px 60px -30px rgba(0,0,0,0.9)`).
- **Bell glow** (`box-shadow: 0 12px 30px -12px rgba(255,90,31,0.6)`): full-size CTA only; the small bar CTA has none.

### Named Rules
**The Wrapper Rule.** The torn-edge mask lives on the paper; the clip, the drop shadow, the tilt and the motion live on the wrapper around it, because a mask would cut them off.

**The Honest Steel Rule.** The rail is a flat steel bar with one highlight, not a chrome gradient.

## Shapes

Nearly square. CTAs 6px, rail 2px, clip 3px. Paper has square top corners and a torn zig-zag bottom (CSS mask, 14px × 7px teeth). Screenshots are the only rounded objects (16px phone, 12px wide). Sheets tilt by a per-sheet `--tilt` between −2° and 1.5°, rotating from their top centre (the clip).

## Components

### Buttons
- **Primary (lp-cta):** order-bell fill, night text, Archivo label uppercase, 56px tall, 6px radius, bell glow. Hover to bell-hot (160ms); press translateY(1px) scale(0.98).
- **Small (lp-cta-small):** 40px, 15px label, no glow; only in the sticky bar.
- **Link:** paper-coloured 15px/600 text, underline on hover (4px offset). Used for "Hyr" and "Kam një biznes · Hyr".

### Rail
A 14px steel bar spanning the section width; decorative (aria-hidden). Sheets hang 4px into it.

### Sheet (signature)
Wrapper with a 46×26px clip centred over its top edge, overlapping the rail; inside, thermal paper in print type with 1.5px dashed rules and a torn bottom. Department tickets (lp-sheet) are narrow; invoice, shift report and printer test are wide (lp-sheet-wide). Content-bearing sheets are focusable (tabIndex 0, aria-label). The closing sheet is itself the register link, ending in a full-width orange stripe with an SVG arrow.

**Motion.** When a sheet scrolls into view (IntersectionObserver, threshold 0.25) it drops 26px onto the rail and settles with a swing (`lp-drop`, 900ms, cubic-bezier(0.16, 1, 0.3, 1), 150ms stagger by index). Hover or focus swings it on its clip (`lp-swing`, 900ms). Sheets are visible without JS; all motion and CTA transitions are off under reduced motion.

### Screenshot
Real BlueBar screens (public/landing/*.webp, provenance JSON beside each) in a figure with a 1px screen-hairline border and raised-night backing, flat, never inside a drawn device frame.

## Do's and Don'ts

### Do:
- **Do** hang every printout from a rail by its clip, with the shadow on the wrapper.
- **Do** use BlueBar's real printed formats and real screenshots; label sample data ("Fletët dhe ekranet në këtë faqe janë shembull.", "shembull-" NIVF/NSLF codes).
- **Do** keep orange to CTAs, focus and selection.
- **Do** set display and headlines in Archivo at font-stretch 72%, weight 850, uppercase, line-height 1.02 with diacritic room.

### Don't:
- **Don't** draw devices in CSS; show screenshots flat with a hairline.
- **Don't** use app Action Blue, pills or the light parchment ground on the landing, or landing tokens in the app.
- **Don't** shrink hero tickets below legible print; print less instead.
- **Don't** add neon tubes, glowing text or other nightlife effects; the only light is the warm lamp (the CTA's bell glow is the one sanctioned glow).
