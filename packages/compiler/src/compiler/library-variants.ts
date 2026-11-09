// What `@pdxui/design` styles for a library component's variant axes (#986).
//
// A library component (a `pdx-` tag, reserved to the library) is drawn by the design package, not by its
// own `<style scoped>`: `pdx-select`'s sizes are `@variant` rules in
// `variant-sources/components/select.css` and `surfaces/inputs.css`. PDX_VARIANT_UNSTYLED is decided
// on those rules for it, as the design build decides it for the TypeScript components
// (`packages/design/scripts/variant-build.mjs`, which reads the same files with the same reader).
//
// The variant sources are not published with `@pdxui/design` (its `files` are `dist/`, `src/` and
// `runtime/`), so they are found in the monorepo, walking up from the compiler to `packages/design`.
// Where they are not found the answer is null, and the caller does not report: a value it cannot
// judge is not called unstyled.

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { moduleDir } from '../module-dir';
import { libraryVariantTests } from './variant-css';

/** The design package's folder, found from `start` upward; null when there is none. */
function designDir(start: string): string | null {
    let dir = start;
    for (let i = 0; i < 8; i++) {
        const candidate = join(dir, 'packages', 'design');
        if (existsSync(join(candidate, 'variant-sources'))) return candidate;
        const up = dirname(dir);
        if (up === dir) break;
        dir = up;
    }
    return null;
}

/** Every `@variant` test of the design package, `tag axis(value)`, read once per folder. */
const cache = new Map<string, Set<string>>();

/** The files that hold library `@variant` rules: the variant sources, then the theme sources. */
function libraryRules(design: string): Set<string> {
    const hit = cache.get(design);
    if (hit) return hit;
    const styled = new Set<string>();
    const add = (css: string, impliedTag: string | undefined) => {
        for (const t of libraryVariantTests(css, impliedTag)) if (t.tag) styled.add(`${t.tag} ${t.axis}(${t.value})`);
    };
    const sources = join(design, 'variant-sources');
    for (const rel of (readdirSync(sources, { recursive: true }) as string[]).map((f) => f.replace(/\\/g, '/')).filter((f) => f.endsWith('.css'))) {
        // Match: a component's own stylesheet, where its tag is implied. Groups: [1]=the name
        const own = /^components\/([\w-]+)\.css$/.exec(rel)?.[1];
        add(readFileSync(join(sources, rel), 'utf8'), own ? `pdx-${own}` : undefined);
    }
    const themes = join(design, 'theme-sources');
    if (existsSync(themes)) {
        for (const f of readdirSync(themes).filter((n) => n.endsWith('.css'))) add(readFileSync(join(themes, f), 'utf8'), undefined);
    }
    cache.set(design, styled);
    return styled;
}

/**
 * The `axis(value)` tests the design package's rules write for `tag`, its axis written as the attribute
 * (`connector-style(dashed)`); null when the design package's sources cannot be found.
 */
export function designStyledValues(tag: string, start: string = moduleDir()): Set<string> | null {
    const design = designDir(start);
    if (!design) return null;
    const prefix = `${tag} `;
    const out = new Set<string>();
    for (const entry of libraryRules(design)) if (entry.startsWith(prefix)) out.add(entry.slice(prefix.length));
    return out;
}
