// The generated table of component strings is every key the library registers, and nothing else.
//
// To stop shipping "Close dialog" in its accessibility tree, an Italian app needs the list of keys,
// not a repo path to read. The keys are declared in fifteen places — shared/i18n.ts,
// data-grid/grid-i18n.ts (~60 keys), the router's outlet.ts among them — and a hand-written list
// would drift from them the first time someone added one.
//
// So the table in the skill is generated (gen-catalog.mjs, from the sources), and this checks it
// against what actually happens at runtime: every module of @pdxui/ui and the router's outlet is
// imported, every `registerComponentStrings` call is recorded, and the two sets must be equal.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const registered = vi.hoisted(() => new Map<string, Record<string, string>>());

vi.mock('@pdxui/core', async (importOriginal) => {
    const core = await importOriginal<typeof import('@pdxui/core')>();
    return {
        ...core,
        registerComponentStrings(component: string, strings: Record<string, string>): void {
            registered.set(component, { ...(registered.get(component) ?? {}), ...strings });
            core.registerComponentStrings(component, strings);
        },
    };
});

// Static imports, like recipe-long-form.test.ts: loading the whole library takes ~4s cold, and inside
// a beforeAll that runs into the 10s hook budget when the full gate holds the CPU. vi.mock above is
// hoisted over these, so every registration is still recorded.
import '../../src/index';
import '../../../router/src/outlet';

const REFERENCE = join(__dirname, '../../../../marketplace/plugins/pdxui/skills/pdxui/references/component-strings.md');

/** The table's rows as `component key → default`. */
function tableRows(): Map<string, string> {
    const text = readFileSync(REFERENCE, 'utf-8').replace(/\r\n/g, '\n');
    const rows = new Map<string, string>();
    // Match: | `component` | `key` | `default` | … — a key may be dotted (`filter.contains`).
    // Groups: [1]=component [2]=key [3]=default
    for (const m of text.matchAll(/^\| `([\w-]+)` \| `([\w.]+)` \| `((?:[^`\\]|\\.)*)` \|/gm)) {
        rows.set(`${m[1]} ${m[2]}`, m[3].replace(/\\\|/g, '|'));
    }
    return rows;
}

describe('the component-strings reference', () => {
    it('recorded the registrations it is checked against', () => {
        // The control: an import that registered nothing would make both sides empty and equal.
        expect(registered.size).toBeGreaterThan(40);
        expect(registered.get('data-grid'), 'the grid registers its own ~60 keys').toBeDefined();
        expect(registered.get('router'), 'the router outlet registers its own').toBeDefined();
    });

    it('lists every registered key with its default, and nothing else', () => {
        const runtime = new Map<string, string>();
        for (const [component, strings] of registered) {
            for (const [key, value] of Object.entries(strings)) runtime.set(`${component} ${key}`, value);
        }
        const table = tableRows();
        const missing = [...runtime.keys()].filter(k => !table.has(k));
        const extra = [...table.keys()].filter(k => !runtime.has(k));
        const wrongDefault = [...runtime].filter(([k, v]) => table.has(k) && table.get(k) !== v).map(([k]) => k);
        expect({ missing, extra, wrongDefault }).toEqual({ missing: [], extra: [], wrongDefault: [] });
    });
});

describe('the i18n recipe', () => {
    const recipes = readFileSync(join(__dirname, '../../../../marketplace/plugins/pdxui/skills/pdxui/references/recipes.md'), 'utf-8').replace(/\r\n/g, '\n');
    const section = recipes.slice(recipes.indexOf("### Our components' strings"), recipes.indexOf('### Do both'));

    it('points at the generated table for the keys', () => {
        expect(section).toContain('references/component-strings.md');
    });

    it('writes paths as a consumer sees them, not as the repo lays them out', () => {
        // `packages/ui/src/…` exists in this repo and nowhere in an app; `node_modules/@pdxui/ui/src/…`
        // exists in both, because the packages ship their sources.
        expect(section).not.toMatch(/(?<!@pdxui\/)\bpackages\/(ui|router)\/src\b/);
        expect(section).toContain('node_modules/@pdxui/ui/src/shared/i18n.ts');
    });
});
