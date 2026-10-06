---
title: Printing an app
description: What a business screen looks like on paper, what the design system does about it by default, and the escape hatches.
---

# Printing an app

A work order gets signed on paper. An invoice gets filed. A ticket summary goes in an envelope to
someone who will never open the application. Printing is not nostalgia in a business application —
it is a delivery format, and the browser's Ctrl+P is the whole of its UI.

The design system ships a print stylesheet, on by default with `@pdxui/design`. This page says
what it does, what it deliberately does not, and how to override it.

## What happens by default

Every rule below is measured under real print media
(`packages/responsive/tests/integration/ui-components/print.spec.ts`), not asserted here and hoped
for.

**The chrome is not on the paper.** The shell's header, aside and footer, the navbar, the sidebar,
the toolbar, the bottom nav and the floating action button are all `display: none`. Navigation is
something you click; on paper it is ink spent on controls nobody can press, and it steals the width
the content needs. The main region then widens to the page — measured: it is wider on paper than
on screen, because the sidebar's column is gone.

**A scrolling region prints its content, not its viewport.** A `.pdx-scroll-area` with
`max-height: 120px` over 600px of content shows 120px on screen and, without this, 120px on paper —
the rest silently truncated. Every clip is lifted: the scroll area, the data grid's body, an
expanded collapse.

**Tables survive the page break.** `thead` becomes `table-header-group`, which is what makes the
browser repeat the header on every page — the single most useful thing a print stylesheet does for
a business screen. Rows, cards and list items get `break-inside: avoid`, so a row is not cut in
half across two sheets.

**Nothing animates.** Every transition and animation is off. This is not tidiness: measured, a card
switched to print media animated its shadow away over 200ms instead of losing it, and what prints
is whatever frame the printer caught.

**Ink, not light.** Shadows go (they print as a grey smear) and cards keep their border instead, so
a surface is still a surface on a monochrome printer. Glass loses its blur, which prints as a grey
box.

## What it deliberately does not do

**Overlays are not printed** — not the dialog, the drawer, the bottom sheet, the toast, the tooltip
or the popover. This is a decision rather than an omission, and the alternatives are worse: a
dialog printed *on top of* the document underneath gives two documents on one page, and a dialog
printed *instead of* it silently drops the page the user was looking at. An application that needs
the contents of a dialog on paper gives that dialog its own print or export action, where it can
decide what the document is.

**Colours are not forced.** The framework does not rewrite your palette for print: a themed
application keeps its colours, and whether the printer is monochrome is something only you know.
If you need it, `print-color-adjust: exact` on a region tells the browser to print the backgrounds
it would otherwise drop.

**No page numbers, headers or footers.** Those are `@page` margin boxes, and support is uneven
enough that the design system would be promising something it cannot deliver everywhere.

## The escape hatches

```html
<!-- Never printed, whatever it is -->
<div data-pdx-no-print>…</div>

<!-- Print each link's destination after its text, for a document meant to be read offline -->
<article class="pdx-print-urls">…</article>
```

For anything else, your own `@media print` block wins: the design system's rules live in the
`pdx.print` layer, and **unlayered CSS beats every layer**. A plain `@media print { … }` in your
application stylesheet overrides all of the above without a single `!important`.

```css
@media print {
    /* keep the sidebar on the paper after all */
    .pdx-sidebar { display: block; }
}
```

## Why it is its own layer

This is worth knowing if you ever wonder where a print rule went. A later layer wins over an earlier
one whatever the specificity, so a print block in the `pdx.adaptive` layer — which comes **before**
`pdx.themes` in the cascade — would be overridden by every theme's own card shadow, and never apply
at all. Measured, not reasoned about: in that layer the card prints with its shadow.

`pdx.print` is the last layer in `base.css`, after `pdx.composition`. That is the only place a
print stylesheet can be and still be a print stylesheet.

## Checking your own screen

Do not print to check. Chromium, Firefox and Safari all emulate print media in their dev tools
(Rendering → *Emulate CSS media type: print*), and Playwright does it in one line — which is how
every claim on this page is kept true:

```ts
await page.emulateMedia({ media: 'print' });
expect(await navbar.boundingBox()).toBeNull();
```
