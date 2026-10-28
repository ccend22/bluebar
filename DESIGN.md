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
  lp-night: "#0d1c26"
  lp-night-raised: "#132836"
  lp-on-night: "#f3f6f9"
  lp-on-night-soft: "rgba(243, 246, 249, 0.7)"
  lp-accent-night: "#6fb1ff"
  lp-blue: "#0867c9"
  lp-blue-deep: "#0057ad"
  lp-blue-soft: "#eaf3fd"
  lp-paper: "#f8f9fb"
  lp-cream: "#eef2f6"
  lp-ink: "#1b2228"
  lp-ink-soft: "#3a434c"
  lp-muted: "#5d6873"
  lp-faint: "#8b96a1"
  lp-line: "#e2e7ec"
  lp-live: "#3ccf8e"
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
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "clamp(46px, 5.8vw, 82px)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.045em"
  lp-headline:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "clamp(34px, 4.4vw, 58px)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  lp-eyebrow:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 600
    letterSpacing: "0.12em"
  lp-body:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    lineHeight: 1.55
  lp-print:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "14px"
    lineHeight: 1.45
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
  lp-screen: "12px"
  lp-icon: "12px"
  lp-panel: "24px"
  lp-close: "32px"
  menu-photo: "3px"
  menu-box: "6px"
  menu-qty: "7px"
  menu-field: "8px"
  menu-button: "9px"
  menu-logo: "14px"
spacing:
  lp-wrap: "1180px"
  lp-gutter: "20px"
  lp-section: "clamp(80px, 10vw, 136px)"
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
  lp-button:
    backgroundColor: "{colors.lp-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  lp-button-hover:
    backgroundColor: "{colors.lp-blue-deep}"
  lp-button-small:
    backgroundColor: "{colors.lp-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  lp-button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.lp-on-night}"
    rounded: "{rounded.pill}"
    height: "48px"
  lp-screen:
    backgroundColor: "#ffffff"
    rounded: "{rounded.lp-screen}"
  lp-stage:
    backgroundColor: "{colors.lp-cream}"
    rounded: "{rounded.lp-panel}"
  lp-close:
    backgroundColor: "{colors.lp-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.lp-close}"
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

BlueBar has three worlds, kept apart on purpose. The app (everything behind sign-in) is **Operate**: light, Apple-derived, quiet. The public landing at "/" is **Persuade**: "the bar at night", night navy bands around real BlueBar screens. Tokens prefixed `lp-` belong to the landing only and never enter the app; app tokens never appear on the landing, though BlueBar Blue (#0867c9) is shared by value as the brand. The guest menu at "/menu/<business>", opened from a table's QR code, is **Operate** for guests: the venue's own guest-check pad (comanda). Tokens prefixed `menu-` belong to the guest menu only; it uses no app or `lp-` tokens, and neither of them uses `menu-` tokens. The frontmatter is normative for all three.

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

# Landing (Persuade): "The bar at night"

Source: src/Landing.jsx, src/LandingCounter.jsx, src/landing.css. Everything below applies to the landing only and is written in Stitch's semantic structure, so the same text can prompt new landing screens. Derived from the shipped CSS and checked in the browser at 1440px and 390px.

## 1. Visual Theme & Atmosphere

A bar after the doors open: night navy bands for the hero, voice ordering and getting started, with daylight grey bands in between where the real screens are read. Confident and plain, never nightlife neon. The product is the proof: real BlueBar screens from the sample venue Bar Aurora, plus a working order demo the visitor can tap through.

- **Density:** Daily App Balanced (4). Generous section spacing; the demo band is the only dense part.
- **Variance:** Offset Asymmetric (6). Copy left and screens right, headline left and its sentence right, the FAQ heading held on the left while answers open on the right.
- **Motion:** Fluid CSS (5). Functional and quiet: native scroll reveals, a slipping language pill, a typing voice demo, a receipt that prints.

## 2. Color Palette & Roles

- **Night Navy** (#0d1c26, lp-night): hero, voice and getting-started bands, sticky bar (94% with a 16px blur), footer, overscroll.
- **Raised Night** (#132836, lp-night-raised): surfaces lifted off the night bands.
- **Night Text** (#f3f6f9, lp-on-night) and **Night Text Soft** (70%, lp-on-night-soft): headlines and copy on night.
- **Daylight Paper** (#f8f9fb, lp-paper): the default page ground. **Cream** (#eef2f6, lp-cream): FAQ band, screen stage, icon tiles.
- **Ink** (#1b2228, lp-ink), **Ink Soft** (#3a434c), **Muted** (#5d6873), **Faint** (#8b96a1): text from headline to resting accordion tab. **Line** (#e2e7ec, lp-line): every 1px rule.
- **BlueBar Blue** (#0867c9, lp-blue): the one accent. Filled actions, the turn of each headline, focus ring, selection, checkmarks. Pressed and hover: **Blue Deep** (#0057ad). Wash: **Blue Soft** (#eaf3fd).
- **Night Blue** (#6fb1ff, lp-accent-night): the same accent lifted for contrast on night bands only (headline turns, eyebrows, step numbers).
- **Live Green** (#3ccf8e, lp-live): the pulsing dot on "live" eyebrows. A status signal, never an action.

**The One Accent Rule.** Blue is the only hue that acts. Night Blue is its night-band form, not a second accent. Live Green marks liveness and nothing else.

## 3. Typography Rules

- **Display:** Bricolage Grotesque 700 (self-hosted variable woff2), tracking −0.035em, balanced wrapping. Hero clamp(46px, 5.8vw, 82px) at line-height 0.98 and −0.045em; section headings clamp(34px, 4.4vw, 58px) at 1.04. The closing phrase of every headline (the `<em>`) turns blue, upright, never italic.
- **Body:** Figtree 17px/1.55 (self-hosted variable woff2). Leads 17–19.5px capped near 44ch, section sentences 18px at 56ch, answers at 60ch, pretty wrapping.
- **Eyebrow and print:** system monospace. Eyebrows are 600 12.5px, uppercase, +0.12em, set like the header of a printed slip. Order lines, slips and receipts are monospace too, with dashed rules.
- **Numbers:** tabular figures in totals and the till.
- **Banned:** Inter, generic serifs, condensed display faces from the previous "kitchen pass" direction.

## 4. Component Stylings

- **Buttons:** pills. Primary is BlueBar Blue with white 600 16px text, 48px tall, 0 24px padding; hover Blue Deep; press scales to 0.97. Ghost on night: transparent with a 30% Night Text border. Light (on the blue close): Night Text fill, Night Navy text. One filled action per band. The header's small action is 36px.
- **Language switch:** EN · SQ in a hairline pill; a lit pill slides under the chosen language over 320ms; the page cross-fades via View Transitions.
- **Screens:** real screenshots inside a minimal browser frame (12px radius, three grey dots, hairline). The hero frame tilts (rotateY −7°, rotateX 2°) with the waiter's phone overlapping its corner; shadows on night are tinted navy (rgba(3, 10, 15, .8)), never neutral black.
- **Feature accordion:** numbered tabs in display type (Faint at rest, Ink when open, number in Blue), one open at a time; its screen sits in a sticky Cream stage on the right, and inline under the tab on phones.
- **Lists of capabilities:** ruled rows, not cards. A 46px Cream icon tile, a display-type title and a muted line, divided by 1px Line rules, two columns on desktop.
- **FAQ:** native details/summary as ruled rows with a blue plus that turns 45° when open; summary text goes blue on hover.
- **Cards:** only where something sits above the page: the voice card on night, the demo phone, slips and till, the blue close (32px radius, 24px on phones).
- **Icons:** one authored SVG set, 24px grid, 1.7 stroke, round caps, currentColor.

## 5. Layout Principles

- Content width min(1180px, 100% − 40px). Sections pad clamp(80px, 10vw, 136px) vertically.
- Hero: 1.05fr / 0.95fr split, copy left, screens right, four facts ruled along its foot (two columns on tablet and phone).
- Section heads split 1.25fr / 0.75fr: headline left, its one sentence bottom-aligned right.
- The demo stage is 310px phone | slips | 280px till, then phone + slips, then one column.
- Everything collapses to one column at 960px, except the facts and capability rows, which go single-column at 620px. No horizontal scroll at any width. Touch targets at least 44px.

## 6. Motion & Interaction

- **Scroll reveals:** headings, accordion rows, capability rows, steps, FAQ rows and the close rise 28px and fade in on a native view timeline (animation-timeline: view(), entry 0–45%), with the second column and later steps offset 8% and 16%. Browsers without scroll timelines and reduced-motion users see the page static.
- **Feature switch:** the open tab's body and its screen fade up 8px over 380–420ms on cubic-bezier(0.23, 1, 0.32, 1).
- **Voice demo:** plays once on entering view: the phrase types itself with a blinking caret and a five-bar wave, then turns into order lines through the app's own parser.
- **Order demo:** tables and menu tiles press to 0.95–0.96, count badges pop, slips drop in, the receipt prints top to bottom over 1.4s, the till's numbers tick in green.
- **Perpetual:** only the live dot's ping and the next-step target's ring. Nothing else loops.
- Transform and opacity only. Reduced motion swaps every entrance for a 300ms fade and stops every loop.

## 7. Anti-Patterns (Banned)

- No emojis. No Inter. No pure black. No neon glows, CTA halos or glowing text.
- No second accent hue; no purple/blue AI gradients; flat colour only, no gradient fills or gradient text.
- No three-up card grids; capabilities are ruled rows. No centred FAQ stack of cards.
- No invented customers, testimonials, logos, prices or round-number claims; sample data is labelled as Bar Aurora.
- No drawn devices beyond the minimal frames and the demo phone; no stock photos.
- No "scroll to explore", bouncing chevrons or custom cursors.
- No implying every printer works without configuration, or that fiscalization works without a connected BlueBill account.
- No app parchment (#f4f6f8) or guest-menu `menu-` tokens on the landing. BlueBar Blue is shared by value with the app on purpose: it is the brand.

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
