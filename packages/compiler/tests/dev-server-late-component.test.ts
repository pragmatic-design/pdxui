// A `.pdx` created while the dev server runs is served as the component it is, and its edits are
// served too. Asserted against a real Vite dev server, not a stand-in.
//
// The failure it guards against: after the reload, the server serving
// `component('pdx-x', { props: {}, render: … <div></div> })` — no setup — and ignoring every later
// edit until a restart. The three ways a file comes into existence below are each served as the real
// component and then as its edits. This file keeps that scripted repro so the claim cannot go stale.
//
// Two traps of the repro, both in the watcher rather than in the plugin:
//   - a file written while chokidar is still scanning src/ is part of the initial scan: no 'add'.
//     So nothing is written until src/ is actually watched;
//   - chokidar drops a 'change' that lands within 50 ms of the previous one for the same path. Each
//     case below makes one edit at most after the file appears, so none of them depends on timing.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdx } from '../src/plugin';

const V1 = (name: string) => `<template>\n  <em>${name} first version {{ label }}</em>\n</template>\n\n<script setup>\nlet label = $signal('one');\n</script>\n`;
const V2 = (name: string) => V1(name).replace('first version', 'second version');
// A stub, as a source: a template and nothing else.
const STUB = '<template>\n  <div></div>\n</template>\n';

const APP = `<template>
  <pdx-late-full></pdx-late-full>
  <pdx-late-empty></pdx-late-empty>
  <pdx-late-stub></pdx-late-stub>
</template>

<script setup>
let n = $signal(1);
</script>
`;

let root: string;
let server: ViteDevServer;
const events: string[] = [];

type Watched = { getWatched(): Record<string, string[]> };

beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pdx-late-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<!doctype html><script type="module" src="/src/main.js"></script>');
    writeFileSync(join(root, 'src', 'main.js'), "import './app.pdx';\n");
    writeFileSync(join(root, 'src', 'app.pdx'), APP);

    server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [pdx({ devtools: false })],
        // The suite runs with cwd = packages/compiler and the root in the temp directory. No
        // `fs: { allow: [root] }` is needed here: the server allows its root itself.
        server: { port: 0, strictPort: false, hmr: false },
        optimizeDeps: { noDiscovery: true, include: [] },
    });
    await server.listen();
    server.watcher.on('all', (event: string, file: string) => {
        events.push(`${event} ${file.replace(/\\/g, '/').replace(/.*\/src\//, '')}`);
    });
    // 'ready' covers the root; src/ is scanned after it. Write nothing until src/ is watched.
    await vi.waitFor(() => {
        expect((server.watcher as unknown as Watched).getWatched()[join(root, 'src')] ?? []).toContain('app.pdx');
    }, { timeout: 20_000, interval: 20 });
}, 60_000);

afterAll(async () => {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
});

/** Wait for the watcher to report `event` on `file`, and — for a change — for Vite to drop the old transform. */
async function reported(event: 'add' | 'change', file: string): Promise<void> {
    await vi.waitFor(() => { expect(events).toContain(`${event} ${file}`); }, { timeout: 10_000, interval: 10 });
    if (event === 'change') {
        // Vite awaits the plugins' watchChange before invalidating: the event alone comes too early.
        await vi.waitFor(() => {
            const mod = server.moduleGraph.getModuleById(join(root, 'src', file).replace(/\\/g, '/'));
            expect(mod?.transformResult ?? null).toBeNull();
        }, { timeout: 10_000, interval: 10 });
    }
}

async function served(file: string): Promise<string> {
    return (await server.transformRequest(`/src/${file}`))?.code ?? '';
}

describe('a .pdx created while the dev server runs', () => {
    it('written in one go: the real component, then the edited one', async () => {
        writeFileSync(join(root, 'src', 'late-full.pdx'), V1('full'));
        await reported('add', 'late-full.pdx');

        expect(await served('app.pdx'), 'the page that uses the tag imports the new module').toMatch(/import ["'][^"']*\/late-full\.pdx/);
        const first = await served('late-full.pdx');
        expect(first).toContain("component('pdx-late-full'");
        expect(first, 'the setup is compiled, not a stub').toContain('setup(ctx)');
        expect(first).toContain('full first version');

        writeFileSync(join(root, 'src', 'late-full.pdx'), V2('full'));
        await reported('change', 'late-full.pdx');
        const edited = await served('late-full.pdx');
        expect(edited, 'the edit is served').toContain('full second version');
        expect(edited).not.toContain('full first version');
    }, 30_000);

    it('created empty, as an editor does, then written: the real component once it has content', async () => {
        writeFileSync(join(root, 'src', 'late-empty.pdx'), '');
        await reported('add', 'late-empty.pdx');
        // Served while still empty, the file would be three newlines and nothing else: three
        // bytes, HTTP 200, no component and no message, and whoever sees it goes hunting their own
        // markup. A blank .pdx raises, so the page gets an overlay and the log a line.
        await expect(served('late-empty.pdx')).rejects.toThrow(/PDX_EMPTY_SOURCE/);

        writeFileSync(join(root, 'src', 'late-empty.pdx'), V1('empty'));
        await reported('change', 'late-empty.pdx');
        const real = await served('late-empty.pdx');
        expect(real).toContain('setup(ctx)');
        expect(real).toContain('empty first version');
    }, 30_000);

    it('created as a bare template, then replaced: the stub does not stick', async () => {
        writeFileSync(join(root, 'src', 'late-stub.pdx'), STUB);
        await reported('add', 'late-stub.pdx');
        const stub = await served('late-stub.pdx');
        expect(stub).toContain("component('pdx-late-stub'");
        expect(stub, 'control — the stub really is a stub').not.toContain('setup(ctx)');

        writeFileSync(join(root, 'src', 'late-stub.pdx'), V1('stub'));
        await reported('change', 'late-stub.pdx');
        const real = await served('late-stub.pdx');
        expect(real).toContain('setup(ctx)');
        expect(real).toContain('stub first version');
    }, 30_000);
});
