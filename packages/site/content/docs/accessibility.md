---
title: Accessibility
description: "Keeping focus where it belongs, giving it back, and telling a screen reader what just happened."
order: 15.05
---

# Accessibility

The components in `@pdxui/ui` ship their ARIA, their keyboard handling and their focus management
already done — the certification suite measures all three on every one of them, in every theme. This
page is for the other case: **you are building something the library does not ship**, and you need the
same primitives it uses.

Two subjects, and they are the two that are always done badly by hand: where the **focus** is, and
what a **screen reader** is told.

## Keeping focus inside

A dialog that does not trap focus lets Tab walk out into the page behind it — which for a keyboard
user means the dialog is still open and unreachable:

```ts
import { focusTrap } from '@pdxui/core';

const release = focusTrap(panel, {
  initialFocus: 'first',      // or 'last', or an element
  restoreFocus: true,         // put focus back where it was, on release (default)
  escapeDeactivates: true,    // Escape releases the trap (default)
});

// later
release();
```

It does three things, and the third is the one people forget: Tab and Shift+Tab cycle inside the
container; Escape releases it; and **everything else on the page is hidden from screen readers** with
`aria-hidden`, so a screen-reader user is not read the page *behind* the dialog. With several traps
active only the most recent is exposed — a dialog that opens a dialog behaves correctly.

`<pdx-dialog>`, `<pdx-alert-dialog>`, `<pdx-bottom-sheet>` and `<pdx-command>` are each one call to
this.

## Giving it back

`restoreFocus: true` covers the common case. When the thing that had focus may be **gone** by the time
you restore — a row that was deleted, a page that navigated — use the pair, which falls back to the
nearest focusable ancestor instead of dropping focus onto `<body>`:

```ts
import { focusRestore, saveFocus } from '@pdxui/core';

const focus = focusRestore();
focus.save();
// …the panel opens, the row is deleted, whatever happens…
focus.restore();
focus.dispose();
```

`saveFocus()` is the one-shot form: it returns the restore function directly.

## A group of controls

One Tab stop for the whole group, arrows to move inside it — the pattern behind tabs, toolbars,
menus, radio and button groups:

```ts
import { focusGroup } from '@pdxui/core';

const release = focusGroup(toolbar, {
  orientation: 'horizontal',   // 'vertical' | 'both' (default)
  wrap: true,                  // arrow past the end → back to the start (default)
  typeAhead: true,             // a letter jumps to the next item starting with it
});
```

`items: () => HTMLElement[]` overrides the selector, and is there for the case a selector cannot
express: a group of the same kind **nested inside** the group — `pdx-tabs` in a `pdx-tabs` panel. A
selector matches both; a getter that returns only the direct children does not.

> **`focusGroup` or `useRovingTabindex`?** They solve the same problem from two directions.
> [`useRovingTabindex`](/docs/composables) is the composable: you give it a getter, it gives you
> `activeIndex` and `focusNext()` as signals, and it manages `tabindex` on the items. `focusGroup` is
> the imperative one: a container, a `Dispose`, no state handed back. Inside a `.pdx` component reach
> for the composable; in a plain function, or when you only want the keys handled, `focusGroup`.

One level up sits `manageFocusOrder(container)`, for a region assembled out of **several composite
components**: each direct child becomes one tab stop, Tab moves between them, and the arrows inside
each are left to that child's own focus group. It is what you want when a toolbar contains a tab
strip and a button group rather than plain buttons — `focusGroup` on the region would fight the
children for the arrow keys.

Below them sit the three that do one thing each: `getFocusableElements(container)` is the list, in
tab order; `focusFirst(container)` and `focusLast(container)` move focus and return what they focused,
or `null` when there was nothing focusable.

## Telling the screen reader

A visual change that a sighted user simply sees — "3 items deleted", "saved", "7 results" — reaches
nobody else unless you say it:

```ts
import { announce } from '@pdxui/core';

announce(`${count} items deleted`);              // polite: waits for a pause
announce('Upload failed', 'assertive');          // interrupts
```

**Polite is the default and is almost always right.** `assertive` interrupts whatever is being read,
which is correct for an error the user must act on and rude for anything else.

`announce` writes into a single shared live region created on first use. `createLiveRegion()` makes
your own when a subsystem needs one it controls, and `destroyAnnouncer()` tears the shared one down —
which a test needs, and an application does not.

The framework already announces one thing for you: `<pdx-router-outlet>` announces the new page's
title on every navigation, because a route change moves no focus and a screen reader would otherwise
be told nothing at all.

## What the components already do

Before building any of this by hand, the shorter path: the library's own components are measured
against four dimensions on every commit — the ARIA contract, axe-core, immunity to hostile CSS, and
the WAI-ARIA keyboard pattern. If `<pdx-dialog>` fits, it arrives with all four.

This page is for what it does not fit.
