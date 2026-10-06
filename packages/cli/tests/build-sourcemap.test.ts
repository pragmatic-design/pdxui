// `pdx build --sourcemap [true|hidden|false]`: the SPA build hands the value to Vite's
// `build.sourcemap`; the standalone build writes the compiler's map beside each `.js`. Absent, the
// output has no `.map` anywhere.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import buildCmd from '../src/commands/build';

const COUNTER = '<template><button @click="count++">{{ count }}</button></template>\n' +
    '<script setup>\nlet count = $signal(0);\n</script>\n';

function tmpRoot(name: string): string {
    return join(tmpdir(), `pdx-build-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
}

async function runBuild(args: Record<string, unknown>): Promise<void> {
    await (buildCmd as any).run({ args: { standalone: false, minify: true, ...args } });
}

function filesIn(dir: string): string[] {
    return existsSync(dir) ? readdirSync(dir) : [];
}

// esbuild starts its service process on first use, in the current directory, and keeps it. Started
// inside a test project, that process holds the directory and Windows refuses to remove it (EBUSY):
// start it here, from where the suite runs.
beforeAll(async () => {
    const { transformWithEsbuild } = await import('vite');
    await transformWithEsbuild('export {}', 'warmup.js');
});

describe('pdx build --sourcemap', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        root = tmpRoot('map');
        mkdirSync(join(root, 'src'), { recursive: true });
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        process.chdir(root);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        rmSync(root, { recursive: true, force: true });
    });

    describe('standalone', () => {
        beforeEach(() => {
            writeFileSync(join(root, 'src', 'counter.pdx'), COUNTER);
        });

        it('writes no map without the flag', async () => {
            await runBuild({ standalone: true });
            const out = filesIn(join(root, 'dist'));
            expect(out).toContain('counter.js');
            expect(out.filter(f => f.endsWith('.map'))).toEqual([]);
            expect(readFileSync(join(root, 'dist', 'counter.js'), 'utf-8')).not.toContain('sourceMappingURL');
        });

        it('true: a .js.map beside the .js, named by its comment', async () => {
            await runBuild({ standalone: true, sourcemap: 'true' });
            const js = readFileSync(join(root, 'dist', 'counter.js'), 'utf-8');
            const map = JSON.parse(readFileSync(join(root, 'dist', 'counter.js.map'), 'utf-8'));
            expect(js.trimEnd().endsWith('//# sourceMappingURL=counter.js.map')).toBe(true);
            expect(map.version).toBe(3);
            expect(map.file).toBe('counter.js');
            // The source is named relative to the map, so a debugger finds it on disk.
            expect(map.sources).toEqual(['../src/counter.pdx']);
            expect(map.sourcesContent).toEqual([COUNTER]);
            expect(map.mappings.length).toBeGreaterThan(0);
        });

        it('hidden: the .js.map is written, the comment is not', async () => {
            await runBuild({ standalone: true, sourcemap: 'hidden' });
            expect(existsSync(join(root, 'dist', 'counter.js.map'))).toBe(true);
            expect(readFileSync(join(root, 'dist', 'counter.js'), 'utf-8')).not.toContain('sourceMappingURL');
        });

        it('false is the same as no flag', async () => {
            await runBuild({ standalone: true, sourcemap: 'false' });
            expect(filesIn(join(root, 'dist')).filter(f => f.endsWith('.map'))).toEqual([]);
        });
    });

    it('refuses a value that is not true, hidden or false', async () => {
        writeFileSync(join(root, 'src', 'counter.pdx'), COUNTER);
        await runBuild({ standalone: true, sourcemap: 'inline' });
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(existsSync(join(root, 'dist'))).toBe(false);
    });

    describe('SPA', () => {
        beforeEach(() => {
            writeFileSync(join(root, 'index.html'),
                '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>\n');
            writeFileSync(join(root, 'main.js'), 'document.body.append(String(Date.now()));\n');
        });

        function assets(): { js: string[]; maps: string[] } {
            const dir = join(root, 'dist', 'assets');
            return {
                js: filesIn(dir).filter(f => f.endsWith('.js')),
                maps: filesIn(dir).filter(f => f.endsWith('.map')),
            };
        }

        function jsText(): string {
            return assets().js.map(f => readFileSync(join(root, 'dist', 'assets', f), 'utf-8')).join('\n');
        }

        it('writes no map without the flag', async () => {
            await runBuild({});
            expect(assets().js.length).toBeGreaterThan(0);
            expect(assets().maps).toEqual([]);
        }, 60_000);

        it('hidden: maps in dist/assets, no sourceMappingURL comment', async () => {
            await runBuild({ sourcemap: 'hidden' });
            expect(assets().maps.length).toBeGreaterThan(0);
            expect(jsText()).not.toContain('sourceMappingURL');
        }, 60_000);

        it('true: maps in dist/assets, named by their comment', async () => {
            await runBuild({ sourcemap: 'true' });
            expect(assets().maps.length).toBeGreaterThan(0);
            expect(jsText()).toContain('//# sourceMappingURL=');
        }, 60_000);
    });
});
