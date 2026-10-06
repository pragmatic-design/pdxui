// A `.pdx` created while the dev server is running has to become usable without a restart.
//
// `ComponentResolver` builds the tag → module map at `buildStart`, and the auto-import that turns
// `<pdx-late-widget>` in a template into an import of the module that declares it consults that map.
// A tag declared afterwards and never taught to the resolver resolves to nothing, so the element
// upgrades to nothing and renders EMPTY — with no error, no warning, and nothing in the console.
//
// Against the published packages, same sources, same browser:
//
//     vite dev, file created after start   customElements.get(...) → false, empty element, silence
//     vite build                            → true, rendered
//
// Three reasons that is worse than an inconvenience: it is silent, it differs between dev and prod,
// and adding a component is the first thing anyone does.
//
// Two things are asserted here, and the second is the one that bites:
//   1. the plugin watches for new .pdx files and teaches the resolver about them;
//   2. rescanning is SAFE — a scan that reports a collision between a file and ITSELF the moment it
//      runs twice would turn the watcher into a stream of false warnings.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ComponentResolver } from '../src/component-resolver';
import { pdx } from '../src/plugin';

const COMPONENT = `<template>
  <em data-test="late">late</em>
</template>

<script setup>
let ready = $signal(true);
</script>
`;

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pdx-hmr-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'first.pdx'), COMPONENT);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('rescanning the project is safe to repeat', () => {
    it('learns the components on the first pass', () => {
        const r = new ComponentResolver();
        r.registerProjectComponents(root);
        expect(r.has('pdx-first'), 'the existing component is known').toBe(true);
    });

    it('reports no collision when the same file is scanned twice', () => {
        // The scan skipped a tag already in the map by REPORTING a collision — which, on a second
        // pass, means the file colliding with itself: `"pdx-first" is taken by src/first.pdx, so
        // src/first.pdx is not auto-importable`. Nonsense, and loud: one such warning per component
        // per new file. Any fix built on rescanning had to fix this first.
        const r = new ComponentResolver();
        r.registerProjectComponents(root);
        r.registerProjectComponents(root);
        expect(r.collisions.map(c => c.message), 'a file cannot collide with itself').toEqual([]);
    });

    it('still reports a REAL collision between two different files', () => {
        // The guard must not be "never report": two files claiming one tag is a genuine problem, and
        // the second one silently losing its auto-import is exactly what the diagnostic exists for.
        mkdirSync(join(root, 'src', 'nested'), { recursive: true });
        writeFileSync(join(root, 'src', 'nested', 'other.pdx'), `<template>\n  <b>x</b>\n</template>\n\n<script setup>\n// @tag 'pdx-first'\nlet n = $signal(1);\n</script>\n`);
        const r = new ComponentResolver();
        r.registerProjectComponents(root);
        r.registerProjectComponents(root);
        const real = r.collisions.filter(c => c.message.includes('pdx-first'));
        expect(real.length, 'two files, one tag: still reported').toBeGreaterThan(0);
        // And reported ONCE, not once per rescan.
        expect(real.length, 'and not multiplied by the number of scans').toBe(1);
    });

    it('picks up a component created after the first scan', () => {
        const r = new ComponentResolver();
        r.registerProjectComponents(root);
        expect(r.has('pdx-late'), 'not there yet').toBe(false);

        writeFileSync(join(root, 'src', 'late.pdx'), COMPONENT);
        r.registerProjectComponents(root);
        expect(r.has('pdx-late'), 'a rescan finds it').toBe(true);
        expect(r.collisions, 'and says nothing about the ones it already knew').toEqual([]);
    });
});

describe('the dev server notices a new .pdx', () => {
    /** The slice of Vite's dev server the plugin is allowed to touch, recorded. */
    function fakeServer() {
        const handlers: Record<string, ((f: string) => void)[]> = {};
        const sent: unknown[] = [];
        const invalidated: string[] = [];
        return {
            sent,
            invalidated,
            fire(event: string, file: string) { (handlers[event] ?? []).forEach(h => h(file)); },
            watcher: { on(event: string, h: (f: string) => void) { (handlers[event] ??= []).push(h); } },
            ws: { send(payload: unknown) { sent.push(payload); } },
            moduleGraph: {
                getModulesByFile: () => undefined,
                idToModuleMap: new Map(),
                invalidateModule(m: { id: string }) { invalidated.push(m.id); },
            },
            config: { root },
        };
    }

    it('registers a watcher at all', () => {
        const plugin = pdx() as unknown as { configureServer?: (s: unknown) => void };
        expect(typeof plugin.configureServer, 'the plugin must hook the dev server').toBe('function');
    });

    it('teaches the resolver and reloads the page when a .pdx appears', () => {
        const plugin = pdx() as unknown as {
            configureServer: (s: unknown) => void;
            buildStart: () => void;
            configResolved: (c: { root: string }) => void;
        };
        plugin.configResolved({ root });
        plugin.buildStart();
        const server = fakeServer();
        plugin.configureServer(server);

        writeFileSync(join(root, 'src', 'late.pdx'), COMPONENT);
        server.fire('add', join(root, 'src', 'late.pdx'));

        // A full reload rather than a partial HMR update: the modules that USE the new tag were
        // already transformed without its import, so patching one module would leave them stale.
        expect(server.sent, 'the page must be reloaded so the new tag resolves')
            .toContainEqual(expect.objectContaining({ type: 'full-reload' }));
    });

    it('ignores files that are not components', () => {
        const plugin = pdx() as unknown as {
            configureServer: (s: unknown) => void;
            configResolved: (c: { root: string }) => void;
        };
        plugin.configResolved({ root });
        const server = fakeServer();
        plugin.configureServer(server);

        writeFileSync(join(root, 'src', 'notes.txt'), 'hello');
        server.fire('add', join(root, 'src', 'notes.txt'));
        expect(server.sent, 'a text file must not reload the page').toEqual([]);
    });
});
