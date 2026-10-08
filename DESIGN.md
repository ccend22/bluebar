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
  menu-paper: "#eef4ee"
  menu-paper-hi: "#f7faf6"
  menu-rule: "#c3d5c8"
  menu-rule-strong: "#5f7f6b"
  menu-label: "#4a6857"
  menu-ink: "#24302a"
  menu-ink-soft: "#4f6157"
  menu-carbon: "#3d4a86"
  menu-stamp-green: "#2f7d4f"
  menu-stamp-red: "#b3261e"
  menu-ink-brand: "#0867c9"
  menu-ink-brand-press: "#0057ad"
  menu-table: "#dfe7df"
  menu-print-white: "#ffffff"
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
  menu-masthead:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "38px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
  menu-sheet-title:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    letterSpacing: "0.03em"
  menu-category:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    letterSpacing: "0.03em"
  menu-tab:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    letterSpacing: "0.05em"
  menu-figure:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    fontFeature: "\"tnum\""
  menu-form-label:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.08em"
  menu-item:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
  menu-body:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.35
  menu-small:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  pill: "9999px"
  app-card: "16px"
  app-control: "10px"
  lp-cta: "6px"
  lp-rail: "2px"
  lp-clip: "3px"
  lp-screen-phone: "16px"
  lp-screen-wide: "12px"
  menu-photo: "3px"
  menu-box: "6px"
  menu-qty: "7px"
  menu-field: "8px"
  menu-button: "9px"
  menu-logo: "14px"
spacing:
  lp-gutter: "clamp(16px, 5vw, 72px)"
  lp-section: "clamp(64px, 8vw, 120px)"
  menu-gutter: "18px"
  menu-qty-column: "62px"
  menu-column: "560px"
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
  menu-stamp-button:
    backgroundColor: "{colors.menu-ink-brand}"
    textColor: "{colors.menu-print-white}"
    typography: "{typography.menu-figure}"
    rounded: "{rounded.menu-button}"
    padding: "0 16px"
    height: "52px"
  menu-stamp-button-active:
    backgroundColor: "{colors.menu-ink-brand-press}"
  menu-form-box:
    backgroundColor: "{colors.menu-paper-hi}"
    textColor: "{colors.menu-ink}"
    rounded: "{rounded.menu-box}"
    padding: "5px 12px"
    height: "52px"
  menu-tab:
    backgroundColor: "{colors.menu-paper}"
    textColor: "{colors.menu-ink-soft}"
    typography: "{typography.menu-tab}"
    padding: "13px 10px 11px"
  menu-tab-active:
    textColor: "{colors.menu-ink-brand}"
  menu-line:
    backgroundColor: "{colors.menu-paper}"
    textColor: "{colors.menu-ink}"
    typography: "{typography.menu-item}"
    height: "72px"
  menu-line-open:
    backgroundColor: "{colors.menu-paper-hi}"
  menu-qty-box:
    backgroundColor: "{colors.menu-paper-hi}"
    textColor: "{colors.menu-ink-brand}"
    rounded: "{rounded.menu-qty}"
    size: "42px"
  menu-line-photo:
    rounded: "{rounded.menu-photo}"
    size: "58px"
  menu-stepper:
    backgroundColor: "{colors.menu-paper-hi}"
    textColor: "{colors.menu-ink-brand}"
    rounded: "{rounded.menu-field}"
    height: "44px"
  menu-stub:
    backgroundColor: "{colors.menu-paper-hi}"
    textColor: "{colors.menu-ink}"
    padding: "8px 18px"
    height: "66px"
    width: "{spacing.menu-column}"
  menu-sheet:
    backgroundColor: "{colors.menu-paper-hi}"
    textColor: "{colors.menu-ink}"
    width: "{spacing.menu-column}"
---

# BlueBar design

BlueBar has three worlds, kept apart on purpose. The app (everything behind sign-in) is **Operate**: light, Apple-derived, quiet. The public landing at "/" is **Persuade**: "Shina e kuzhinës", the kitchen pass at night. Tokens prefixed `lp-` belong to the landing only and never enter the app; app tokens never appear on the landing except BlueBar's navy "b." mark. The guest menu at "/menu/<business>", opened from a table's QR code, is **Operate** for guests: the venue's own guest-check pad (comanda). Tokens prefixed `menu-` belong to the guest menu only; it uses no app or `lp-` tokens, and neither of them uses `menu-` tokens. The frontmatter is normative for all three.

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

# Guest menu (Operate, public): "The venue's guest-check pad"

Source: menu.html, src/menu/ (menu.css holds every token and component style, fonts.css the faces, accents.js the venue inks). Everything below applies to the guest menu only. Surface brief: .impeccable/surfaces/src-menu-main-jsx.md.

## Overview

**Creative North Star: "The Comanda"**

Ordering is filling in the waiter's guest check. The menu is printed on the venue's own ruled pad: mint paper ruled in form green, a header printed in the venue's ink, form labels in condensed caps, and the guest's basket is the check itself. A guest taps a quantity box and the number is stamped into it; opens a line and it unfolds into a slip; tears the check off to send it and keeps the carbon copy. It refuses the delivery-app list with a floating cart and a modal.

Paper, rules and ink, literal and quiet. The venue's brand colour is the only ink that prints the pad's own marks (header, quantities, totals, actions); the photos are small prints pasted onto the lines, not the page's colour.

**Key Characteristics:**
- Light only (`color-scheme: light` in CSS and meta, theme-color menu-paper). A user rule: no dark variant.
- Mint pad paper, hairline rules, form-green labels, the header printed in the venue's ink
- Barlow Condensed caps for everything printed on the form; Barlow for what is written or read
- Unnumbered ruled lines with a quantity box column and a ruled price column
- Small photos pasted in with a white print border and a slight tilt
- The check docked as a stub at the bottom; it rises as a sheet and tears off when sent
- Carbon copies stamped with the order's status
- Springs from motion; reduced motion follows the user's setting

## Colors

Pad paper and form green, one venue ink, carbon blue for copies, and two stamp inks for status.

### Primary
- **Venue Ink** (menu-ink-brand): set at load from the venue's chosen accent (src/menu/accents.js: blue, terracotta, olive, plum, teal, amber, each AA with white text); blue is the default. It prints the masthead (logo stamp border, venue name, the heavy rule under it), the active tab and its underline, the quantity number and filled box border, checked form boxes, stepper glyphs, the stub label and count, sheet titles, the check total, the stamp button, the toast action, the notice's dashed border, focus ring (3px at 45%), selection (22%) and caret. **Venue Ink Press** (menu-ink-brand-press): the stamp button pressed.

### Status
- **Stamp Green** (menu-stamp-green): the DËRGUAR stamp and the success toast's mark. **Stamp Red** (menu-stamp-red): NUK U PRANUA and MBARUAR stamps, the rejection reason, the send error and the error toast. A waiting order (NË PRITJE) is stamped in Form Ink Soft. These stay out of the venue's ink so the three states read apart at a glance.
- **Carbon** (menu-carbon): every carbon copy is written in it, like the blue under-sheet of a real pad.

### Neutral
- **Pad Paper** (menu-paper): page, lines, tab strip, the sheet backdrop wash (at 72%, 2px blur).
- **Paper Highlight** (menu-paper-hi): form boxes, quantity boxes, steppers, checkboxes, the open line, the stub, sheets, toasts.
- **Rule** (menu-rule): line rules, column rules, the stepper's inner rules, skeletons, disabled glyphs, the blank quantity box.
- **Rule Strong** (menu-rule-strong): form-box and quantity-box borders, the tab strip's bottom rule, the dashed write-line, copy separators, the sold-out strike-through and the empty box's plus. Lines and marks only, never text.
- **Label Green** (menu-label): small printed form labels (TAVOLINA, ORA, SASIA, SHTESA, column heads, category counts); darker than the rules so 11–13px caps stay readable (about 5.5:1).
- **Form Ink** (menu-ink): written text, category headings and the 2px rule under them, the check's column rule and double total rule. **Form Ink Soft** (menu-ink-soft): descriptions, tagline, idle tabs, hints, footer.
- **Print White** (menu-print-white): the logo stamp's ground, photo print borders, text on venue ink.
- **Table** (menu-table): on screens 640px and wider, the surface the pad lies on.

### Named Rules
**The Venue Ink Rule.** The venue's colour prints the pad's own marks and what you can act on. Status never borrows it; stamps keep their own inks.

**The Rule Is Not Text Rule.** Rule Strong draws lines and boxes; small labels use Label Green, body text Form Ink.

## Typography

**Form Font:** Barlow Condensed 600/700 (self-hosted woff2, OFL, latin + latin-ext for ë and ç), fallback Arial Narrow, system-ui
**Body Font:** Barlow 400/500/600 (self-hosted, same files), fallback system-ui

**Character:** The condensed caps are what the printer put on the pad; Barlow is the handwriting-free voice of what is read: names, descriptions, notes.

### Hierarchy
- **Masthead** (menu-masthead, uppercase): the venue name in venue ink; the initials in the logo stamp use the same face at 30px.
- **Sheet title** (menu-sheet-title, uppercase, venue ink): POROSIA, POROSITË E MIA.
- **Category** (menu-category, uppercase, form ink): category headings, with the item count beside them in 14px Label Green.
- **Tab** (menu-tab, uppercase): category tabs.
- **Figure** (menu-figure, tabular): prices, check amounts. Form-box values are 21px, the quantity number 25px/700, stepper value 20px/700, stub total 24px/700, check total 30px/700; the stamp button is 19px/700 uppercase.
- **Form label** (menu-form-label, uppercase): legends, column heads, write-line labels. In form boxes it is 11px; MBARUAR is 12px/700.
- **Item** (menu-item): dish names on lines and on the check.
- **Body** (menu-body): root text, extras, note inputs (17px, so iOS never zooms on focus). Slip description 16px/1.45; tagline 15px.
- **Small** (menu-small): one-line clamped descriptions, extras under check lines, hints.

All numbers use tabular numerals. Headings balance.

### Named Rules
**The Printed Form Rule.** If the printer put it on the pad (labels, headings, column heads, figures, stamps, buttons), it is Barlow Condensed in caps; if a person reads or writes it, it is Barlow in sentence case.

## Layout

One column (menu-column), the pad, with gutter menu-gutter. The masthead is a two-column grid: the 66px logo stamp spans two rows beside the venue name and tagline, then a row of ruled form boxes across the full width (TAVOLINA with the table zero-padded, ORA, POROSITË E MIA with a count once something was sent, GJUHA SQ/EN). Safe-area insets are honoured top and bottom.

Below it the tab strip sticks to the top: paper ground, a strong bottom rule, scrolls sideways without a scrollbar, and centres the active tab by scrolling only itself. The active tab follows the last category heading that passed under it.

**Lines.** Each category is a heading over a 2px form-ink rule, then unnumbered ruled lines (a line number tells a guest nothing): the quantity column (menu-qty-column, ruled off on its right) with a 42px box | name and one-line description | a 58px pasted photo | the price column, 82px, ruled off on its left. Minimum line height 72px. The page reserves bottom room for the stub when it shows.

**Desktop (640px and wider):** the pad lies on the table (menu-table), 28px from the top, with a 4px radius and a paper shadow.

## Elevation & Depth

Flat paper with rules. Depth is physical and sparse: things pasted onto the paper, and paper lying on paper.

### Shadow Vocabulary
- **Pasted print** (`0 1px 2px rgba(36,48,42,.18), 0 4px 10px -6px rgba(36,48,42,.35)`): line photos. The slip photo lifts more (`0 2px 4px rgba(36,48,42,.15), 0 14px 28px -14px rgba(36,48,42,.45)`).
- **Sheet** (`0 -1px 0` rule-strong, `0 -18px 40px -24px rgba(36,48,42,.45)`): the check rising over the pad.
- **Toast** (`0 12px 30px -12px rgba(36,48,42,.45)`).
- **Pad on the table** (`0 1px 3px rgba(36,48,42,.12), 0 28px 60px -28px rgba(36,48,42,.45)`): desktop only.
- **Stamp button** (`inset 0 0 0 2px` white at 28%, `inset 0 0 0 4px` venue ink): an inner printed border, not a lift.

### Named Rules
**The Paper Wash Rule.** A sheet rises over a light paper wash (pad paper at 72%, 2px blur), never a dark scrim.

## Shapes

Printed-form geometry: square-ish boxes with small radii. Photos 3px with a white print border (3px on lines, 5px on the slip), tilted −1.5° (1.2° on even lines, −1° on the slip). Form boxes 6px, quantity box 7px, stepper, notice and error 8px, stamp button 9px, toasts 10px, logo stamp 14px. Stamps tilt (MBARUAR −2°, copy stamps −6°). The stub and the sheet have square corners and a perforated top edge: 14px repeat of 4.5px half-holes, 8px tall. The masthead closes with a 6px double rule in venue ink (two 2px rules with a 2px gap), like the printed head of a pad. The check total sits under a 3px double rule in form ink.

## Components

### Masthead
The venue's logo in a white stamp (66px, 2px venue-ink border, radius menu-logo; the initials when there is no logo, nothing invented), the name, the manager's tagline, and the ruled form-box row. Form boxes (menu-form-box) carry an 11px label over a 21px value; actionable ones are in venue ink and tint 10% on press. The language box holds SQ/EN keys; the pressed one is filled with venue ink.

### Tab strip
Category tabs (menu-tab); the active one turns venue ink and a 3px underline (rounded top) slides under it (motion layoutId "tab-ink", spring 500/40).

### Line
A dish as a ruled line (menu-line). **Quantity box** (menu-qty-box): a plus in Rule Strong when empty; tapping it writes the dish onto the check, and the count is stamped in (25px venue ink, scale 1.9 → 1 with a −4° tilt, spring 520/22) and the border turns venue ink. A dish with extras opens instead. Tapping the rest of the line opens it. **Sold out:** name struck through in Rule Strong, photo greyscale at 55%, price in Form Ink Soft, a red MBARUAR stamp under the name, and a dashed blank quantity box. Lines that cannot be ordered (no table key) show the same blank box.

### Slip (signature)
An open line unfolds in place into a slip (height spring 380/36), the row's photo travelling into a 4:3 print up to 300px wide (shared layoutId). Inside, aligned past the quantity column: the description, extras as form checkboxes (24px, 5px radius, ruled rows of 46px; checked fills with venue ink and a white check), a note on a dashed write-line (solid venue ink on focus), then the stepper beside the stamp button "Shto · <total>", and a "Mbyll artikullin" link. Only one line is open at a time.

### Stamp button and stepper
**Stamp button** (menu-stamp-button): venue ink, white caps, inner printed border; presses to 0.97 and Venue Ink Press (110ms). **Stepper** (menu-stepper): a ruled box, [−] value [+], 42px keys with venue-ink glyphs, inner rules around the value; disabled keys fade to Rule.

### Check stub
Docked flush at the bottom, full pad width (menu-stub), once anything is written on the check: perforated top edge, "POROSIA" with the table under it in venue ink, a ruled SASIA box, the total rolling through NumberFlow, and a chevron. It slides up on a spring (420/40) and presses to 0.98. Tapping it opens the check.

### Check sheet
The check rises as pad paper (menu-sheet) in a native dialog, max 92dvh, over the paper wash. Its perforated top edge is the drag handle: down follows the finger, up barely gives; it closes past 140px or on a fast flick, otherwise springs back; Escape and taps on the wash close it too. Inside: POROSIA with TAVOLINA and ORA boxes; columns SASIA | ARTIKULLI | ÇMIMI over a 2px form-ink rule; each line a stepper (down to zero removes it), the name with extras and note, and a NumberFlow amount; an order note write-line; GJITHSEJ under a double rule with the total in venue ink; the wide stamp button "Dërgo porosinë" and a hint. **Sending** tears the whole sheet off, perforated edge and all, upward (−115vh, −3°, 450ms ease-in) while it still shows what was written; then a toast confirms.

### Carbon copies
"Porositë e mia" is a sheet of carbon copies, newest first, each in Carbon: "POROSIA Nr. <order number> · <time>", a rubber stamp in its status ink (DËRGUAR, NË PRITJE, NUK U PRANUA; 2px border, −6°, 88% opacity), the rejection reason in red, the lines, dashed separators, and GJITHSEJ DERI TANI with a note that the bill is the final price.

### Toasts
Sonner, unstyled and dressed as pad slips: paper highlight, 1.5px Rule Strong border (Stamp Red for errors), a stamp-green or red mark, an outlined venue-ink action (POROSITË E MIA after sending). Top centre. They report send success and staff decisions wherever the guest is on the page.

### Icons
One authored SVG stroke set (src/menu/icons.jsx): 24px grid, 2px round strokes, currentColor.

### Motion and libraries
Chosen through pick-ui-library: motion (springs, layout, drag; LazyMotion with domMax loaded asynchronously, so the menu paints before motion arrives), @number-flow/react (rolling totals), sonner (toasts), clsx. All motion is springs except the tear. MotionConfig reducedMotion="user" drops transforms for users who ask; the sheet then fades instead of sliding, and CSS transitions and the skeleton pulse switch off.

## Do's and Don'ts

### Do:
- **Do** put every dish on a ruled line with its quantity box and price column; keep lines working with and without a photo.
- **Do** print the pad's marks in the venue's ink and status in stamp inks.
- **Do** set printed form text in Barlow Condensed caps and read text in Barlow.
- **Do** open lines in place as slips; keep the photo continuous through the shared layout.
- **Do** keep the check as paper: a docked stub, a sheet held by its perforated edge, torn off to send.

### Don't:
- **Don't** add a dark mode or a dark scrim.
- **Don't** number the lines, or use emoji or colour gradients (the perforation is a radial-gradient mask, not a colour fade).
- **Don't** use Rule Strong for text, or the venue's ink for status.
- **Don't** open a dish in a modal popup or float a cart over the page.
- **Don't** use app or `lp-` tokens here.
