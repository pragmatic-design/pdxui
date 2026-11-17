// `pdx build --no-minify` leaves the output readable in every build (#1161). Only the standalone
// build read the flag: the SPA build and the static one passed `minify: 'esbuild'` to Vite whatever
// was asked, so the build a developer reaches for to read the output — chasing a production-only bug —
// was minified anyway, without a word.
//
// A local name the minifier shortens is the measure: it is in the output when nothing minified it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import buildCmd from '../src/commands/build';
import { buildSsg } from '../src/commands/build-ssg';
import { resolveConfig } from '../src/config/loader';
import { removeTree } from './remove-tree';

/** A local whose name a minifier renames; the call keeps it from being dropped. */
const READABLE = 'readableLocalName';
const SOURCE = `function shout() { const ${READABLE} = String(Date.now()); document.body.append(${READABLE}); }\nshout();\n`;

function tmpRoot(name: string): string {
    return join(tmpdir(), `pdx-minify-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
}

/** Every .js the build wrote under dist/assets, as one text. */
function assetsText(root: string): string {
    const dir = join(root, 'dist', 'assets');
    return existsSync(dir)
        ? readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf-8')).join('\n')
        : '';
}

describe('pdx build --no-minify', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        root = tmpRoot('spa');
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'index.html'),
            '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>\n');
        writeFileSync(join(root, 'main.js'), SOURCE);
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        process.chdir(root);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        removeTree(root);
    });

    it('SPA: --no-minify keeps the names readable', async () => {
        await (buildCmd as any).run({ args: { standalone: false, minify: false, sourcemap: 'false' } });
        expect(assetsText(root)).toContain(READABLE);
    }, 60_000);

    it('SPA: the default build is still minified', async () => {
        await (buildCmd as any).run({ args: { standalone: false, minify: true, sourcemap: 'false' } });
        const text = assetsText(root);
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toContain(READABLE);
    }, 60_000);
});

describe('pdx build --ssg --no-minify', () => {
    const INDEX = '<!doctype html><html><head><title>Shop</title></head><body>'
        + '<pdx-router-outlet></pdx-router-outlet><script type="module" src="/src/main.js"></script></body></html>';
    const roots: string[] = [];

    function ssgApp(): string {
        const at = tmpRoot('ssg');
        roots.push(at);
        mkdirSync(join(at, 'src'), { recursive: true });
        writeFileSync(join(at, 'index.html'), INDEX);
        // The server runs the app's modules: `shout()` reads the document, so it runs only in a browser.
        const browserOnly = SOURCE.replace('shout();', "if (typeof document !== 'undefined') shout();");
        writeFileSync(join(at, 'src', 'main.js'), `import '@pdxui/router';\n${browserOnly}`);
        writeFileSync(join(at, 'src', 'home.pdx'), '<template><h1>Home</h1></template>\n<script>\n@page \'/\';\n</script>\n');
        return at;
    }

    afterEach(() => { for (const r of roots.splice(0)) removeTree(r); });

    async function production(fn: () => Promise<unknown>): Promise<void> {
        const nodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try { await fn(); } finally { process.env.NODE_ENV = nodeEnv; }
    }

    it('keeps the names readable', async () => {
        const at = ssgApp();
        await production(() => buildSsg(at, resolveConfig({}, at), join(at, 'dist'), false, undefined, false));
        expect(assetsText(at)).toContain(READABLE);
    }, 180_000);

    it('is still minified by default', async () => {
        const at = ssgApp();
        await production(() => buildSsg(at, resolveConfig({}, at), join(at, 'dist'), false));
        const text = assetsText(at);
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toContain(READABLE);
    }, 180_000);
});
