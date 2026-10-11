---
title: Testing API
description: "Mounting a component in a test, queries by role, text and test id, events, typing and waiting."
order: 24
parent: api
---

# Testing API

Mounting a component in a test, queries by role, text and test id, events, typing and waiting. 14 exports, from `@pdxui/core/testing`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `cleanup`

```ts
import { cleanup } from '@pdxui/core/testing';

function cleanup(): void
```

Remove all mounted containers from the DOM.

## `clear`

```ts
import { clear } from '@pdxui/core/testing';

function clear(element: HTMLElement): Promise<void>
```

Clear an input's value.

## `click`

```ts
import { click } from '@pdxui/core/testing';

function click(element: HTMLElement): Promise<void>
```

Simulate a click.

## `findByText`

```ts
import { findByText } from '@pdxui/core/testing';

function findByText(container: HTMLElement, text: string | RegExp, timeout?: number): Promise<HTMLElement>
```

Find element by text content, waiting until it appears.

## `fireEvent`

```ts
import { fireEvent } from '@pdxui/core/testing';

function fireEvent(el: Element, eventName: string, detail?: unknown): void
```

Dispatch a DOM event on an element with optional detail payload.
Supports standard events (click, input) and CustomEvents.

## `getByRole`

```ts
import { getByRole } from '@pdxui/core/testing';

function getByRole(container: HTMLElement, role: string, options?: { name?: string | RegExp }): HTMLElement
```

Find element by ARIA role. Throws if not found.

## `getByTestId`

```ts
import { getByTestId } from '@pdxui/core/testing';

function getByTestId(container: HTMLElement, id: string): HTMLElement
```

Find element by data-testid attribute. Throws if not found.

## `getByText`

```ts
import { getByText } from '@pdxui/core/testing';

function getByText(container: HTMLElement, text: string | RegExp): HTMLElement
```

Find element by text content. Throws if not found.

## `mount`

```ts
import { mount } from '@pdxui/core/testing';

function mount(html: string): Promise<HTMLElement>
```

Mount HTML into a container, wait for custom elements to upgrade.
Returns the container element for querying.

## `queryByRole`

```ts
import { queryByRole } from '@pdxui/core/testing';

function queryByRole(container: HTMLElement, role: string, options?: { name?: string | RegExp }): HTMLElement | null
```

Find element by ARIA role. Returns null if not found.

## `queryByText`

```ts
import { queryByText } from '@pdxui/core/testing';

function queryByText(container: HTMLElement, text: string | RegExp): HTMLElement | null
```

Find element by text content. Returns null if not found.

## `tick`

```ts
import { tick } from '@pdxui/core/testing';

function tick(): Promise<void>
```

Flush all pending signal effects and microtasks.
Useful after signal.set() to verify DOM updates.

## `type`

```ts
import { type } from '@pdxui/core/testing';

function type(element: HTMLElement, text: string): Promise<void>
```

Simulate typing text into an input/textarea. Fires input + change events.

## `waitFor`

```ts
import { waitFor } from '@pdxui/core/testing';

function waitFor(condition: () => boolean | Promise<boolean>, timeout = 3000): Promise<void>
```

Wait for a condition function to return true.
Polls every 50ms, throws after timeout (default 3000ms).
