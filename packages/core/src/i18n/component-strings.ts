// Component String Registry — translatable default strings for UI components.
// Each component registers its default strings. Consumers override per-locale.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────

/** Default strings for a component, keyed by string ID. */
export type ComponentStrings = Record<string, string>;

/** Strings keyed by component name. */
type StringRegistry = Map<string, ComponentStrings>;

// ─── Global registry ──────────────────────────────────────────

// Two maps, never merged: the defaults each component registers when its module is imported, and the
// overrides an app installs. A lookup reads the override first. With one map, whoever wrote last would
// win — and a component imported after `setLocaleStrings` would put its English back.
const _defaults = signal<StringRegistry>(new Map());
const _overrides = signal<StringRegistry>(new Map());

function mergeInto(registry: typeof _defaults, component: string, strings: ComponentStrings): void {
    registry.set(prev => {
        const next = new Map(prev);
        next.set(component, { ...(next.get(component) ?? {}), ...strings });
        return next;
    });
}

/**
 * Register default strings for a component.
 * Called by component authors to set English defaults.
 *
 * @example
 * registerComponentStrings('select', {
 *     placeholder: 'Select...',
 *     noResults: 'No results found',
 *     clear: 'Clear selection',
 *     loading: 'Loading...',
 * });
 */
export function registerComponentStrings(component: string, strings: ComponentStrings): void {
    mergeInto(_defaults, component, strings);
}

/**
 * Override strings for a component (e.g. for i18n).
 * Merges with existing overrides — only overrides specified keys. An override wins over the
 * defaults whenever they are registered, before or after it.
 *
 * @example
 * setComponentStrings('select', {
 *     placeholder: 'Seleziona...',
 *     noResults: 'Nessun risultato',
 * });
 */
export function setComponentStrings(component: string, strings: ComponentStrings): void {
    mergeInto(_overrides, component, strings);
}

/**
 * Get a reactive string for a component.
 * Returns the override if set, otherwise the default.
 *
 * @example
 * const placeholder = getComponentString('select', 'placeholder');
 * // In template: {{ placeholder() }}
 */
export function getComponentString(component: string, key: string, fallback?: string): ReadonlySignal<string> {
    return computed(() => _overrides().get(component)?.[key]
        ?? _defaults().get(component)?.[key]
        ?? fallback
        ?? key);
}

/**
 * A dependency that changes whenever ANY registered string changes.
 *
 * `getComponentString()` is reactive per key, which serves a template that reads it. What it does
 * not serve is a component that writes a string into an ATTRIBUTE — `aria-label`, where a library
 * string usually lands — because that write happens once, imperatively, and nothing re-runs it.
 * `uiAttr()` in `@pdxui/ui` re-applies those writes, and this is what tells it when.
 *
 * The VALUE is not meant to be read; the subscription is the point. A fresh array each time, so a
 * reader is notified whether a key changed, was added, or a whole locale was installed.
 */
export const componentStringsChanged: ReadonlySignal<unknown> = computed(() => [_defaults(), _overrides()]);

/**
 * Get all strings for a component (reactive): the defaults, with the overrides over them.
 */
export function getComponentStrings(component: string): ReadonlySignal<ComponentStrings> {
    return computed(() => ({
        ...(_defaults().get(component) ?? {}),
        ...(_overrides().get(component) ?? {}),
    }));
}

/**
 * Bulk set strings for multiple components at once (e.g. loading a locale file).
 *
 * @example
 * setLocaleStrings({
 *     select: { placeholder: 'Seleziona...', noResults: 'Nessun risultato' },
 *     datepicker: { today: 'Oggi', clear: 'Cancella' },
 *     dialog: { close: 'Chiudi' },
 * });
 */
export function setLocaleStrings(locale: Record<string, ComponentStrings>): void {
    _overrides.set(prev => {
        const next = new Map(prev);
        for (const [component, strings] of Object.entries(locale)) {
            next.set(component, { ...(next.get(component) ?? {}), ...strings });
        }
        return next;
    });
}

/**
 * Clear all string overrides (reset to defaults). The defaults stay: they were registered by the
 * component modules, which will not run again.
 */
export function clearComponentStrings(): void {
    _overrides.set(new Map());
}
