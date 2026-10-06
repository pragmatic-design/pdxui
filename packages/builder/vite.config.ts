import { defineConfig, type Plugin } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pdx } from '../compiler/src/index';
import scenariosConfig from '../ui/tests/scenarios/vite.config';
import { themeSavePlugin } from './src/save-plugin';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

/** Where the builder app lives, relative to the Vite root (= repo root). */
export const BUILDER_ENTRY = '/packages/builder/index.html';

/**
 * The Vite root is the REPO ROOT, not this package. That is deliberate.
 *
 * The preview runs in an iframe and the parent reads `contentDocument` to measure it
 * (r$ `collect.root`), so the previewed page MUST be same-origin. The pages it shows are
 * the generated scenario pages under `packages/ui/tests/scenarios/generated/`, which are
 * outside this package. Serving them through a custom middleware would take them out of
 * Vite's HTML pipeline (their inline `<script type="module">` is rewritten by it), so
 * instead we widen the root until both the app and the scenario pages are under it and
 * both get the full, unmodified pipeline.
 *
 * Cost: `/` is not the app. `serveBuilderAtRoot` redirects it.
 */
function serveBuilderAtRoot(): Plugin {
    return {
        name: 'pdx-builder-root-redirect',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url === '/' || req.url === '/index.html') {
                    res.writeHead(302, { Location: BUILDER_ENTRY });
                    res.end();
                    return;
                }
                next();
            });
        },
    };
}

// The alias map is the scenarios' one, imported rather than copied: two divergent maps
// would mean the builder renders a scenario differently from the contract suite, which is
// the exact failure this package exists to avoid. It also pins `@pdxui/design` to
// `src/` — the pdx() plugin resolves it via package.json `main` (dist/), and dist/ is
// git-ignored, so a fresh clone would have nothing to serve.
// An ARRAY: the scenarios config needs a regex for the design sub-paths, because each
// component's stylesheet is a FILE named after it. Spreading an array into an object turns
// the whole map into `{0: …, 1: …}` and every alias stops resolving, which is why the type is
// spelled out rather than inferred.
type AliasEntry = { find: string | RegExp; replacement: string };
const scenarioAliases = (scenariosConfig as { resolve?: { alias?: AliasEntry[] } }).resolve?.alias ?? [];

// `@pdxui/design` is aliased to a CSS FILE, and Vite matches aliases by prefix, so
// `@pdxui/design/engine` would otherwise resolve to `…/base.css/engine`.
// The sub-path must come FIRST — the same ordering trap the scenarios config documents
// for the `@pdxui/ui/*` entries.
const aliases: AliasEntry[] = [
    { find: '@pdxui/design/engine', replacement: resolve(repoRoot, 'packages/design/src/engine/index.ts') },
    ...scenarioAliases,
];

/**
 * TWO ROOTS, one config.
 *
 * DEV serves the scenario pages straight out of the repo, so the root is the repo root and
 * the pages are always the freshly generated ones (see serveBuilderAtRoot for the cost).
 *
 * BUILD is a standalone site — themebuilder.pdxui.com — with no repo behind it. The root is
 * this package, `scripts/prepare-static.mjs` has already copied the pages in, and the output
 * gets clean public URLs (`/`, `/scenarios/tier-1.html`) instead of a mirror of the monorepo.
 * The dev-only endpoints do not exist there: the theme list becomes a static file, the saved
 * themes are copied under /scenarios/custom, and saving is simply absent, which the app detects.
 */
const scenarioPages = (): string[] => {
    const dir = resolve(here, 'scenarios');
    return existsSync(dir)
        ? readdirSync(dir).filter(f => f.endsWith('.html')).map(f => resolve(dir, f))
        : [];
};

// `isPreview` matters: `vite preview` runs with command 'serve' but must serve the BUILT
// site, so it needs the build root — otherwise it looks for dist/ next to the repo root.
export default defineConfig(({ command, isPreview }) => (command === 'build' || isPreview) ? {
    root: here,
    // Copied verbatim into dist/: the catalog and theme list are fetched, never imported.
    publicDir: resolve(here, 'public'),
    plugins: [pdx({ devtools: false })],
    resolve: { alias: aliases },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            // Every page is an entry: the app, the composite preview, and one per tier.
            // Miss one and the picker offers a component whose page 404s.
            input: [resolve(here, 'index.html'), resolve(here, 'preview/composition.html'), ...scenarioPages()],
        },
    },
} : {
    root: repoRoot,
    // MPA: no SPA fallback. Every HTML file is served from its own path — which is what
    // makes the generated scenario pages reachable.
    appType: 'mpa',
    plugins: [serveBuilderAtRoot(), themeSavePlugin(repoRoot), pdx({ devtools: false })],
    resolve: { alias: aliases },
    server: {
        port: 5230,
        // The root IS the repo, so the serving allow list has to say so. Vite derives it from
        // the workspace it detects — which here resolves to `packages/builder` plus the alias
        // targets, and nothing at the top level. `brand/` (the shared identity, imported by
        // index.html) would be outside it, so the logo would come back 403 and every preview
        // test fail on a console error that names no URL.
        fs: { allow: [repoRoot] },
        watch: {
            // Saving a theme writes into Vite's module graph, so the watcher forces a FULL
            // RELOAD of every open page. That is not a test-only annoyance: for a human it
            // wipes the "Saved …" confirmation and remounts the app mid-work, right after
            // the one action where feedback matters most. (Under test it also destroys one
            // spec's execution context from another spec's save.)
            //
            // Nothing here needs the reload: theme mode previews through its own injected
            // stylesheet, and the theme list comes from /__pdx/themes on demand. The only
            // thing that wants the file loaded is picking the saved theme in COMPONENT mode,
            // which costs one manual refresh.
            ignored: ['**/packages/design/src/themes/custom/**'],
        },
    },
});
