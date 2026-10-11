---
title: Internationalisation API
description: "Locales and translations, ICU messages, the $t, $d, $n and $r formatters, component strings and right-to-left direction."
order: 24
parent: api
---

# Internationalisation API

Locales and translations, ICU messages, the $t, $d, $n and $r formatters, component strings and right-to-left direction. 33 exports, from `@pdxui/core` and `@pdxui/core/i18n`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `$d`

```ts
import { $d } from '@pdxui/core';

function $d(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string
```

Format a date according to the current locale.
Reactive: re-formats when locale changes.

@example
$d(new Date())                      // "3/29/2026" (en) / "29/03/2026" (it)
$d('2026-03-29', { dateStyle: 'long' })  // "March 29, 2026" (en)

## `$n`

```ts
import { $n } from '@pdxui/core';

function $n(value: number, options?: Intl.NumberFormatOptions): string
```

Format a number according to the current locale.
Reactive: re-formats when locale changes.

@example
$n(1234.5)                          // "1,234.5" (en) / "1.234,5" (it)
$n(0.75, { style: 'percent' })      // "75%"
$n(9.99, { style: 'currency', currency: 'EUR' }) // "9,99 EUR" (it)

## `$r`

```ts
import { $r } from '@pdxui/core';

function $r(value: number, unit: RelativeTimeUnit): string
```

Format a relative time value according to the current locale.
Reactive: re-formats when locale changes.

@example
$r(-1, 'day')   // "1 day ago" (en) / "1 giorno fa" (it)
$r(3, 'hour')   // "in 3 hours" (en) / "tra 3 ore" (it)

## `$t`

```ts
import { $t } from '@pdxui/core';

function $t(key: PdxMessageKey, params?: Record<string, unknown>): string
```

Translate a key with optional parameter interpolation and ICU plurals.
Reads the reactive locale signal — any computed/$effect calling $t() re-runs on locale change.

@example
$t('welcome')                       // simple
$t('hello', { name: 'Alice' })      // interpolation
$t('items', { count: 5 })           // ICU plural

## `clearComponentStrings`

```ts
import { clearComponentStrings } from '@pdxui/core';

function clearComponentStrings(): void
```

Clear all string overrides (reset to defaults). The defaults stay: they were registered by the
component modules, which will not run again.

## `clearFormatCache`

```ts
import { clearFormatCache } from '@pdxui/core/i18n';

function clearFormatCache(): void
```

Clear all formatter caches (for testing).

## `clearLoadedLocales`

```ts
import { clearLoadedLocales } from '@pdxui/core/i18n';

function clearLoadedLocales(): void
```

Clear loaded tracking (for testing).

## `clearTranslations`

```ts
import { clearTranslations } from '@pdxui/core/i18n';

function clearTranslations(): void
```

Clear all loaded translations (for testing).

## `componentStringsChanged`

```ts
import { componentStringsChanged } from '@pdxui/core';

const componentStringsChanged: ReadonlySignal<unknown>
```

A dependency that changes whenever ANY registered string changes.

`getComponentString()` is reactive per key, which serves a template that reads it. What it does
not serve is a component that writes a string into an ATTRIBUTE — `aria-label`, where a library
string usually lands — because that write happens once, imperatively, and nothing re-runs it.
`uiAttr()` in `@pdxui/ui` re-applies those writes, and this is what tells it when.

The VALUE is not meant to be read; the subscription is the point. A fresh array each time, so a
reader is notified whether a key changed, was added, or a whole locale was installed.

## `createI18nLoader`

```ts
import { createI18nLoader } from '@pdxui/core';

function createI18nLoader(config: LoaderConfig): I18nLoader
```

Create an i18n loader that auto-loads translations when locale changes.
Returns a loader with manual load() and dispose() methods.

@example
const loader = createI18nLoader({ mode: 'fetch', basePath: '/api/i18n' });
// Auto-loads when locale changes via effect()
// Manual: await loader.load('it');

## `direction`

```ts
import { direction } from '@pdxui/core';

const direction: ReadonlySignal<'ltr' | 'rtl'>
```

Current document direction (reactive).

## `flipPlacement`

```ts
import { flipPlacement } from '@pdxui/core';

function flipPlacement(placement: string): string
```

Flip a placement (start/end) based on direction.
'top-start' in RTL becomes 'top-end', etc.
Used by positioning engine for direction-aware placement.

## `formatMessage`

```ts
import { formatMessage } from '@pdxui/core';

function formatMessage(message: string, params: Record<string, unknown>): string
```

Format a message already in hand with the rules of `$t()`: ICU plural blocks for the current locale,
then `{name}` interpolation; a placeholder with no value stays as written. The component strings of
@pdxui/ui go through here, so a locale can pluralise "{count} selected".

## `getComponentString`

```ts
import { getComponentString } from '@pdxui/core';

function getComponentString(component: string, key: string, fallback?: string): ReadonlySignal<string>
```

Get a reactive string for a component.
Returns the override if set, otherwise the default.

@example
const placeholder = getComponentString('select', 'placeholder');
// In template: {{ placeholder() }}

## `getComponentStrings`

```ts
import { getComponentStrings } from '@pdxui/core';

function getComponentStrings(component: string): ReadonlySignal<ComponentStrings>
```

Get all strings for a component (reactive): the defaults, with the overrides over them.

## `getLocale`

```ts
import { getLocale } from '@pdxui/core';

function getLocale(): ReadonlySignal<string>
```

Get the current locale as a reactive signal.

## `getSupportedLocales`

```ts
import { getSupportedLocales } from '@pdxui/core';

function getSupportedLocales(): string[]
```

Get supported locale codes.

## `getTranslation`

```ts
import { getTranslation } from '@pdxui/core/i18n';

function getTranslation(key: string, loc?: string): string | undefined
```

Get a raw translation string (no interpolation). Reactive: see {@link loadTranslations}.

## `initI18n`

```ts
import { initI18n } from '@pdxui/core';

function initI18n(config: I18nConfig): void
```

Initialize i18n with configuration. Called once (typically from app root).

## `inlineEnd`

```ts
import { inlineEnd } from '@pdxui/core';

function inlineEnd(): 'left' | 'right'
```

Returns 'right' or 'left' based on current direction. For inline-end.

## `inlineStart`

```ts
import { inlineStart } from '@pdxui/core';

function inlineStart(): 'left' | 'right'
```

Returns 'left' or 'right' based on current direction. For inline-start.

## `isLocaleLoaded`

```ts
import { isLocaleLoaded } from '@pdxui/core/i18n';

function isLocaleLoaded(loc: string): boolean
```

Check if a locale's translations have been loaded.

## `isRTL`

```ts
import { isRTL } from '@pdxui/core';

const isRTL: ReadonlySignal<boolean>
```

Whether the document is RTL (reactive).

## `loadTranslations`

```ts
import { loadTranslations } from '@pdxui/core';

function loadTranslations(loc: string, messages: Record<string, unknown>): void
```

Load translations for a locale. Flattens nested objects to dot notation.
Can be called multiple times to merge translations.

## `registerComponentStrings`

```ts
import { registerComponentStrings } from '@pdxui/core';

function registerComponentStrings(component: string, strings: ComponentStrings): void
```

Register default strings for a component.
Called by component authors to set English defaults.

@example
registerComponentStrings('select', {
    placeholder: 'Select...',
    noResults: 'No results found',
    clear: 'Clear selection',
    loading: 'Loading...',
});

## `resetI18n`

```ts
import { resetI18n } from '@pdxui/core/i18n';

function resetI18n(): void
```

Reset i18n state (for testing).

## `rtlTransformX`

```ts
import { rtlTransformX } from '@pdxui/core';

function rtlTransformX(value: number): number
```

Transform a value for RTL context.
Useful for: margin-left → margin-right, translateX(10) → translateX(-10).

## `setComponentStrings`

```ts
import { setComponentStrings } from '@pdxui/core';

function setComponentStrings(component: string, strings: ComponentStrings): void
```

Override strings for a component (e.g. for i18n).
Merges with existing overrides — only overrides specified keys. An override wins over the
defaults whenever they are registered, before or after it.

@example
setComponentStrings('select', {
    placeholder: 'Seleziona...',
    noResults: 'Nessun risultato',
});

## `setDirection`

```ts
import { setDirection } from '@pdxui/core';

function setDirection(dir: 'ltr' | 'rtl'): void
```

Force set direction (e.g. for testing or user override).

## `setFallbackLocale`

```ts
import { setFallbackLocale } from '@pdxui/core/i18n';

function setFallbackLocale(loc: string): void
```

Set the fallback locale for missing keys.

## `setLocale`

```ts
import { setLocale } from '@pdxui/core';

function setLocale(loc: string): void
```

Change the active locale. Validates against supported list.

## `setLocaleStrings`

```ts
import { setLocaleStrings } from '@pdxui/core';

function setLocaleStrings(locale: Record<string, ComponentStrings>): void
```

Bulk set strings for multiple components at once (e.g. loading a locale file).

@example
setLocaleStrings({
    select: { placeholder: 'Seleziona...', noResults: 'Nessun risultato' },
    datepicker: { today: 'Oggi', clear: 'Cancella' },
    dialog: { close: 'Chiudi' },
});

## `validateIcu`

```ts
import { validateIcu } from '@pdxui/core';

function validateIcu(message: string): string | null
```

Validate an ICU message. Catches the common authoring mistakes:
 - unbalanced braces (the classic `{count, plural, one {# item}` — missing the outer `}`);
 - a plural/select block with no `other` arm (ICU requires it);
 - a malformed rule arm (a category not followed by a `{…}` body).

@returns a human-readable error, or null if the message is well-formed.
