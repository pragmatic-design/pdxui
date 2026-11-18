// Core's sub-paths, as an installed app runs them: each its own module, one reactive state (#1213).
//
// `@pdxui/core/reactivity`, `/renderer` and `/component` used to resolve, once built, to the root bundle.
// That cost a bundler that cannot tree-shake one big module (esbuild) the whole of core, and gave
// `import { pipe } from '@pdxui/core/renderer'` the root's `pipe`, the reactivity operator, instead of
// the template helper the sub-path types. Each now has an entry of its own in core's build, sharing
// chunks with the root, so a signal from one path drives an effect from another.
//
// Checked in a child Node process: Node resolves the `import` condition, the packages' `dist/`, as an
// app does. Vitest's own resolver would pick `development`, the TypeScript sources, and prove nothing.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const FRAMEWORK = join(__dirname, '..');

/** Runs an ES module body in Node from this package, where `@pdxui/core` is installed; returns its JSON. */
function inNode<T>(body: string): T {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', body], { cwd: FRAMEWORK, encoding: 'utf8' });
    return JSON.parse(out) as T;
}

const SUBPATHS = ['reactivity', 'renderer', 'component', 'i18n'];

describe("core's sub-paths, built", () => {
    it('each resolves to a module of its own, not the root bundle', () => {
        const resolved = inNode<Record<string, string>>(`
            const out = { root: import.meta.resolve('@pdxui/core') };
            for (const s of ${JSON.stringify(SUBPATHS)}) out[s] = import.meta.resolve('@pdxui/core/' + s);
            console.log(JSON.stringify(out));`);
        expect(resolved.root, 'the root is not the built bundle: this measures src/').toMatch(/\/dist\/pragmatic-core\.es\.js$/);
        for (const s of SUBPATHS) expect(resolved[s], `@pdxui/core/${s}`).toMatch(new RegExp(`/dist/${s}\\.es\\.js$`));
    });

    it('share one reactive state with the root: a signal from one path drives an effect from another', () => {
        const run = inNode<{ seen: number; sameSignal: boolean }>(`
            const root = await import('@pdxui/core');
            const reactivity = await import('@pdxui/core/reactivity');
            const s = reactivity.signal(0);
            let seen = -1;
            root.effect(() => { seen = s(); });
            s.set(5);
            await new Promise((done) => setTimeout(done, 0));
            console.log(JSON.stringify({ seen, sameSignal: root.signal === reactivity.signal }));`);
        expect(run).toEqual({ seen: 5, sameSignal: true });
    });

    it('export, under a name the root also exports, the root\'s own value — except where the root renames it', () => {
        // The renderer's `pipe` is the template helper, which the root exports as `templatePipe`; every
        // other shared name must be the very object the root exports.
        const report = inNode<Record<string, string[]>>(`
            const root = await import('@pdxui/core');
            const out = {};
            for (const s of ${JSON.stringify(SUBPATHS)}) {
                const part = await import('@pdxui/core/' + s);
                out[s] = Object.keys(part).filter((n) => n in root && part[n] !== root[n]);
            }
            out.rendererPipeIsTemplatePipe = [String((await import('@pdxui/core/renderer')).pipe === root.templatePipe)];
            console.log(JSON.stringify(out));`);
        expect(report).toEqual({ reactivity: [], renderer: ['pipe'], component: [], i18n: [], rendererPipeIsTemplatePipe: ['true'] });
    });
});
