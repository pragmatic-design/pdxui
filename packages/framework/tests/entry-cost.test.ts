// What each public entry costs an app that takes one thing from it (#1212).
//
// `@pdxui/framework` re-exports `@pdxui/ui`, whose root registers every custom element when it is
// imported, so an app that takes `signal` from the framework's root downloads the whole component
// library, and no bundler can drop it: registering is a side effect. `/core` costs what it is used for.
// The README says so; this holds the numbers, as `packages/showcase/tests/bundle-budget.spec.ts`
// holds the showcase's: a ceiling that may only go down, and a slack beyond which it must be lowered.
//
// Each consumer is built the way an app is: Vite's production build of a module that imports one
// export, against the packages' built `dist/` (the `import` condition, never `development`), minified,
// code-split. The number is what a browser fetches before the module runs: the entry chunk and its
// static imports, gzipped. CSS is not counted.

import { describe, it, expect } from 'vitest';
import { build, type Rollup } from 'vite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const FRAMEWORK = join(__dirname, '..');

/** The framework's own entries, read off its `exports` as a consumer's resolver reads them. */
function frameworkAliases(): { find: RegExp; replacement: string }[] {
    const pkg = JSON.parse(readFileSync(join(FRAMEWORK, 'package.json'), 'utf8')) as { exports: Record<string, { import?: string } | string> };
    return Object.entries(pkg.exports)
        .filter((e): e is [string, { import: string }] => typeof e[1] === 'object' && typeof e[1].import === 'string')
        .map(([key, target]) => ({
            find: new RegExp(`^@pdxui/framework${key.slice(1).replace('/', '\\/')}$`),
            replacement: join(FRAMEWORK, target.import),
        }));
}

/** The gzipped KB a browser fetches before running a module whose whole source is `code`. */
async function initialKb(code: string): Promise<{ kb: number; modules: string[] }> {
    const CONSUMER = '\0consumer';
    const result = await build({
        configFile: false,
        root: FRAMEWORK,
        logLevel: 'silent',
        mode: 'production',
        // Vite reads `development|production` from NODE_ENV, which is `test` here: named outright,
        // so the packages resolve to `dist/` as they do in an app's build.
        resolve: { alias: frameworkAliases(), conditions: ['module', 'browser', 'production'] },
        define: { 'process.env.NODE_ENV': '"production"' },
        plugins: [{
            name: 'consumer',
            resolveId: (id) => (id === CONSUMER ? id : null),
            load: (id) => (id === CONSUMER ? code : null),
        }],
        build: {
            write: false,
            minify: 'esbuild',
            target: 'es2022',
            cssCodeSplit: true,
            rollupOptions: { input: CONSUMER, preserveEntrySignatures: false },
        },
    });
    const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput;
    const chunks = new Map(output.output.filter((o): o is Rollup.OutputChunk => o.type === 'chunk').map((c) => [c.fileName, c]));
    const entry = [...chunks.values()].find((c) => c.isEntry);
    if (!entry) throw new Error('the consumer built no entry chunk');
    const seen = new Set<string>();
    const stack = [entry.fileName];
    while (stack.length) {
        const name = stack.pop()!;
        if (seen.has(name)) continue;
        seen.add(name);
        stack.push(...(chunks.get(name)?.imports ?? []));
    }
    const bytes = [...seen].reduce((sum, name) => sum + gzipSync(chunks.get(name)!.code, { level: 9 }).length, 0);
    const modules = [...seen].flatMap((name) => Object.keys(chunks.get(name)!.modules));
    return { kb: Math.round((bytes / 1024) * 10) / 10, modules };
}

/**
 * Each consumer, and its ceiling in KB gzip. Measured 2026-11-18 on the built packages; each ceiling
 * is the measurement rounded up to the next 0.5 KB. The ceiling may only go down: raising one is
 * argued for in the commit that raises it.
 */
const CONSUMERS: { name: string; code: string; ceiling: number }[] = [
    // 337.1: every component registered, for one signal (340.0 before #1207's lighter codegen, 336.9
    // after). The library's move to .pdx (#1210) adds to it while both forms are in the bundle: the
    // first three atoms, each lighter than its TypeScript module alone, add 0.2 KB here, since html``'s
    // runtime stays for the other components and the compiled render comes with each moved one.
    // 338.5 after #1233 (+1.0): core's static rows (eachStatic, a stale row rebuilt, collectIfAny) and
    // `@empty` rendered by the list on the client, the server and in hydration. What it buys: a row
    // that reads only its item mounts with no item signal and no scope, and a `@for … @empty` with no
    // when() around it — pdx-kbd from 1.17–1.22× its TypeScript version to 0.92–0.99×. Both live in
    // modules of their own (list-static.ts, list-empty.ts) that an app without them does not bundle;
    // every component registered uses both, so here they are counted whole.
    // 338.8 after #1210's second atoms (+0.3): pdx-divider, pdx-spinner and pdx-progress, each lighter
    // than its TypeScript module alone (0.93×, 0.78×, 0.86×), for the reason the first three added 0.2.
    // 339.1 after #1237 (+0.3): value rows, a row that reads its item as a value updated in place on
    // a new item — core's collectRowRuns and the in-place update in list-static.ts. What it buys, on
    // js-framework-benchmark's script time: create 1k −21%, replace −19%, update every 10th −29%.
    // 339.6 after #1210's third atoms: pdx-chip, pdx-button-group and pdx-radio, each lighter than its
    // TypeScript module alone (0.96×, 0.74×, 1.04× with its form scope), for the reason the first
    // batches added: html``'s runtime stays for the other components, and hostClass comes in with the
    // group's `@host :class`. Measured on the rebuilt dists, as CI measures it; a tenth kept above.
    // 340.2 after #1210's fourth atoms (+0.5): pdx-button, pdx-checkbox and pdx-input, each lighter
    // alone (0.83×, 0.96×, 1.04× with its password-manager module), for the same reason; the compiled
    // two-way bindings they are the first to use (::value, ::checked) come in with them.
    // 340.6 after #1210's inputs (CI's line: 340.5): the text fields, the groups, masked-input and
    // tag-input, then pdx-segmented and pdx-color-picker (1.09×, 1.03× alone), for the same reason; the
    // compiled `@render` and keyed `@for` come in with tag-input, core's render-snippet module (#1303).
    // 340.9 after pdx-slider and pdx-rating (CI's line: 340.8; 0.93× and 1.04× alone), for the same
    // reason. 341.1 after pdx-toggle with pdx-toggle-group, the untracked mount (#1309) and
    // pdx-number-input (CI's line: 341.0; 0.98× and 0.96× alone), for the same reason. 341.3 after
    // pdx-inline-edit (CI's line: 341.2; 0.87× alone with its strings module), for the same reason.
    // 341.5 after pdx-infinite-scroll and pdx-sortable-list (measured here: 341.4; 1.00× and 0.88×
    // alone), for the same reason. 341.7 after pdx-list, pdx-empty-state and pdx-statistic (measured
    // here: 341.6; 0.90×, 0.90× and 0.81× alone), for the same reason. 342.0 after pdx-split-button
    // (measured here: 341.9; 0.88× alone), for the same reason. 342.3 after pdx-image (measured here:
    // 342.2; 0.92× alone), for the same reason. 342.5 after pdx-dropdown-menu (measured here: 342.4;
    // 0.89× alone), for the same reason. 342.8 after pdx-file-upload (measured here: 342.7; 1.08×
    // alone, its template compiled where html`` stays for the components not moved yet). 343.0 after
    // pdx-form-section, pdx-col, pdx-bottom-nav, pdx-relative-time and pdx-scroll-spy (measured here:
    // 342.9; 0.93×, 0.95×, 0.98×, 0.91× and 0.88× alone), for the same reason. 343.2 after
    // pdx-banner (measured here: 343.1; 1.07× alone with its icons module), for the same reason. 343.4
    // after the moves since, the last pdx-entity-grid (measured here: 343.3; 0.96× alone with its
    // icons and rows modules), for the same reason. 343.7 after pdx-alert-dialog (measured here:
    // 343.6; 1.03× alone, its template compiled where its buttons were wired imperatively). 343.9
    // after pdx-drawer (measured here: 343.8): 0.91× alone, but the moves before it left the entry
    // 0.1 KB from its ceiling, and its compiled template is laid out unlike the TypeScript file.
    // 344.3 after pdx-mention (measured here: 344.2): 0.89× alone with its four modules, the entry
    // +0.3 KB; the cause of the difference is not isolated — the move splits one module into five.
    // 344.6 after pdx-transfer (measured here: 344.5): 0.89× alone with its three modules, the entry
    // +0.3 KB, as for pdx-mention: the move splits one module into four.
    // 344.9 after pdx-cascader (measured here: 344.8): 0.85× alone with its three modules, the entry
    // +0.2 KB, as for the two above; the built component carries no setup return, so the growth is
    // not a DEV branch left in. Listed in #1287 as a cost the moves share.
    // 345.2 after pdx-date-picker (measured here: 345.1): 0.88× alone with its modules, the entry
    // +0.2 KB, as for the moves above (#1287). 345.4 after pdx-page-header (measured here: 345.3):
    // the showcase does not render it, so this entry is where its weight is read (#1379); the
    // module alone is 1333 B against 1003 B, its template's compiled blocks. 345.7 after
    // pdx-bulk-actions (measured here: 345.6), the same reason: 1703 B alone against 1459 B (#1379).
    // 345.9 after pdx-autocomplete (measured here: 345.8): 0.95× alone (4636 against 4902 B), but its
    // option list's template compiles to blocks where the TypeScript version shared html``'s engine.
    { name: '@pdxui/framework', code: "import { signal } from '@pdxui/framework'; globalThis.out = signal(0);", ceiling: 345.9 },
    // 1.6, from 3.6 (#1246): core's modules that did work at load — viewport, adaptive, online, rtl,
    // the overlay stack, the context protocol, the theme, the splash — left `sideEffects`, and a
    // signal no longer brings them. The same for `@pdxui/core` below.
    { name: '@pdxui/framework/core', code: "import { signal } from '@pdxui/framework/core'; globalThis.out = signal(0);", ceiling: 2 },
    { name: '@pdxui/framework/router', code: "import { navigate } from '@pdxui/framework/router'; navigate('/');", ceiling: 13.5 },
    // 328.5: what `/ui` is for, an app that wants every component registered (331.6 before #1207).
    // 330.1 after #1233 (+1.1), for the same core code as the root's above. 330.6 after #1237 (+0.2
    // from 330.4), for the root's reason. 331.1 after #1210's fourth atoms, for the root's reason.
    // 331.7 after #1210's inputs (CI's line: 331.6), for the root's reason. 331.9 after pdx-slider and
    // pdx-rating (CI's line: 331.8). 332.2 after the toggles, the untracked mount and pdx-number-input
    // (CI's line: 332.1). 332.4 after pdx-inline-edit (CI's line: 332.3). 332.6 after
    // pdx-infinite-scroll and pdx-sortable-list (measured here: 332.5). 332.8 after pdx-list,
    // pdx-empty-state and pdx-statistic (measured here: 332.7). 333.1 after pdx-split-button (measured
    // here: 333.0). 333.3 after pdx-image (measured here: 333.2). 333.5 after pdx-navbar (measured
    // here: 333.4). 333.8 after pdx-file-upload (measured here: 333.7). 334.0 after pdx-form-section,
    // pdx-col, pdx-bottom-nav, pdx-relative-time and pdx-scroll-spy (measured here: 333.9). 334.3
    // after pdx-banner (measured here: 334.2). 334.5 after the moves since, the last pdx-entity-grid
    // (measured here: 334.4). 334.9 after pdx-alert-dialog (measured here: 334.8). 335.4 after
    // pdx-mention (measured here: 335.3), as for the entry above. 335.6 after pdx-transfer (measured
    // here: 335.5), as for the entry above. 335.9 after pdx-cascader (measured here: 335.8), as for
    // the entry above. 336.2 after pdx-date-picker (measured here: 336.1), as for the entry above.
    // 336.4 after pdx-page-header (measured here: 336.3), as for the entry above. 336.7 after
    // pdx-bulk-actions (measured here: 336.6), as for the entry above. 336.8 after pdx-autocomplete
    // (measured here: 336.7, on the ceiling), as for the entry above.
    { name: '@pdxui/framework/ui', code: "import '@pdxui/framework/ui';", ceiling: 336.8 },
    { name: '@pdxui/core', code: "import { signal } from '@pdxui/core'; globalThis.out = signal(0);", ceiling: 2 },
    // 1.8 against the root's 3.6, since the sub-path has an entry of its own (#1213): the root
    // module's top level, which a bundler keeps, is not in it. Both were 4.3 when it was the root.
    // The root is 1.6 since #1246, above.
    { name: '@pdxui/core/reactivity', code: "import { signal } from '@pdxui/core/reactivity'; globalThis.out = signal(0);", ceiling: 2 },
    // 10.1, from 16 (#1210): pdx-button is a compiled .pdx, and a page that registers it alone no
    // longer brings html``'s template engine with it.
    { name: '@pdxui/ui/button', code: "import '@pdxui/ui/button';", ceiling: 10.2 },
];
/** How far under its ceiling a measurement may sit before the ceiling must come down. */
const SLACK_KB = 2;

describe('what each public entry costs an app', () => {
    const measured = new Map<string, number>();
    const measure = async (name: string) => {
        if (!measured.has(name)) {
            const consumer = CONSUMERS.find((c) => c.name === name)!;
            const { kb, modules } = await initialKb(consumer.code);
            // The resolver reached the built packages, not their TypeScript sources.
            expect(modules.filter((m) => /[\\/]packages[\\/][^\\/]+[\\/]src[\\/]/.test(m)), `${name} was built from src/, not dist/`).toEqual([]);
            // And the consumer survived the build: a call whose result nothing reads is dropped from a
            // side-effect-free module, which measured `@pdxui/core/reactivity` at 0 KB (#1213). Each
            // consumer keeps what it takes on `globalThis`.
            expect(kb, `${name} measured ${kb} KB: the build dropped the consumer, so this measures nothing`).toBeGreaterThan(1);
            measured.set(name, kb);
        }
        return measured.get(name)!;
    };

    for (const { name, ceiling } of CONSUMERS) {
        it(`${name}: within its ceiling, and the ceiling within ${SLACK_KB} KB of it`, async () => {
            const kb = await measure(name);
            console.log(`[entry-cost] ${name}: ${kb} KB gzip (ceiling ${ceiling})`);
            expect(kb, `${name} costs ${kb} KB gzip, its ceiling is ${ceiling} — say in the commit why it grew`).toBeLessThanOrEqual(ceiling);
            expect(ceiling - kb, `${name}'s ceiling is ${ceiling} KB and it costs ${kb} — lower the ceiling`).toBeLessThanOrEqual(SLACK_KB);
        }, 120_000);
    }

    it('the root costs at least a button more than /core: what it registers is in the measurement', async () => {
        // The control: a consumer that resolved to nothing would pass every ceiling above.
        const root = await measure('@pdxui/framework');
        const core = await measure('@pdxui/framework/core');
        const button = await measure('@pdxui/ui/button');
        expect(root - core).toBeGreaterThan(button);
    }, 240_000);
});
