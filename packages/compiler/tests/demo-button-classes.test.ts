// The showcase's demos give a button only classes a stylesheet defines (#1045).
//
// Nineteen sections wrote native buttons as `class="pdx-btn pdx-btn-sm pdx-btn-outline"` and the
// like. None of those names is defined in packages/design: `pdx-btn-sm` and `pdx-btn-xs` size a button
// only inside `.pdx-toolbar` (components/toolbar.css), and `pdx-btn`, `pdx-btn-outline`,
// `pdx-btn-error` and `pdx-sm` have no rule at all. So the buttons were drawn at the full height
// (40 px measured, block-ui), and as the default button where the unknown name was the only variant.
// The site's demo pages and the agent skill are generated from these sections: they taught a
// vocabulary that does not exist.
//
// A native button is small with `size="sm"` (surfaces/buttons.css) and takes a variant that exists:
// `pdx-outline`, `pdx-danger`, `pdx-ghost`…

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const PAGES = join(REPO, 'packages', 'compiler', 'demo', 'showcase-new', 'pages');

/** Every file under `dir` whose name `match` accepts, subfolders included unless `deep` is false. */
function filesIn(dir: string, match: (name: string) => boolean, deep = true, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { if (deep) filesIn(full, match, deep, out); }
        else if (match(name)) out.push(full);
    }
    return out;
}

// The markup the same vocabulary reaches beyond the demos (#1047): the certification manifests'
// scenarios, the hand-written scenario pages (the generated ones are the manifests'), and the
// builder's preview.
const FIXTURES = [
    ...filesIn(join(REPO, 'packages', 'responsive', 'tests', 'manifests'), (n) => n.endsWith('.manifest.ts'), false),
    ...filesIn(join(REPO, 'packages', 'ui', 'tests', 'scenarios'), (n) => n.endsWith('.html'), false),
    ...filesIn(join(REPO, 'packages', 'builder', 'preview'), (n) => n.endsWith('.html'), false),
];

/** Class names no stylesheet defines anywhere, and what to write instead. */
const UNDEFINED: Record<string, string> = {
    'pdx-btn': 'nothing: a native <button> is a button already',
    'pdx-btn-outline': 'pdx-outline',
    'pdx-btn-error': 'pdx-danger',
    'pdx-sm': 'size="sm"',
};

/** Defined only inside a toolbar: allowed in a file that has one, size="sm" elsewhere. */
const TOOLBAR_ONLY = new Set(['pdx-btn-sm', 'pdx-btn-xs']);

/** The `file: class → fix` of every class attribute naming a class that sizes or styles nothing there. */
function offences(file: string): string[] {
    const source = readFileSync(file, 'utf8');
    const hasToolbar = /pdx-toolbar/.test(source);
    const rel = relative(REPO, file).replace(/\\/g, '/');
    const found: string[] = [];
    // Match: a static `class="…"` attribute (a bound `:class` is not a literal list). Groups: [1]=the classes
    for (const m of source.matchAll(/(?<![:\w-])class="([^"]*)"/g)) {
        for (const name of m[1].split(/\s+/)) {
            if (name in UNDEFINED) found.push(`${rel}: ${name} → ${UNDEFINED[name]}`);
            else if (TOOLBAR_ONLY.has(name) && !hasToolbar) found.push(`${rel}: ${name} → size="sm" (it sizes a button only inside .pdx-toolbar)`);
        }
    }
    return found;
}

describe('showcase demos give buttons only classes a stylesheet defines (#1045)', () => {
    const files = filesIn(PAGES, (n) => n.endsWith('.pdx'));

    it('found the demos, so the assertion below is not vacuous', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it('no class attribute names a class that styles nothing where it is used', () => {
        expect(files.flatMap(offences)).toEqual([]);
    });
});

describe('certification fixtures and the builder preview do too (#1047)', () => {
    it('found them, so the assertion below is not vacuous', () => {
        expect(FIXTURES.length).toBeGreaterThan(100);
        expect(FIXTURES.some((f) => f.endsWith('composition.html'))).toBe(true);
    });

    it('no class attribute names a class that styles nothing where it is used', () => {
        expect(FIXTURES.flatMap(offences)).toEqual([]);
    });
});
