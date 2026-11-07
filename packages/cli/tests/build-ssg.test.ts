// `pdx build --ssg` on a real app (#160, part 5c): every route without parameters, and each path
// `ssg.routes` names, is written as a page of its own with the route's content in it; what the server
// cannot answer for is reported, not written; a module that reads the browser when it is imported
// stops the build, naming its file.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildSsg, SsgError, type SsgReport } from '../src/commands/build-ssg';
import { resolveConfig } from '../src/config/loader';
import { removeTree } from './remove-tree';

const INDEX = '<!doctype html><html><head><title>Shop</title></head><body>'
    + '<pdx-router-outlet></pdx-router-outlet><script type="module" src="/src/main.js"></script></body></html>';

const FILES: Record<string, string> = {
    'src/main.js': "import '@pdxui/router';\n",
    'src/card.pdx': '<template><p class="card">{{ label }}</p></template>\n<script>\n@prop label: string = \'\';\n</script>\n',
    'src/home.pdx': '<template><h1>Home</h1><app-card label="first"></app-card></template>\n<script>\n@page \'/\';\n</script>\n',
    'src/about.pdx': '<template><h1>About us</h1></template>\n<script>\n@page \'/about\';\n</script>\n',
    'src/post.pdx': '<template><h1>Post {{ id }}</h1></template>\n<script>\n@page \'/posts/:id\';\n@prop id: string = \'\';\n</script>\n',
    'src/admin.pdx': '<template><h1>Admin</h1></template>\n<script>\n@page \'/admin\';\n@guard \'admin.access\';\n</script>\n',
};

function app(name: string, files: Record<string, string>): string {
    const root = join(tmpdir(), `pdx-ssg-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'index.html'), INDEX);
    for (const [file, content] of Object.entries(files)) writeFileSync(join(root, file), content);
    return root;
}

const roots: string[] = [];
let root: string;
let report: SsgReport;
const page = (file: string): string => readFileSync(join(root, 'dist', file), 'utf-8');

beforeAll(async () => {
    // esbuild's service starts in the current directory and holds it: start it from here (#923).
    const { transformWithEsbuild } = await import('vite');
    await transformWithEsbuild('export {}', 'warmup.js');
    root = app('shop', FILES);
    roots.push(root);
    const resolved = { ...resolveConfig({}, root), ssgRoutes: ['/posts/1'] };
    // As `pdx build` runs: a production build. Vitest's own NODE_ENV is `test`.
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        report = await buildSsg(root, resolved, join(root, 'dist'), false);
    } finally {
        process.env.NODE_ENV = nodeEnv;
    }
}, 180_000);

afterAll(() => { for (const r of roots) removeTree(r); });

describe('pdx build --ssg', () => {
    it('writes a page for each route without parameters, and each path ssg.routes names', () => {
        expect(report.pages.map((p) => p.file).sort()).toEqual(['about/index.html', 'index.html', 'posts/1/index.html']);
    });

    it('puts the route\'s content in its page, marked for the client to take over', () => {
        const home = page('index.html');
        expect(home).toContain('<pdx-router-outlet data-pdx-ssg="/"');
        expect(home).toMatch(/<app-home [^>]*data-pdx-ssr="\d+"/);
        expect(home).toContain('<h1>Home</h1>');
        expect(home).toContain('<!--pdx-->first<!--/pdx-->');
        expect(page('about/index.html')).toContain('<h1>About us</h1>');
        expect(page('posts/1/index.html')).toMatch(/<app-post [^>]*id="1"/);
        expect(page('posts/1/index.html')).toContain('Post <!--pdx-->1<!--/pdx-->');
    });

    it('keeps the built page around it: its head, its scripts, and no splash over the content', () => {
        const home = page('index.html');
        expect(home).toContain('<title>Shop</title>');
        expect(home).toMatch(/<script type="module"[^>]*src="\/assets\/[^"]+\.js"/);
        expect(home).not.toContain('id="pdx-splash"');
        expect(home).not.toContain('aria-busy="true"');
    });

    it('writes the production markup, the one the production client hydrates with', () => {
        expect(page('index.html'), 'a development attribute in a production page').not.toContain('data-pdx-route');
    });

    it('reports what it did not write, and why', () => {
        expect(report.skippedRoutes).toEqual([
            { path: '/admin', reason: 'its route is guarded: what it shows depends on the visitor' },
        ]);
        expect(existsSync(join(root, 'dist', 'admin', 'index.html'))).toBe(false);
        expect(report.pages.every((p) => p.skipped.length === 0), 'a component was written as an empty host').toBe(true);
    });
});

describe('an app that reads the browser when a module is imported', () => {
    it('stops the build, and says which file', async () => {
        const broken = app('broken', { ...FILES, 'src/main.js': "import '@pdxui/router';\nimport './title.js';\n", 'src/title.js': "document.title = 'Shop · ' + document.title;\n" });
        roots.push(broken);
        const err = await buildSsg(broken, resolveConfig({}, broken), join(broken, 'dist'), false).then(() => null, (e: unknown) => e);
        expect(err).toBeInstanceOf(SsgError);
        expect((err as Error).message).toContain('document is not defined');
        expect((err as Error).message).toContain('title.js');
    }, 180_000);
});
