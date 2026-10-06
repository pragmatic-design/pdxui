// Bundle src/pragmatic-design.css → dist/pragmatic-design.css as ONE self-contained file.
//
// Why: the entry uses nested `@import "./x.css" layer(pdx.x)`. That chain resolves fine inside
// the workspace (the pdx() Vite plugin aliases @pdxui/design → src), but an EXTERNAL app that
// installs the package and does `import '@pdxui/design'` does not reliably inline nested
// @import-with-layer from node_modules → tokens never apply (getComputedStyle('--pdx-*') empty).
//
// This inliner flattens every relative @import recursively, wrapping `layer(name)` imports in an
// `@layer name { … }` block (an @import may not live inside a layer block, so children are
// flattened FIRST, then wrapped). The top `@layer …;` ordering statement and all rules are kept
// verbatim. No relative url() exist in the sources, so moving to dist/ breaks no asset paths.
//
// exports."." points here for external consumers; "main" stays on src for the workspace alias.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ENTRY = fileURLToPath(new URL('../src/pragmatic-design.css', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../dist/', import.meta.url));
const OUT = fileURLToPath(new URL('../dist/pragmatic-design.css', import.meta.url));

// Match: @import "./path.css" [layer(name)] ;   Groups: [1]=path [2]=layer name (optional)
const IMPORT_RE = /@import\s+["']([^"']+)["'](?:\s+layer\(([^)]+)\))?\s*;/g;

/** Read a CSS file and recursively inline all of its relative @imports (none remain in output). */
function inline(filePath) {
    const css = readFileSync(filePath, 'utf-8');
    const dir = dirname(filePath);
    return css.replace(IMPORT_RE, (_m, importPath, layerName) => {
        const flattened = inline(resolve(dir, importPath)); // recurse → no @import left inside
        return layerName ? `@layer ${layerName} {\n${flattened}\n}` : flattened;
    });
}

/**
 * Conservative CSS minifier — safe for OKLCH/calc/light-dark values.
 * Only strips comments and structural whitespace; never touches spaces inside
 * value functions (oklch(l c h), calc(a + b)) beyond collapsing runs to one,
 * and never trims around `:` (pseudo vs declaration ambiguity) or combinators.
 */
function minify(css) {
    return css
        .replace(/\/\*[\s\S]*?\*\//g, '') // drop comments
        .replace(/\s+/g, ' ')             // collapse whitespace runs → single space
        .replace(/\s*([{};,])\s*/g, '$1') // trim around structural chars (safe)
        .replace(/;}/g, '}')              // drop last semicolon in a block
        .trim();
}

const bundled = inline(ENTRY);
const minified = minify(bundled);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, minified);
const kbRaw = (Buffer.byteLength(bundled) / 1024).toFixed(1);
const kb = (Buffer.byteLength(minified) / 1024).toFixed(1);
console.log(`[build-css] dist/pragmatic-design.css — ${kb} kB minified (from ${kbRaw} kB), all @imports inlined.`);

// ─── The single-theme entries ───────────────────────────────────────────────
//
// An app that uses one theme should ship one theme: all thirteen cost 10.5 KB gzipped of
// render-blocking CSS it cannot reach. `base` is everything but the themes; `themes/<name>` is one
// theme, layered.
//
// They are flattened here for the same reason the main entry is: an EXTERNAL app installing the
// package cannot reliably resolve nested `@import ... layer(...)` out of node_modules, and the
// failure is silent — the tokens simply never apply. Shipping `src/` to a consumer would
// reproduce exactly the defect this script exists to prevent.
const BASE_SRC = fileURLToPath(new URL('../src/base.css', import.meta.url));
const LAYERED_DIR = fileURLToPath(new URL('../src/themes/layered/', import.meta.url));

writeFileSync(resolve(OUT_DIR, 'base.css'), minify(inline(BASE_SRC)));

const themeOut = resolve(OUT_DIR, 'themes');
mkdirSync(themeOut, { recursive: true });
let n = 0;
for (const file of readdirSync(LAYERED_DIR).filter(f => f.endsWith('.css'))) {
    writeFileSync(resolve(themeOut, file), minify(inline(resolve(LAYERED_DIR, file))));
    n++;
}
const COMPONENTS_DIR = fileURLToPath(new URL('../src/components/layered/', import.meta.url));
const compOut = resolve(OUT_DIR, 'components');
mkdirSync(compOut, { recursive: true });
let c = 0;
for (const file of readdirSync(COMPONENTS_DIR).filter(f => f.endsWith('.css'))) {
    writeFileSync(resolve(compOut, file), minify(inline(resolve(COMPONENTS_DIR, file))));
    c++;
}
// Every theme in one file, for an app that lets the USER pick one and still takes its component
// styles from the components it renders.
writeFileSync(resolve(OUT_DIR, 'themes-all.css'),
    minify(inline(fileURLToPath(new URL('../src/themes-all.css', import.meta.url)))));
console.log(`[build-css] dist/base.css + dist/themes/ + dist/components/ — ${n} themes, ${c} components, flattened.`);
