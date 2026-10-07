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
  menu-ground: "#f2f2f7"
  menu-cell: "#ffffff"
  menu-label: "#1d1d1f"
  menu-secondary: "#636366"
  menu-tertiary: "#8e8e93"
  menu-separator: "#d1d1d6"
  menu-fill: "rgba(118, 118, 128, 0.12)"
  menu-pressed: "#e5e5ea"
  menu-control-gray: "#c7c7cc"
  menu-blue: "#0867c9"
  menu-blue-press: "#0057ad"
  menu-blue-tint: "rgba(8, 103, 201, 0.1)"
  menu-green: "#248a3d"
  menu-red: "#d70015"
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
  menu-large-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.022em"
  menu-plate-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  menu-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.018em"
  menu-headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  menu-body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.3
  menu-subhead:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "15px"
    lineHeight: 1.33
  menu-footnote:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.02em"
rounded:
  pill: "9999px"
  app-card: "16px"
  app-control: "10px"
  lp-cta: "6px"
  lp-rail: "2px"
  lp-clip: "3px"
  lp-screen-phone: "16px"
  lp-screen-wide: "12px"
  menu-group: "16px"
  menu-capsule: "28px"
  menu-button: "14px"
  menu-photo: "12px"
  menu-field: "10px"
spacing:
  lp-gutter: "clamp(16px, 5vw, 72px)"
  lp-section: "clamp(64px, 8vw, 120px)"
  menu-inset: "16px"
  menu-column: "600px"
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
  menu-button-primary:
    backgroundColor: "{colors.menu-blue}"
    textColor: "{colors.menu-cell}"
    typography: "{typography.menu-headline}"
    rounded: "{rounded.menu-button}"
    padding: "0 18px"
    height: "50px"
  menu-button-primary-active:
    backgroundColor: "{colors.menu-blue-press}"
  menu-pill:
    backgroundColor: "{colors.menu-fill}"
    textColor: "{colors.menu-label}"
    typography: "{typography.menu-subhead}"
    rounded: "{rounded.pill}"
    padding: "7px 15px"
  menu-pill-active:
    backgroundColor: "{colors.menu-blue}"
    textColor: "{colors.menu-cell}"
  menu-dish-row:
    backgroundColor: "{colors.menu-cell}"
    padding: "12px 16px"
    height: "112px"
  menu-dish-photo:
    rounded: "{rounded.menu-photo}"
    size: "88px"
  menu-add:
    backgroundColor: "{colors.menu-cell}"
    textColor: "{colors.menu-blue}"
    rounded: "{rounded.pill}"
    size: "34px"
  menu-add-counted:
    backgroundColor: "{colors.menu-blue}"
    textColor: "{colors.menu-cell}"
  menu-add-bare:
    backgroundColor: "{colors.menu-blue-tint}"
    textColor: "{colors.menu-blue}"
  menu-basket-capsule:
    backgroundColor: "{colors.menu-blue}"
    textColor: "{colors.menu-cell}"
    rounded: "{rounded.menu-capsule}"
    height: "56px"
    width: "min(520px, calc(100% - 32px))"
  menu-sheet:
    backgroundColor: "{colors.menu-cell}"
    rounded: "{rounded.menu-button}"
    width: "{spacing.menu-column}"
---

# BlueBar design

BlueBar has three worlds, kept apart on purpose. The app (everything behind sign-in) is **Operate**: light, Apple-derived, quiet. The public landing at "/" is **Persuade**: "Shina e kuzhinës", the kitchen pass at night. Tokens prefixed `lp-` belong to the landing only and never enter the app; app tokens never appear on the landing except BlueBar's navy "b." mark. The guest menu at "/menu/<business>", opened from a table's QR code, is **Operate** for guests: an iPhone app on the web. Tokens prefixed `menu-` belong to the guest menu only; it uses no app or `lp-` tokens, and neither of them uses `menu-` tokens. The frontmatter is normative for all three.

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

# Guest menu (Operate, public): "An iPhone app on the web"

Source: menu.html, src/menu/ (menu.css holds every token and component style). Everything below applies to the guest menu only. Surface brief: .impeccable/surfaces/src-menu-main-jsx.md.

## Overview

A guest scans the QR code on their table and lands in what should feel like a native iPhone app, never a website: the iOS grouped list, white cells on a grey ground, hairline separators, a large title that collapses into a compact bar. Food photography is the colour; one Action Blue marks everything you can press. Every dish is a photo row that grows into the full plate exactly where it was tapped, and folds back; there is no modal dish popup.

**Key Characteristics:**
- Light only (`color-scheme: light` in CSS and meta, theme-color menu-ground). A user rule: no dark variant.
- Inset grouped list on a grey ground, white cells, half-pixel hairlines
- Each platform's own system face
- Large title that hands over to a frosted 44px compact bar
- Dish rows that expand in place, the photo morphing into the plate
- Blue capsules floating bottom-centre; a draggable bottom sheet for the order
- Motion on the iOS curve; reduced motion turns it off

## Colors

iOS system greys plus one blue. Green and red exist only for order outcomes.

### Primary
- **Action Blue** (menu-blue): active category pill, add button once counted, primary button, basket capsule, stepper glyphs, checked extras, caret, focus ring (3px at 45%) and selection (20%). Pressed: **Blue Press** (menu-blue-press). **Blue Tint** (menu-blue-tint): the table tag, the info notice, the photo-less add disc.

### Status
- **Green** (menu-green): the accepted order's mark. **Red** (menu-red): the rejected order's mark and the send-error text (on red at 8%). Pending is a blue spinner.

### Neutral
- **Ground** (menu-ground): page, frosted bars (at 82%), photo placeholders, note fields, stepper track.
- **Cell** (menu-cell): grouped list, plate, sheet.
- **Label** (menu-label): text. **Secondary** (menu-secondary): descriptions, field labels, footer, hints. **Tertiary** (menu-tertiary): sold-out dish names.
- **Separator** (menu-separator): hairlines. **Fill** (menu-fill): idle pills, language switch track, sold-out tag, the photo-less close button. **Pressed** (menu-pressed): row press and loading skeletons. **Control Gray** (menu-control-gray): empty checkbox ring, sheet grabber, disabled stepper glyph.

### Named Rules
**The One Accent Rule.** Blue means "you can press this". Green and red only report an order's outcome; nothing else is coloured except the photos.

## Typography

**Font:** the platform's system face (-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI). SF on Apple devices; Android keeps Roboto on purpose, its own native face. No web fonts.

### Hierarchy
- **Large title** (menu-large-title): the venue name.
- **Plate title** (menu-plate-title): the open dish.
- **Title** (menu-title): category headings, sheet heading, basket total.
- **Headline** (menu-headline): dish names (−0.01em), compact bar title, buttons, capsule label.
- **Body** (menu-body): root text, extras, note input (17px, so iOS never zooms on focus). Plate description is 16px/1.45.
- **Subhead** (menu-subhead): dish descriptions (two lines, clamped), prices, pills, table tag, status text.
- **Footnote** (menu-footnote): field labels ("Shtesa", "Shënim për kuzhinën") in uppercase, iOS grouped-list headers labelling the control below them; also the sold-out tag, language switch, hints and footer.

Prices and counts use tabular numerals. Headings balance.

## Layout

One column (menu-column), centred, on phone and desktop alike; the grouped list is inset menu-inset. A fixed 44px top bar (plus the safe area) sits over the large title, transparent until the title scrolls under it, then fades in the venue name on frosted ground (saturate 180%, blur 20px). Directly under it the category pills stick, on the same frosted ground, scroll sideways without a scrollbar, and centre the active pill; one hairline under the pills (only once stuck) makes title and pills read as one bar. The active pill follows the category being read. The page reserves bottom room for the capsules when they show. Safe-area insets are honoured top and bottom.

## Elevation & Depth

Flat, iOS-style: the list and plate cast no shadow. Depth only where something floats or is pressable on top of something else.

- **Add disc** (`0 2px 10px rgba(0,0,0,.16), 0 0 0 .5px rgba(0,0,0,.06)`): lifts off the photo.
- **Basket capsule** (`0 12px 28px -10px` blue at 65%).
- **Status capsule** (white at 92%, blurred; `0 10px 30px -8px rgba(0,0,0,.22)` plus a 0.5px ring).
- **Selected segment / stepper keys** (small grey shadows, as iOS controls).
- **Sheet backdrop** black at 30%.

### Named Rules
**The Hairline Rule.** Separators are 1px scaled to 0.5 (true hairlines on retina), inset from the leading edge as on iOS. No border is ever thicker than a hairline.

## Shapes

Continuous rounded rectangles, iOS sizes: grouped list 16px, capsules 28px (full), primary button and sheet top corners 14px, dish photo 12px, fields 10px, stepper track 13px with 10px keys. Pills, add disc, checkboxes and close buttons are full circles or capsules.

## Components

### Venue card (header)
The top of the menu is the venue's own card on a wash of its brand colour (8% into white), rounded 32px at the bottom: table tag (white, brand-coloured text) and the SQ/EN segment on one row, then the venue logo in a 96px white squircle (radius 26, a soft shadow tinted with the brand colour), the name as the 34px large title, and the manager's one-line welcome (17px secondary, max 30ch). Without a logo the squircle shows the venue's initials in its brand colour; nothing is invented.

### Brand colour
Each venue picks one of six curated colours (src/menu/accents.js: blue, terracotta, olive, plum, teal, amber, each AA with white text). It replaces Action Blue as menu-blue / menu-blue-press at load, and the tint and the header wash derive from it with color-mix. It is still the only accent on the page.

### Dish card and dish row
A dish with a photo is a card: the photo leads (full width, 16:10), the name (19px semibold) and price (17px, brand colour) share one line under it, then the two-line description. A dish without a photo is a compact row (name, description, price). Every dish is its own white surface (radius 20) with 12px between them; on screens 760px and wider the cards run two to a row in an 880px column. The add disc (42px) sits on the photo's bottom-right corner: white with a brand-coloured plus; once added it fills with the brand colour and shows the count. On a row without a photo it is a tinted disc centred on the right. With extras, add opens the plate instead of adding. Sold out: grey name, greyscale photo at 50%, a "Mbaruar" tag, no add.

### My orders
Once a guest has ordered, a brand-coloured "Porositë e mia · n" pill joins the table tag (and a receipt button in the compact top bar). It opens a sheet listing each order sent from this phone, newest first: time (24h), a status chip (Dërguar / Në pritje / Nuk u pranua), its lines with amounts, and the total so far, with a note that the bill is the final price. Tapping the status capsule opens the same sheet.

### Plate (signature)
Tapping a dish expands it in place into the plate: full-width 4:3 photo (max 56vh), a frosted round collapse button (chevron down) on its corner, then title, price and description. The photo morphs between card and plate through a view transition named "dish-photo" (420ms, iOS curve); only the open dish carries the name. Below: extras as an iOS checklist (22px circles that fill blue with a white check, hairlines inset past the circle, price on the right), a note field, then the stepper beside the primary button "Shto · <total>". The plate body rises 8px and fades in (320ms).

### Primary button and stepper
Primary (menu-button-primary) presses to 0.97. Stepper: two white 40px keys with blue minus and plus on a ground track, count between them; keys go grey and flat at the limits.

### Capsules
Fixed bottom-centre above the home indicator. **Basket** (menu-basket-capsule): count chip, "Shiko porosinë", total; pulses once (1.035) when the count changes. **Status**: frosted white, a 26px mark (blue spinner pending, green check accepted, red alert rejected with the reason), dismissable once settled; rises 66px above the basket when both show.

### Sheet
The order opens in a native dialog rising from the bottom (menu-sheet, 92dvh max). Its grabber (36×5px) drags it: down follows the finger 1:1, up resists; it closes when pulled past 140px or flicked fast, otherwise springs back. Escape and backdrop taps close it the same way. Lines with their own steppers, an order note, the total, the send button and a hint. On send it closes and the status capsule takes over.

### Photos
Uploaded by managers in the app and shrunk in the browser to at most 1000px on the long side, WebP (JPEG where the browser cannot write WebP).

### Icons
One authored SVG stroke set (src/menu/icons.jsx): 24px grid, 2px round strokes, currentColor. Plus, minus, check, close, chevron, bag, alert.

### Motion
All motion runs on the iOS curve (cubic-bezier(.32,.72,0,1)): sheet in 460ms, sheet settle 300ms, capsules, plate. Colour changes are 120–200ms ease-out; presses scale (0.9 add disc, 0.97 button). Under reduced motion every animation and transition is off and the plate opens without the morph.

## Do's and Don'ts

### Do:
- **Do** open dishes in place; keep the photo continuous through the "dish-photo" transition.
- **Do** keep every dish working with and without a photo.
- **Do** use the platform's own system face and iOS metrics (44px bar, 17px body, ≥44px targets).
- **Do** let the status capsule carry the news of an order while the guest keeps browsing.

### Don't:
- **Don't** add a dark mode.
- **Don't** use emoji, gradients or borders thicker than a hairline.
- **Don't** colour anything but pressable things (blue) and order outcomes (green, red).
- **Don't** open a dish in a modal popup.
- **Don't** use app or `lp-` tokens here.
