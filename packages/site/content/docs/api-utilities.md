---
title: Security and utilities API
description: "URL sanitising and the development flag."
order: 24
parent: api
---

# Security and utilities API

URL sanitising and the development flag. 6 exports, from `@pdxui/core`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `DEV`

```ts
import { DEV } from '@pdxui/core';

const DEV
```

True in a development build, false in a production one — a constant, folded by the bundler.

Guard a message that teaches the author something with it, and the branch leaves the production
bundle with its string: `if (DEV) console.warn('…')`. Never guard BEHAVIOUR with it — behaviour
that only happens in dev is a difference between what you tested and what you shipped.

## `generatedId`

```ts
import { generatedId } from '@pdxui/core';

function generatedId(prefix: string): string
```

A new id `<prefix>-<n>`, where `n` counts the ids made with this prefix: `generatedId('pdx-ff')`
gives `pdx-ff-1`, then `pdx-ff-2`. An id built from it — `${id}-input` — is generated as well.

## `processInSlices`

```ts
import { processInSlices } from '@pdxui/core';

function processInSlices(items: ArrayLike<T>, work: (item: T, index: number) => void, options: SliceOptions = {}): Promise<void>
```

Call `work(item, index)` for every item, in order, yielding to input after each slice of about
5 ms. Resolves when every item has been processed; rejects with the signal's reason when
`options.signal` aborts (no later item is processed), or with the error `work` throws.

## `sanitizeBoundUrl`

```ts
import { sanitizeBoundUrl } from '@pdxui/core';

function sanitizeBoundUrl(el: Element, attr: string, raw: unknown): string | null
```

Sanitise a URL bound to `attr` on `el` with the policy of what the URL is used for: media for
`poster`, and for `src` on img/source/video/audio or on a custom element; the link policy for
everything else, a custom element's `href` included. In dev a dropped value is reported once per
element and attribute, with its scheme: an empty `src` and nothing in the console would leave a
dropped URL unnoticed.

## `sanitizeMediaUrl`

```ts
import { sanitizeMediaUrl } from '@pdxui/core';

function sanitizeMediaUrl(raw: unknown): string | null
```

The policy for a URL an element LOADS as media (`<img src>`, `<video poster>`), not one it
navigates to. It accepts what {@link sanitizeUrl} accepts, plus a local object URL (`blob:`,
from `URL.createObjectURL(file)`: the preview of a file the user just picked) and a raster
`data:image/*`. Links keep `sanitizeUrl`, which still rejects both.

## `sanitizeUrl`

```ts
import { sanitizeUrl } from '@pdxui/core';

function sanitizeUrl(raw: unknown): string | null
```

Return the URL if it is safe to use as a navigation/link target, or null if it must be rejected.
Safe = relative URLs, fragments and queries (no scheme), or an explicit scheme in the allow-list
(http/https/mailto/tel/ftp). Anything else — a dangerous/unknown scheme, or control chars used to
smuggle one (`java&#9;script:`) — returns null so the caller can drop it (`?? '#'`, skip nav, …).
