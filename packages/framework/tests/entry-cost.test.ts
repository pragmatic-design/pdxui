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
    // 340.0: every component registered, for one signal.
    { name: '@pdxui/framework', code: "import { signal } from '@pdxui/framework'; globalThis.out = signal(0);", ceiling: 340.5 },
    { name: '@pdxui/framework/core', code: "import { signal } from '@pdxui/framework/core'; globalThis.out = signal(0);", ceiling: 4 },
    { name: '@pdxui/framework/router', code: "import { navigate } from '@pdxui/framework/router'; navigate('/');", ceiling: 13.5 },
    // 331.6: what `/ui` is for, an app that wants every component registered.
    { name: '@pdxui/framework/ui', code: "import '@pdxui/framework/ui';", ceiling: 332 },
    { name: '@pdxui/core', code: "import { signal } from '@pdxui/core'; globalThis.out = signal(0);", ceiling: 4 },
    // 1.8 against the root's 3.6, since the sub-path has an entry of its own (#1213): the root
    // module's top level, which a bundler keeps, is not in it. Both were 4.3 when it was the root.
    { name: '@pdxui/core/reactivity', code: "import { signal } from '@pdxui/core/reactivity'; globalThis.out = signal(0);", ceiling: 2 },
    { name: '@pdxui/ui/button', code: "import '@pdxui/ui/button';", ceiling: 16 },
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
