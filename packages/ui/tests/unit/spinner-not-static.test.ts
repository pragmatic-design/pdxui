// The components that draw a spinner only while something loads do not import `pdx-spinner`
// statically (#963, #969).
//
// Since #821 the spinner draws from a stylesheet of its own, so a static import puts its chunk and
// that stylesheet in the first wave of every page that renders the component, and Vite's dynamic
// import helper holds the route until the stylesheet is in: ~70 ms of the showcase's `/` on slow 4G.
// What reaches the first wave is the static import graph, so that is what this reads: every
// `import … from` and side-effect `import '…'` of the package's sources, followed from the
// component's module; an `import()` is a load for later and is not followed.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const SRC = resolve(__dirname, '..', '..', 'src');
const SPINNER = join(SRC, 'spinner', 'pdx-spinner.ts');

// Match: a static import's specifier — `import x from '…'`, `import { a } from '…'`, `import '…'`,
// `export … from '…'` — at the start of a line, never `import(` and never `import type`.
// Groups: [1]=the specifier
const STATIC = /^\s*(?:import(?!\s+type\b)(?:\s+[^'"();]+?\s+from)?|export\s+[^'"();]+?\s+from)\s*['"]([^'"]+)['"]/gm;

/** The package source a relative specifier names, or null for a package import or a stylesheet. */
function resolveFrom(file: string, spec: string): string | null {
    if (!spec.startsWith('.')) return null;
    const base = resolve(dirname(file), spec);
    for (const candidate of [base, `${base}.ts`, join(base, 'index.ts')]) {
        if (candidate.endsWith('.ts') && existsSync(candidate)) return candidate;
    }
    return null;
}

/** Every package source `entry` reaches through static imports, itself included. */
function staticClosure(entry: string): Set<string> {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
        const file = queue.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        for (const m of readFileSync(file, 'utf8').matchAll(STATIC)) {
            const next = resolveFrom(file, m[1]);
            if (next && !seen.has(next)) queue.push(next);
        }
    }
    return seen;
}

describe('a component that draws a spinner only while loading', () => {
    it.each([
        ['pdx-list', 'list/pdx-list.ts'],
        ['pdx-data-grid', 'data-grid/pdx-data-grid.ts'],
        ['pdx-infinite-scroll', 'infinite-scroll/pdx-infinite-scroll.ts'],
        ['pdx-block-ui', 'block-ui/pdx-block-ui.ts'],
    ])('%s does not load pdx-spinner statically', (_tag, file) => {
        expect(staticClosure(join(SRC, file)).has(SPINNER), `${file} reaches spinner/pdx-spinner.ts through static imports`).toBe(false);
    });

    it('control — the walk finds a static import where there is one', () => {
        // `pdx-spinner` imports its own stylesheet and `@pdxui/core`; a module that imports the spinner
        // statically is the one the rows above say none of them is.
        expect(staticClosure(join(SRC, 'spinner', 'pdx-spinner.ts')).has(SPINNER)).toBe(true);
        expect(staticClosure(join(SRC, 'list', 'pdx-list.ts')).size, 'the walk followed nothing').toBeGreaterThan(1);
    });
});
