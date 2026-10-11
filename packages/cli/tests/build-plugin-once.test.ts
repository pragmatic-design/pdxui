// `pdx build` on a project that registers `pdx()` in its own vite.config builds an app that runs (#197).
//
// The CLI passed its own `pdx()` to `vite.build()`, and Vite also loaded the project's config, which
// `pdx new project` writes with `pdx()` in it: two `pragmatic-pdx` plugins transformed the same module,
// and the bundle called `component("pdx-app", …)` with `component` bound to nothing — a page that threw
// at load and rendered nothing. The CLI now adds its plugin only when the project's config has none.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import buildCmd from '../src/commands/build';

const APP = '<template><p>{{ title }}</p></template>\n<script setup>\nlet title = $signal("hi");\n</script>\n';

// Inside packages/cli, so the project resolves @pdxui/compiler and @pdxui/core the way an installed
// one does, through node_modules: a project under the system temp directory resolves neither.
const tmpRoot = (name: string): string =>
    join(__dirname, `.tmp-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);

beforeAll(async () => {
    // esbuild's service starts in the current directory on first use and holds it (see build-sourcemap).
    const { transformWithEsbuild } = await import('vite');
    await transformWithEsbuild('export {}', 'warmup.js');
});

describe('pdx build with the project\'s own pdx()', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        root = tmpRoot('plugin-once');
        mkdirSync(join(root, 'src'), { recursive: true });
        writeFileSync(join(root, 'index.html'), '<!DOCTYPE html><html><body><pdx-app></pdx-app><script type="module" src="./src/main.js"></script></body></html>\n');
        writeFileSync(join(root, 'src', 'main.js'), "import './App.pdx';\n");
        writeFileSync(join(root, 'src', 'App.pdx'), APP);
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        process.chdir(root);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });

    /** The built JavaScript, all chunks. */
    const bundle = (): string => {
        const dir = join(root, 'dist', 'assets');
        return readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf-8')).join('\n');
    };

    for (const configFile of ['vite.config.mjs', null]) {
        it(configFile ? 'registers the plugin once when vite.config has pdx()' : 'adds its own pdx() when there is no vite.config', async () => {
            if (configFile) {
                writeFileSync(join(root, configFile), "import { defineConfig } from 'vite';\nimport { pdx } from '@pdxui/compiler';\nexport default defineConfig({ plugins: [pdx()] });\n");
            }
            await (buildCmd as any).run({ args: { standalone: false, minify: true, sourcemap: 'false' } });
            expect(existsSync(join(root, 'dist', 'assets')), 'the build wrote nothing').toBe(true);
            const js = bundle();
            expect(js, 'the .pdx was not compiled into the bundle').toContain('"pdx-app"');
            // With two plugins the bundle calls `component(...)` by its source name: nothing binds it.
            expect(js, 'the bundle calls component() unbound — two pdx plugins transformed the module')
                .not.toMatch(/(?<![\w$.])component\("pdx-app"/);
        }, 60_000);
    }
});
