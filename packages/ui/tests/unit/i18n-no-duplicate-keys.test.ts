// One key, one default.
//
// `registerComponentStrings` merges, so two modules registering the same component key both "work"
// — and the winner is whichever loaded last. That is not a thing anyone should have to reason about:
// with `wizard.stepOf` declared as `Step {n} of {total}` in one file and `Step {current} of {total}`
// in another, load order decides which placeholder name the call site has to use, and a string that
// reads fine fails its tests.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../src');

function sources(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) sources(p, acc);
        else if (e.endsWith('.ts')) acc.push(p);
    }
    return acc;
}

/** component → key → the files that declare a default for it. */
function declarations(): Map<string, Map<string, string[]>> {
    const out = new Map<string, Map<string, string[]>>();
    const add = (component: string, key: string, file: string): void => {
        if (!out.has(component)) out.set(component, new Map());
        const keys = out.get(component)!;
        keys.set(key, [...(keys.get(key) ?? []), file]);
    };

    for (const file of sources(SRC)) {
        const text = readFileSync(file, 'utf-8');
        const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');

        // registerComponentStrings('name', { key: '…', … })
        for (const m of text.matchAll(/registerComponentStrings\('([\w-]+)',\s*\{([^}]*)\}/g)) {
            for (const k of m[2].matchAll(/^\s*'?([\w.]+)'?\s*:/gm)) add(m[1], k[1], rel);
        }
        // The shared table: 'name': { key: '…' } entries inside DEFAULTS.
        if (rel === 'shared/i18n.ts') {
            const table = text.slice(text.indexOf('const DEFAULTS'), text.indexOf('registerUiDefaults'));
            for (const m of table.matchAll(/^\s{4}'?([\w-]+)'?:\s*\{([\s\S]*?)\},$/gm)) {
                // Values emptied first: a default ending in a colon — 'Link URL:' — would read as a key `URL`.
                const entries = m[2].replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
                for (const k of entries.matchAll(/([\w]+):\s*'/g)) add(m[1], k[1], rel);
            }
        }
    }
    return out;
}

describe('component strings are declared exactly once', () => {
    it('finds declarations at all', () => {
        const d = declarations();
        expect(d.size, 'no component registers strings — the parser is broken').toBeGreaterThan(10);
        expect(d.get('wizard')?.has('stepOf'), 'a known key is seen').toBe(true);
    });

    it('no key has two defaults', () => {
        const clashes: string[] = [];
        for (const [component, keys] of declarations()) {
            for (const [key, files] of keys) {
                if (files.length > 1) clashes.push(`${component}.${key} in ${files.join(' and ')}`);
            }
        }
        expect(clashes, 'load order would decide which default wins').toEqual([]);
    });
});
