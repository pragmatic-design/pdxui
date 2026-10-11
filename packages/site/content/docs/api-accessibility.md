---
title: Accessibility API
description: "Focus management, focus traps, roving tabindex, active descendant, live regions and the announcer."
order: 24
parent: api
---

# Accessibility API

Focus management, focus traps, roving tabindex, active descendant, live regions and the announcer. 14 exports, from `@pdxui/core`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `announce`

```ts
import { announce } from '@pdxui/core';

function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void
```

Announce a message to screen readers via ARIA live region.

Usage:
  announce('Item added to cart');
  announce('Error: invalid email', 'assertive');

## `createLiveRegion`

```ts
import { createLiveRegion } from '@pdxui/core';

function createLiveRegion(): LiveRegion
```

Create or get the global live region for screen reader announcements.

@example
const live = createLiveRegion();
live.announce('Item deleted'); // polite (default)
live.announce('Error: connection lost', 'assertive');

## `destroyAnnouncer`

```ts
import { destroyAnnouncer } from '@pdxui/core';

function destroyAnnouncer(): void
```

Remove the live region from DOM (cleanup).

## `focusFirst`

```ts
import { focusFirst } from '@pdxui/core';

function focusFirst(container: HTMLElement): HTMLElement | null
```

Focus the first focusable element inside a container.
Returns the focused element, or null if none found.

## `focusGroup`

```ts
import { focusGroup } from '@pdxui/core';

function focusGroup(container: HTMLElement, options?: FocusGroupOptions): Dispose
```

Enable focus group pattern on a container.
Arrow keys navigate between items. Only one item has tabindex="0".
Supports type-ahead, aria-activedescendant, and skip-disabled.

## `focusLast`

```ts
import { focusLast } from '@pdxui/core';

function focusLast(container: HTMLElement): HTMLElement | null
```

Focus the last focusable element inside a container.

## `focusRestore`

```ts
import { focusRestore } from '@pdxui/core';

function focusRestore(): FocusRestoreReturn
```

Create a save/restore focus pair with automatic fallback.
If the saved element is removed from the DOM before restore(),
focus is moved to the nearest focusable ancestor.

## `focusTrap`

```ts
import { focusTrap } from '@pdxui/core';

function focusTrap(container: HTMLElement, options?: FocusTrapOptions): Dispose
```

Activate a focus trap on the given container.
- Tab/Shift+Tab cycles within the container.
- Siblings are hidden from screen readers via aria-hidden. With several traps active, only the
  most recent one is exposed.
- Returns a Dispose function to deactivate.

## `getFocusableElements`

```ts
import { getFocusableElements } from '@pdxui/core';

function getFocusableElements(container: HTMLElement): HTMLElement[]
```

Get all focusable elements inside a container.

## `manageFocusOrder`

```ts
import { manageFocusOrder } from '@pdxui/core';

function manageFocusOrder(container: HTMLElement, options?: FocusOrderOptions): Dispose
```

Manage Tab order between composite child components within a container.
Each direct child is treated as a "tab stop" — Tab moves between them,
Arrow keys are handled internally by each component's own focus group.

## `roving`

```ts
import { roving } from '@pdxui/core';

function roving(container: HTMLElement, options?: RovingOptions): Dispose
```

Enable roving tabindex pattern on a container.
Only ONE item inside the container has tabindex="0" (the active one).
All others have tabindex="-1". Arrow keys move focus between items.

This is a convenience wrapper around focusGroup() — backward compatible API.

Usage:
  const dispose = roving(tablistElement, {
    orientation: 'horizontal',
    onSelect: (el, i) => activateTab(i),
  });

## `saveFocus`

```ts
import { saveFocus } from '@pdxui/core';

function saveFocus(): () => void
```

Save and restore focus — useful for modals/drawers.

Usage:
  const restore = saveFocus();
  openModal();
  // ... later
  closeModal();
  restore(); // returns focus to original element

## `useActiveDescendant`

```ts
import { useActiveDescendant } from '@pdxui/core';

function useActiveDescendant(controller: () => HTMLElement | null, listbox: () => HTMLElement | null, options?: ActiveDescendantOptions): ActiveDescendantReturn
```

@param controller - Element that has focus and receives keyboard events (e.g. input).
@param listbox - Element containing the items (e.g. dropdown list).

## `useRovingTabindex`

```ts
import { useRovingTabindex } from '@pdxui/core';

function useRovingTabindex(el: () => HTMLElement | null, options?: RovingTabindexOptions): RovingTabindexReturn
```

The roving tabindex pattern: a group of controls that Tab enters ONCE, and the arrow keys move
within.

Exactly one item is `tabindex=0` at a time and the rest are `-1`, so a toolbar of twelve buttons
costs one Tab stop instead of twelve. That is the WAI-ARIA rule for tabs, toolbars, menus and
radio groups, and getting it wrong is the most common keyboard defect in a component library.

`orientation` picks which arrows move (horizontal by default), `wrap` decides whether the last
item leads back to the first, and disabled items are skipped rather than focused.
