/**
 * The tags of the library's components, from `packages/ui/custom-elements.json`.
 *
 * `component-pages.spec.ts` loads each of their pages once and measures it twice, at phone width and
 * at desktop width; `phone-width.spec.ts` leaves them out of its own route list (#322). Read from the
 * manifest so the list cannot drift from the library: a component added tomorrow is tested tomorrow.
 */
import { readFileSync } from 'node:fs';

interface Decl { tagName: string }

const manifest = JSON.parse(readFileSync(new URL('../../ui/custom-elements.json', import.meta.url), 'utf8')) as {
    modules: { declarations: Decl[] }[];
};

export const LIBRARY_TAGS: string[] = manifest.modules.map((m) => m.declarations?.[0]).filter(Boolean).map((d) => d.tagName);
