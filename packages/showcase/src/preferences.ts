// The visitor's density, in one place.
//
// The profile menu's Settings set it, and so does the account page: two writers, so the rule
// lives here and both call it.
//
// The density is the design system's `pdx-density` attribute on <html>, which sets
// `--pdx-density-factor` over the theme's own default (the rules are in `pdx.preferences`, the layer
// after the themes), and is remembered in the browser like the rail. `normal` is no attribute: the
// theme's own density, which is what this app called normal before it had a choice. The scheme is not here: it is core's (`setScheme`, `getScheme`), and a store of its
// own here would split core's precedence — the visitor's choice, then the document's `pdx-scheme`,
// then the OS — in two.

import { signal } from '@pdxui/core';
import type { ReadonlySignal } from '@pdxui/core';

export const DENSITIES = ['compact', 'normal', 'comfortable'] as const;
export type Density = (typeof DENSITIES)[number];

const DENSITY_KEY = 'showcase.density';
/** The design system's name for each choice. `normal` is none: the theme's own density. */
const ATTRIBUTE: Record<Density, string | null> = { compact: 'compact', normal: null, comfortable: 'comfort' };

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
    const value = key in ATTRIBUTE ? ATTRIBUTE[key as Density] : null;
    if (value) document.documentElement.setAttribute('pdx-density', value);
    else document.documentElement.removeAttribute('pdx-density');
}

/** Remember a density and put it on the page. */
export function setDensity(key: Density): void {
    localStorage.setItem(DENSITY_KEY, key);
    _density.set(key);
    applyDensity(key);
}
