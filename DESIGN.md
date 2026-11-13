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
  amber: "#835615"
  red: "#a3322a"
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
  menu-paper: "#f6f7f9"
  menu-surface: "#ffffff"
  menu-line: "#e4e8ec"
  menu-line-strong: "#cfd6dd"
  menu-ink: "#111d26"
  menu-ink-soft: "#5b6670"
  menu-faint: "#8b95a0"
  menu-ok: "#1f7a4a"
  menu-danger: "#b3261e"
  menu-ink-brand: "#0867c9"
  menu-ink-brand-press: "#0057ad"
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
  menu-title:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  menu-sheet-title:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    letterSpacing: "-0.03em"
  menu-category:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    letterSpacing: "-0.025em"
  menu-item:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  menu-price:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    fontFeature: "\"tnum\""
  menu-body:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  menu-small:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  pill: "9999px"
  app-card: "16px"
  app-control: "10px"
  lp-screen: "12px"
  lp-icon: "12px"
  lp-panel: "24px"
  lp-close: "32px"
  menu-check: "8px"
  menu-input: "12px"
  menu-control: "14px"
  menu-logo: "18px"
  menu-card: "20px"
  menu-sheet: "26px"
spacing:
  lp-wrap: "1180px"
  lp-gutter: "20px"
  lp-section: "clamp(80px, 10vw, 136px)"
  menu-gutter: "16px"
  menu-column: "600px"
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
  menu-button:
    backgroundColor: "{colors.menu-ink-brand}"
    textColor: "#ffffff"
    rounded: "{rounded.menu-control}"
    padding: "0 18px"
    height: "52px"
  menu-button-active:
    backgroundColor: "{colors.menu-ink-brand-press}"
  menu-card:
    backgroundColor: "{colors.menu-surface}"
    textColor: "{colors.menu-ink}"
    typography: "{typography.menu-item}"
    rounded: "{rounded.menu-card}"
    padding: "14px"
    height: "104px"
  menu-add:
    backgroundColor: "{colors.menu-surface}"
    textColor: "{colors.menu-ink-brand}"
    rounded: "{rounded.pill}"
    size: "40px"
  menu-add-filled:
    backgroundColor: "{colors.menu-ink-brand}"
    textColor: "#ffffff"
  menu-tab:
    backgroundColor: "transparent"
    textColor: "{colors.menu-ink-soft}"
    rounded: "{rounded.pill}"
    padding: "9px 15px"
  menu-tab-active:
    backgroundColor: "{colors.menu-ink-brand}"
    textColor: "#ffffff"
  menu-order-bar:
    backgroundColor: "{colors.menu-ink-brand}"
    textColor: "#ffffff"
    rounded: "{rounded.menu-card}"
    height: "62px"
  menu-sheet:
    backgroundColor: "{colors.menu-surface}"
    textColor: "{colors.menu-ink}"
    rounded: "{rounded.menu-sheet}"
    width: "{spacing.menu-column}"
---

# BlueBar design

BlueBar has three worlds, kept apart on purpose. The app (everything behind sign-in) is **Operate**: light, Apple-derived, quiet. The public landing at "/" is **Persuade**: "the bar at night", night navy bands around real BlueBar screens. Tokens prefixed `lp-` belong to the landing only and never enter the app; app tokens never appear on the landing, though BlueBar Blue (#0867c9) is shared by value as the brand. The guest menu at "/menu/<business>", opened from a table's QR code, is **Operate** for guests in the landing's light Salla look, carrying the venue's colour. Tokens prefixed `menu-` belong to the guest menu only; it uses no app or `lp-` tokens, and neither of them uses `menu-` tokens. Staff sign-in and sign-up wear the Salla look too (`.onboard-salla` in src/style.css), light or dark. The frontmatter is normative for all three.

# App (Operate)

Mode: Operate. Simple, practical restaurant POS. No external fonts or heavy UI libraries. Motion is functional only: press feedback (scale .97), ≤200ms colour transitions and the payment dialog entrance; hover styles apply to hover-capable pointers only; reduced motion is respected.

## Shared system
Apple-derived (awesome-design-md/apple): SF/system sans, ink #1d1d1f on parchment #f4f6f8, one Action Blue (#0867c9, hover #0077ed) for actions, selection and focus, pill CTAs/tabs/chips/search, 16px cards and 10px controls, hairline borders, no card shadows, frosted sticky top bar and blurred dialog backdrop, green occupied/positive states, amber (#835615) attention states and one red (#a3322a) for errors, all through the variables at the top of src/style.css. Status always has a text label. Shared fields, search, badges, section headings and empty states in src/components.jsx. Consistent authored SVG icons; no runtime icon library. Visible keyboard focus, skip link, native form validation and a native modal dialog for payment review. Amounts use tabular numerals. Dates have explicit Albanian month names and 24-hour time.

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
Card radius is 16px and control radius 10px; inner tiles and dialogs also use 12px and 14px, not yet reduced to tokens. Body ink is both #1d1d1f and #202428. The base button's hover and pressed greys (#f4f4f4, #ebebeb) are neutral, outside the cool palette.

# Landing (Persuade): "The bar at night"

**Current look: "Salla" (2026-10-28).** The page ships with `.lp-salla`: src/landing-salla.css re-inks landing.css through its variables. Light paper (#f6f7f9) with white bands, or night navy (#0d1c26 / #132836) in dark, following the visitor's light / dark / system choice from one cycling button in the bar (kept in this browser). A corner of a floor plan, tables in outline with a few occupied in green, sits behind the hero and in white on the blue closing block. Section labels are blue chips in sentence case; buttons are solid blue with 12px corners; screenshots sit in a frame whose bar reads "● Bar Aurora". Only the bar blurs. The demo screens and the voice card stay light in both themes. The night description below is the base those variables override.

Source: src/Landing.jsx, src/LandingCounter.jsx, src/landing.css, src/landing-salla.css. Everything below applies to the landing only and is written in Stitch's semantic structure, so the same text can prompt new landing screens. Derived from the shipped CSS and checked in the browser at 1440px and 390px.

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

# Guest menu (Operate, public): the venue's menu in the Salla look

Source: menu.html, src/menu/ (menu.css holds every token and component style, fonts.css the faces, accents.js the venue colours). Everything below applies to the guest menu only. The Identiteti preview in the app (`.mp-*` in src/style.css) mirrors these values by hand; change both together. The earlier "Comanda" guest-check pad (mint paper, Barlow Condensed) is retired; .impeccable/surfaces/src-menu-main-jsx.md still describes it.

## Overview

The landing's light Salla look carrying the venue's own colour: cool paper, white dish cards with the photo on the right, Bricolage Grotesque for names and prices, Figtree for reading. The venue's colour marks only what can be tapped. Light only (`color-scheme: light` in CSS and meta, theme-color menu-paper); a user rule: no dark variant.

## Colors

- **Venue Colour** (menu-ink-brand): set at load from the venue's chosen accent (src/menu/accents.js: blue, terracotta, olive, plum, teal, amber, each AA with white text); blue is the default. It fills the active category pill, the add button once a dish is on the order, checked extras, the main button and the order bar; it inks the logo initials, actionable pills, stepper glyphs, the toast action, the search and note focus border, focus ring (3px at 45%), selection (22%) and caret. **Venue Colour Press** (menu-ink-brand-press): the main button pressed. **Brand soft** (10% of the venue colour on white): the notice, the add button on a card without a photo, pressed pills, the toast action.
- **Paper** (menu-paper): page, sticky tab strip (88% with a 12px blur), photo placeholders, note inputs, stepper track, hover and press washes.
- **Surface** (menu-surface): cards, pills, search, sheets, toasts, the language menu.
- **Line** (menu-line) for every hairline; **Line Strong** (menu-line-strong) for the checkbox border, the sheet grabber and disabled stepper glyphs.
- **Ink** (menu-ink): names, headings, prices, totals. **Ink Soft** (menu-ink-soft): descriptions, tagline, idle tabs, labels, hints, the footer. **Faint** (menu-faint): placeholders, category counts and sold-out names only; too light for text that must be read.
- **OK** (menu-ok): the accepted badge and the success toast's mark. **Danger** (menu-danger): sold out, rejected, the rejection reason, send errors. Status never borrows the venue colour.

## Typography

**Display:** Bricolage Grotesque 650–800 (self-hosted variable woff2, shared with the landing), negative tracking. **Body:** Figtree (same). Sentence case throughout; no uppercase labels.

- **Title** (menu-title): the venue name, 36px from 640px up; the logo initials are 25px/800.
- **Sheet title** (menu-sheet-title), **Category** (menu-category, with the item count beside it in 14px Faint).
- **Item** (menu-item): dish names. **Price** (menu-price, tabular). Order bar count and total 18px/700, check total 28px/700, check amounts 16px/650, stepper value 18px/700.
- **Body** (menu-body): root text; inputs are 16px so iOS never zooms on focus. **Small** (menu-small): two-line clamped descriptions, hints.

All numbers use tabular numerals. Headings balance.

## Layout

One column (menu-column) with gutter menu-gutter, safe-area insets honoured top and bottom. The header is a two-column grid: the 64px logo tile beside the venue name and tagline, then a row of 40px pills (table zero-padded, "my orders" with a count once something was sent, the language menu pushed right), then the search field. Below it the category pills stick to the top, scroll sideways without a scrollbar, and centre the active pill by scrolling only the strip; the active pill follows the last category heading that passed under it.

Each category is a heading over a grid of dish cards, 10px apart. The page reserves bottom room for the order bar when it shows.

## Elevation and shapes

White surfaces on paper with one soft shadow (`0 1px 2px rgba(17,29,38,.05), 0 8px 24px -14px rgba(17,29,38,.22)`): cards and the logo tile. The add button, order bar, sheet, language menu and toasts lift more, each with its own shadow; the order bar's and main button's are tinted with the venue colour. Sheets rise over a 38% ink scrim.

Radii: pills, tabs, add button, stepper and badges fully round; cards, order bar and skeletons 20px (menu-card); sheet 26px on top; logo 18px; photos, search, notice and main button 14px; note inputs and errors 12px; toasts and the language menu 16px; checkboxes 8px.

## Components

- **Dish card** (menu-card): name, two-line description and price beside a 104px photo; minimum 104px tall. The **add button** (menu-add, 40px) sits on the photo's corner, or at the card's right edge on a brand-soft ground when there is no photo; tapping it adds the dish and it fills with the venue colour and the count (scale 1.6 → 1, spring 520/22). A dish with extras opens instead. **Sold out:** name and price in Faint, photo greyscale at 55%, a red "sold out" badge, no add button.
- **Card opened:** unfolds in place (height spring), the photo travelling into a 4:3 print (shared layoutId): description, extras as 48px rows with a 24px checkbox, a note input, then the stepper beside the main button "Shto · <total>", and a close link. One card open at a time.
- **Main button** (menu-button): venue colour, white 700 16px, presses to 0.97 and Venue Colour Press (110ms). **Stepper:** a round track on Paper with two 40px white keys.
- **Category pills** (menu-tab): the filled pill (menu-tab-active) slides to the one being read (layoutId "tab-ink", spring 500/40).
- **Language menu:** a pill that opens a 16px-radius list with 44px rows; the chosen one in venue colour.
- **Order bar** (menu-order-bar): floats at the bottom once something is on the order: count tile, "order" with the table under it, the total rolling through NumberFlow, a chevron. Slides up on a spring (420/40), presses to 0.98, opens the check.
- **Sheets** (menu-sheet): the check and "my orders" rise in a native dialog, max 92dvh. The grabber drags it: down follows the finger, up barely gives; it closes past 140px or on a fast flick; Escape and taps on the scrim close it too. The check: lines with a stepper (down to zero removes), name with extras and note, amount; an order note; the total; the wide main button and a hint. **Sending** lifts the whole sheet away upward (−115vh, −3°, 450ms ease-in) while it still shows what was sent; then a toast confirms.
- **My orders:** newest first: order number and time, a status badge (accepted in OK, rejected in Danger, waiting neutral), the rejection reason, the lines.
- **Toasts:** Sonner, unstyled: a white 16px-radius slip, top centre, with an OK or Danger mark and a brand-soft action.
- **Icons:** one authored SVG stroke set (src/menu/icons.jsx), 24px grid, 2px round strokes, currentColor.

## Motion and libraries

motion (springs, layout, drag; LazyMotion with domMax loaded asynchronously, so the menu paints before motion arrives), @number-flow/react, sonner, clsx. All motion is springs except the send. MotionConfig reducedMotion="user" drops transforms; the sheet then fades, and CSS transitions and the skeleton pulse switch off.

## Do's and Don'ts

- **Do** keep every dish working with and without a photo.
- **Do** keep the venue colour for what can be tapped, and status in OK and Danger.
- **Do** open dishes in place; keep the photo continuous through the shared layout.
- **Don't** add a dark mode.
- **Don't** use emoji, colour gradients or uppercase labels.
- **Don't** set readable text in Faint.
- **Don't** open a dish in a modal popup.
- **Don't** use app or `lp-` tokens here; the faces and BlueBar Blue are shared with the landing by value.
