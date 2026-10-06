// The visitor's density, in one place.
//
// The profile menu's Settings set it, and so does the account page: two writers, so the rule
// lives here and both call it.
//
// The density is the design system's `--pdx-density-factor`, set inline on <html> as
// CONTRIBUTING.md says (a style property, not an attribute selector), and remembered in the browser like
// the rail. The scheme is not here: it is core's (`setScheme`, `getScheme`), and a store of its
// own here would split core's precedence — the visitor's choice, then the document's `pdx-scheme`,
// then the OS — in two.

import { signal } from '@pdxui/core';
import type { ReadonlySignal } from '@pdxui/core';

export const DENSITIES = ['compact', 'normal', 'comfortable'] as const;
export type Density = (typeof DENSITIES)[number];

const DENSITY_KEY = 'showcase.density';
const FACTOR: Record<Density, string> = { compact: '0.75', normal: '1', comfortable: '1.25' };

/** What the visitor chose, or `normal`, as it is in storage. */
export function storedDensity(): Density {
    const saved = localStorage.getItem(DENSITY_KEY);
    return (DENSITIES as readonly string[]).includes(saved ?? '') ? (saved as Density) : 'normal';
}

const _density = signal<Density>(storedDensity());
/**
 * The density, as a signal: the profile menu derives its radios from it, and pdx-menu updates a
 * same-shape items array in place, so the menu is not rebuilt under the pointer.
 */
export const density: ReadonlySignal<Density> = _density;

/** Put a density on the page without remembering it — the boot applies the stored one this way. */
export function applyDensity(key: string): void {
    const root = document.documentElement.style;
    if (key === 'normal' || !(key in FACTOR)) root.removeProperty('--pdx-density-factor');
    else root.setProperty('--pdx-density-factor', FACTOR[key as Density]);
}

/** Remember a density and put it on the page. */
export function setDensity(key: Density): void {
    localStorage.setItem(DENSITY_KEY, key);
    _density.set(key);
    applyDensity(key);
}
