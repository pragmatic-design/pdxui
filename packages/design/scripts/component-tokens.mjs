// Each component's tokens (#154): the `--pdx-<component>-<property>[-<state>]` custom properties the
// design CSS reads for it — what a page may override at `:root`, on a subtree or on one element.
//
// A token belongs to the component whose name is its longest prefix (`--pdx-button-group-gap` is the
// group's, not the button's). Only a token read as the FIRST argument of a `var()` counts: the name
// read as a fallback after it is a renamed token's old name, kept for older themes, and not part of
// the surface. Some namespaces share a component's name and are not its: they are listed here.
//
// Read by packages/ui/scripts/gen-manifest.mjs, which writes the tokens into the manifest's
// `cssProperties`; the lint rule of #514 reuses the ownership defined here.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

/** Namespaces that are a component's name and not its tokens: `--pdx-row-*` sizes a table row, not pdx-row. */
export const GLOBAL_PREFIXES = ['--pdx-row-'];

/** Lazy, as in lint-tokens.mjs: under a bundler `import.meta.url` is not a file: URL, and callers there pass the root. */
function defaultSrc() {
    return fileURLToPath(new URL('../src', import.meta.url));
}

/** Every .css file under a directory, recursively; the generated `layered` copies of the themes left out. */
function cssFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== 'layered') out.push(...cssFiles(p)); }
        else if (name.endsWith('.css')) out.push(p);
    }
    return out.sort();
}

/** The custom properties a CSS text reads first in a `var()`, comments ignored. */
export function primaryReads(css) {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = new Set();
    // Match: `var(` and the property it reads. Groups: [1]=the property
    for (const m of text.matchAll(/var\(\s*(--pdx-[\w-]+)/g)) {
        // A `var()` right after a comma is a fallback, the comma being its enclosing var's.
        const before = text.slice(0, m.index).trimEnd();
        if (before.endsWith(',')) continue;
        out.add(m[1]);
    }
    return out;
}

/** The custom properties `tokens.css` declares, with their values: a token's default. */
function declaredDefaults(src) {
    const css = readFileSync(join(src, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const out = new Map();
    // Match: a declaration of a custom property, after a `;` or `{` it does not consume (the next
    // declaration starts at that `;`). Groups: [1]=property [2]=value
    for (const m of css.matchAll(/(?:^|(?<=[;{]))\s*(--pdx-[\w-]+)\s*:\s*([^;{}]+);/gm)) {
        // `initial` declares the token unset: the reader's fallback is what applies, not a default.
        const value = m[2].trim().replace(/\s+/g, ' ');
        if (!out.has(m[1]) && value !== 'initial') out.set(m[1], value);
    }
    return out;
}

/** The component a token belongs to — the longest name it starts with — or null. */
export function ownerOf(token, names) {
    if (GLOBAL_PREFIXES.some((p) => token.startsWith(p))) return null;
    let best = null;
    for (const name of names) if (token.startsWith(`--pdx-${name}-`) && (!best || name.length > best.length)) best = name;
    return best;
}

/**
 * The tokens of each component, from the design CSS: component name (the tag without `pdx-`) →
 * `{ name, default? }[]`, sorted by name. `src` is packages/design/src.
 */
export function componentTokens(names, src = defaultSrc()) {
    const reads = new Set();
    for (const file of cssFiles(src)) for (const t of primaryReads(readFileSync(file, 'utf8'))) reads.add(t);
    const defaults = declaredDefaults(src);
    const out = new Map();
    for (const token of [...reads].sort()) {
        const owner = ownerOf(token, names);
        if (!owner) continue;
        if (!out.has(owner)) out.set(owner, []);
        out.get(owner).push({ name: token, ...(defaults.has(token) ? { default: defaults.get(token) } : {}) });
    }
    return out;
}
