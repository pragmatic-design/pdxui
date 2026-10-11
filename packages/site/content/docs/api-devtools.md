---
title: Debugging and devtools API
description: "The devtools entry point and overlay, the debug handle, telemetry and navigation recording."
order: 24
parent: api
---

# Debugging and devtools API

The devtools entry point and overlay, the debug handle, telemetry and navigation recording. 7 exports, from `@pdxui/core` and `@pdxui/core/devtools`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `__pdx_debug`

```ts
import { __pdx_debug } from '@pdxui/core';

const __pdx_debug
```

The debug namespace: an export of `@pdxui/core`, and in development the same object as
`window.__PDX_DEVTOOLS__.debug`, which the devtools overlay and the console read.

## `getTelemetryLevel`

```ts
import { getTelemetryLevel } from '@pdxui/core';

function getTelemetryLevel(): TelemetryLevel
```

The current telemetry level: 0 off, 1 errors only (safe in production), 2 full trace (development).

Read it before building an expensive diagnostic payload — at level 0 the tracing calls are no-ops,
but the argument you computed to pass them is not.

## `initDevTools`

```ts
import { initDevTools } from '@pdxui/core/devtools';

function initDevTools(): void
```

Install the DevTools overlay: the Ctrl+Shift+D shortcut and the global handle.

Call it from a development entry point only. It is behind `@pdxui/core/devtools` rather than
the barrel precisely so a production bundle that never imports it never carries the panel, its
polling or its DOM.

## `recordDevtoolsNavigation`

```ts
import { recordDevtoolsNavigation } from '@pdxui/core';

function recordDevtoolsNavigation(entry: Omit<DevtoolsNavigation, 'time'>): void
```

The router records a navigation that finished — matched, refused, or not found.

## `setDevtoolsRouteSource`

```ts
import { setDevtoolsRouteSource } from '@pdxui/core';

function setDevtoolsRouteSource(source: () => DevtoolsRoute | null): void
```

The router says where to read the current route from. One router at a time: the last one wins.

## `setTelemetryLevel`

```ts
import { setTelemetryLevel } from '@pdxui/core';

function setTelemetryLevel(level: TelemetryLevel): void
```

Set telemetry level. 0=off, 1=errors only (prod-safe), 2=full trace (dev).

## `toggle`

```ts
import { toggle } from '@pdxui/core/devtools';

function toggle(): void
```

Show or hide the DevTools overlay, creating it on first use.

While visible it polls every 500ms; hiding it stops the interval, so a panel left open does not
quietly cost a re-read of the signal registry forever. Also bound to Ctrl+Shift+D by
{@link initDevTools}.
