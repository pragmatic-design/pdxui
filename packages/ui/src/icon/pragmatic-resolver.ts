// The «pragmatic» resolver: an icon the page has is drawn at once; a name that is not loaded yet — one
// that arrived through data, which no compiler can see — imports its own module, one small chunk, and
// is drawn when it arrives, a frame later. The load is cached per name, so a list of a hundred rows
// with the same icon asks once. A name outside the set draws nothing, and says so in development.

import { registerIconSet, DEV } from '@pdxui/core';
import { defineIcon, definedIcon } from './icon-map';
import { PRAGMATIC_LOADERS } from './pragmatic-loaders';

const loading = new Map<string, Promise<string>>();

/** The SVG of a «pragmatic» icon: now when the page has it, as a promise when it has to load first. */
export function pragmaticIcon(name: string): string | Promise<string> {
    const svg = definedIcon(name);
    if (svg !== undefined) return svg;
    const load = Object.hasOwn(PRAGMATIC_LOADERS, name) ? PRAGMATIC_LOADERS[name] : undefined;
    if (!load) {
        if (DEV && name) console.warn(`[pdx-icon] "${name}" is not an icon of the pragmatic set, so nothing is drawn. The set's names: getPragmaticIconNames() from '@pdxui/ui/icon/pragmatic-icons'.`);
        return '';
    }
    let pending = loading.get(name);
    if (!pending) {
        // A load that failed (the network) is forgotten, so the next draw of the name asks again.
        pending = load().then((m) => { defineIcon(name, m.default); return m.default; }, (err: unknown) => { loading.delete(name); throw err; });
        loading.set(name, pending);
    }
    return pending;
}

/** Register the «pragmatic» set as an icon set, over the icons the page has and loads. */
export function registerPragmaticResolver(): void {
    registerIconSet('pragmatic', pragmaticIcon);
}
