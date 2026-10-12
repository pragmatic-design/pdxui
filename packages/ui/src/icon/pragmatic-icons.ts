// The whole «pragmatic» icon set, up front — for a page with no compiler (`import '@pdxui/ui'`, a CDN)
// or an app that would rather pay for the set once than load an icon a frame late. `pdx-icon` does not
// import this file: a page gets the icons its templates name and its components draw, and loads the
// rest on demand (#47). The SVGs live in `pragmatic-icon-data.ts`.

import { defineIcon } from './icon-map';
import { registerPragmaticResolver } from './pragmatic-resolver';
import { PRAGMATIC_SVGS } from './pragmatic-icon-data';

/** Put every icon of the «pragmatic» set on the page, and register the set. */
export function registerPragmaticIcons(): void {
    for (const [name, svg] of Object.entries(PRAGMATIC_SVGS)) defineIcon(name, svg);
    registerPragmaticResolver();
}

/** Get all available icon names in the Pragmatic set. */
export function getPragmaticIconNames(): string[] {
    return Object.keys(PRAGMATIC_SVGS);
}

/** Total count of built-in icons. */
export const PRAGMATIC_ICON_COUNT = Object.keys(PRAGMATIC_SVGS).length;
