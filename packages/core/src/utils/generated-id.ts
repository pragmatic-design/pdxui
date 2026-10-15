/**
 * generatedId (#391): the id a component makes up for an element of its own — a field's input, a
 * listbox, a tab — so that `aria-labelledby`, `aria-controls` and `for` can point at it.
 *
 * Such an id comes from a counter, so it depends on how many components of the kind were mounted
 * before: the same field is `pdx-ff-1` on a page opened directly and `pdx-ff-44` after a visit to
 * another one. It is fine for ARIA, which reads it in the same page, and wrong as an address: in
 * development every generated id is recorded, and `__PDX_DEVTOOLS__.outline()` never gives one as a
 * selector, nor an id built from one (`pdx-ff-1-input`).
 */

import { DEV } from './env';

const counters = new Map<string, number>();
const generated = new Set<string>();

/**
 * A new id `<prefix>-<n>`, where `n` counts the ids made with this prefix: `generatedId('pdx-ff')`
 * gives `pdx-ff-1`, then `pdx-ff-2`. An id built from it — `${id}-input` — is generated as well.
 */
export function generatedId(prefix: string): string {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    const id = `${prefix}-${n}`;
    if (DEV) generated.add(id);
    return id;
}

/**
 * Whether `id` was made by {@link generatedId}, or built from such an id: `pdx-ff-1` and
 * `pdx-ff-1-input` are; an author's `email` is not. Development only: in a build nothing is recorded.
 */
export function isGeneratedId(id: string): boolean {
    if (generated.has(id)) return true;
    for (let i = id.indexOf('-'); i > 0; i = id.indexOf('-', i + 1)) {
        if (generated.has(id.slice(0, i))) return true;
    }
    return false;
}
