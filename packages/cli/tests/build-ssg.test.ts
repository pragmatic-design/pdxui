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
    'src/about.pdx': '<template><h1>About us</h1></template>\n<script>\n@page \'/about\';\n@title \'About us & the <shop>\';\n@meta description: \'Who runs the shop\';\n</script>\n',
    'src/post.pdx': '<template><h1>Post {{ id }}</h1></template>\n<script>\n@page \'/posts/:id\';\n@prop id: string = \'\';\nconst heading = $derived(\'Post \' + id);\n@title heading;\n</script>\n',
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

    it('writes each route\'s head: its @title in place of the page\'s, its @meta, escaped', () => {
        const about = page('about/index.html');
        expect(about).toContain('<title>About us &amp; the &lt;shop&gt;</title>');
        expect(about).not.toContain('<title>Shop</title>');
        expect(about).toContain('<meta name="description" content="Who runs the shop">');
        expect(page('posts/1/index.html'), 'a dynamic title is read with the route\'s params').toContain('<title>Post 1</title>');
        expect(page('index.html'), 'a route with no title keeps the page\'s').toContain('<title>Shop</title>');
    });

    it('has each page announce its own route\'s chunk, not the landing route\'s', () => {
        // The built index.html preloads `/`'s chunk (the plugin's `preloadRoutes`). A page generated for
        // another route is that route's first screen: its chunk is the one the browser should start.
        const preloads = (file: string): string[] => [...page(file).matchAll(/<link rel="modulepreload"[^>]*href="\/assets\/([a-z]+)-[^"]*\.js"/g)].map((m) => m[1]);
        expect(preloads('index.html')).toContain('home');
        expect(preloads('about/index.html')).toContain('about');
        expect(preloads('about/index.html'), 'the landing route\'s chunk, preloaded on another route\'s page').not.toContain('home');
        expect(preloads('posts/1/index.html')).toContain('post');
    });

    it('writes the production markup, the one the production client hydrates with', () => {
        expect(page('index.html'), 'a development attribute in a production page').not.toContain('data-pdx-route');
    });

    it('reports what it did not write, and why', () => {
        expect(report.skippedRoutes).toEqual([
            { path: '/admin', reason: 'its guard is denied: the build has set no permission that grants it' },
        ]);
        expect(existsSync(join(root, 'dist', 'admin', 'index.html'))).toBe(false);
        expect(report.pages.every((p) => p.skipped.length === 0), 'a component was written as an empty host').toBe(true);
    });
});

describe('what the build refuses, and what it leaves out', () => {
    it('a component that reads a browser global in its setup stops the build, naming it and the global', async () => {
        const reader = app('reader', {
            ...FILES,
            'src/home.pdx': '<template><h1>{{ width }}</h1></template>\n<script>\n@page \'/\';\nconst width = window.innerWidth;\n</script>\n',
        });
        roots.push(reader);
        const err = await buildSsg(reader, resolveConfig({}, reader), join(reader, 'dist'), false).then(() => null, (e: unknown) => e);
        expect(err).toBeInstanceOf(SsgError);
        expect((err as Error).message).toContain('<app-home>');
        expect((err as Error).message).toContain('`window`');
        expect((err as Error).message).toContain('onMount');
        expect(existsSync(join(reader, 'dist', 'about', 'index.html')), 'a page was written by a build that failed').toBe(false);
    }, 180_000);

    it('a route with parameters that ssg.routes does not list is reported, and has no file', async () => {
        const unlisted = app('unlisted', FILES);
        roots.push(unlisted);
        const result = await buildSsg(unlisted, resolveConfig({}, unlisted), join(unlisted, 'dist'), false);
        expect(result.skippedRoutes).toContainEqual({ path: '/posts/:id', reason: 'it has parameters, and ssg.routes names no path for it' });
        expect(existsSync(join(unlisted, 'dist', 'posts')), 'an unlisted route was written').toBe(false);
    }, 180_000);
});

describe('how an app is entered and built', () => {
    it('an inline module script is the app\'s entry too, its relative imports from the root', async () => {
        // The banner is in the page's own markup, outside every route, and only the inline script imports it.
        const inline = app('inline', {
            ...FILES,
            'src/banner.pdx': '<template><p class="banner">{{ text }}</p></template>\n<script>\n@prop text: string = \'welcome\';\n</script>\n',
            'index.html': '<!doctype html><html><head><title>Shop</title></head><body><app-banner></app-banner><pdx-router-outlet></pdx-router-outlet>'
                + "<script type=\"module\">\n  import '@pdxui/router';\n  import './src/banner.pdx';\n</script></body></html>",
        });
        roots.push(inline);
        const result = await buildSsg(inline, resolveConfig({}, inline), join(inline, 'dist'), false);
        expect(result.pages.map((p) => p.file)).toContain('index.html');
        const home = readFileSync(join(inline, 'dist', 'index.html'), 'utf-8');
        expect(home, 'the banner is empty: the inline entry did not run on the server').toContain('<p class="banner"><!--pdx-->welcome<!--/pdx--></p>');
        expect(home).toContain('<h1>Home</h1>');
    }, 180_000);

    it('builds with the config it is handed, beside the one the app builds its client with', async () => {
        const compiler = join(__dirname, '..', '..', 'compiler', 'src', 'index.ts').replace(/\\/g, '/');
        const variant = app('variant', {
            ...FILES,
            // The app's own config: no hydrate, which a static build refuses.
            'vite.config.mjs': `import { pdx } from '${compiler}';\nexport default { plugins: [pdx({ devtools: false })] };\n`,
            'vite.ssg.config.mjs': `import { pdx } from '${compiler}';\nexport default { plugins: [pdx({ devtools: false, hydrate: true })] };\n`,
        });
        roots.push(variant);
        const refused = await buildSsg(variant, resolveConfig({}, variant), join(variant, 'dist'), false).then(() => null, (e: unknown) => e);
        expect((refused as Error | null)?.message ?? '', 'the app\'s config without hydrate was not refused').toContain('hydrate');
        const result = await buildSsg(variant, resolveConfig({}, variant), join(variant, 'dist'), false, join(variant, 'vite.ssg.config.mjs'));
        expect(result.pages.map((p) => p.file)).toContain('about/index.html');
    }, 180_000);
});

describe('a route prepared before it renders', () => {
    // The app's own session: a hook registered by a module lets in only a signed-in visitor, and the
    // guard asks the permissions. What `ssg.setup` does is what a build session is.
    const SESSION: Record<string, string> = {
        ...FILES,
        'src/session.js': 'let user = null;\nexport const signIn = (name) => { user = name; };\nexport const signedIn = () => user !== null;\n',
        'src/main.js': "import { onBeforeNavigate } from '@pdxui/router';\nimport { signedIn } from './session.js';\n"
            + "onBeforeNavigate(async (_from, to) => { await Promise.resolve(); return to === '/' || signedIn(); });\n",
        'src/ssg.js': "import { setPermissions } from '@pdxui/core';\nimport { signIn } from './session.js';\nsignIn('build');\nsetPermissions(['admin.access']);\n",
    };

    it('a path a before-navigation hook refuses is reported, and has no file', async () => {
        const closed = app('closed', SESSION);
        roots.push(closed);
        const result = await buildSsg(closed, resolveConfig({}, closed), join(closed, 'dist'), false);
        expect(result.pages.map((p) => p.file)).toEqual(['index.html']);
        expect(result.skippedRoutes).toContainEqual({ path: '/about', reason: 'an onBeforeNavigate hook refused it' });
        expect(existsSync(join(closed, 'dist', 'about')), 'a refused route was written').toBe(false);
    }, 180_000);

    it('ssg.setup runs before the app\'s entries: a session it opens renders the pages behind it', async () => {
        const open = app('open', SESSION);
        roots.push(open);
        const result = await buildSsg(open, resolveConfig({ ssg: { setup: 'src/ssg.js' } }, open), join(open, 'dist'), false);
        expect(result.pages.map((p) => p.file).sort()).toEqual(['about/index.html', 'admin/index.html', 'index.html']);
        expect(readFileSync(join(open, 'dist', 'admin', 'index.html'), 'utf-8')).toContain('<h1>Admin</h1>');
        expect(readFileSync(join(open, 'dist', 'about', 'index.html'), 'utf-8')).toContain('<h1>About us</h1>');
    }, 180_000);

    it('a setup module that is not there stops the build, naming it', async () => {
        const missing = app('missing', FILES);
        roots.push(missing);
        const err = await buildSsg(missing, resolveConfig({ ssg: { setup: 'src/nowhere.js' } }, missing), join(missing, 'dist'), false).then(() => null, (e: unknown) => e);
        expect(err).toBeInstanceOf(SsgError);
        expect((err as Error).message).toContain('ssg.setup');
        expect((err as Error).message).toContain('nowhere.js');
    }, 180_000);
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

    it('or in work it starts and does not await, as an entry that sets up its locale does', async () => {
        const late = app('late', {
            ...FILES,
            'src/main.js': "import '@pdxui/router';\nimport { setup } from './locale.js';\nvoid setup();\n",
            'src/locale.js': "export async function setup() { await Promise.resolve(); document.documentElement.lang = 'en'; }\n",
        });
        roots.push(late);
        const err = await buildSsg(late, resolveConfig({}, late), join(late, 'dist'), false).then(() => null, (e: unknown) => e);
        expect(err).toBeInstanceOf(SsgError);
        expect((err as Error).message).toContain('could not run on the server');
        expect((err as Error).message).toContain('document is not defined');
        expect((err as Error).message).toContain('locale.js');
    }, 180_000);
});
