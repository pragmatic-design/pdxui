// Vite plugin for .pdx Single File Components.
// Transforms .pdx files into JavaScript modules with source maps.

import type { Plugin, UserConfig } from 'vite';
import { readFileSync, realpathSync } from 'fs';
import { dirname, resolve, normalize, relative, isAbsolute, basename } from 'path';
import { parseSFC } from './parser/sfc';
import { parseTemplate, templateStartInFile } from './parser/template';
import type { SourceLoc } from './parser/template';
import { compileSFC, deriveTag } from './compiler/codegen';
import { DEFAULT_TAG_PREFIX } from './compiler/tag-prefix';
import { analyzeScript } from './compiler/script-analyzer';
import { validate } from './compiler/validate';
import { diagnosticUrl, DIAGNOSTICS } from './diagnostics/catalog';
import { validateStyles } from './compiler/validate-styles';
import { validateVariants } from './compiler/validate-variants';
import { validateDesign } from './compiler/validate-design';
import { validateDeclarations } from './compiler/validate-declarations';
import { validateSignalMutation } from './compiler/validate-signal-mutation';
import { validateHandWrittenSignals } from './compiler/validate-hand-signals';
import { checkRemovedForms } from './language/removed-forms';
import { checkRequiredInMarkup } from './language/form-name-binding';
import { validateRunePosition } from './compiler/validate-rune-position';
import { validateScriptExports } from './compiler/script-exports';
import { validateAgentActions } from './compiler/validate-agent-actions';
import { setupRedundant } from './language/script-setup';
import { validateDynamicContent } from './compiler/dynamic-content';
import { routeLayout } from './compiler/codegen-shared';
import { minifyHTML } from './compiler/minify';
import { locateBoundName } from './compiler/codegen-prop-names';
import { positionWarnings } from './compiler/position-warnings';
import { parseIgnores, exemptionFor, applyIgnores } from './compiler/ignores';
import { styleCssFor, parseStyleModuleId, STYLE_MODULE_PREFIX } from './compiler/codegen-styles';
import { styleOnlyUpdate, styleSwapListener, STYLE_EVENT } from './hmr-style';
import type { ValidationWarning } from './compiler/validate';
import { collectOrigins, mapFromOrigins, insertMapLines } from './compiler/sourcemap';
import type { SourceMapJSON } from './compiler/sourcemap';
import { PluginRunner } from './plugin-system';
import type { CompilerPlugin } from './plugin-system';
import { discoverPragmaticAliases, scanForStores, scanForRoutes, injectStoreImports, injectComponentImports, routePreloadFiles, preloadTags, isRouterSeam, injectAfterHeadOpen, shortPath, type BundleChunk } from './plugin-utils';
import { generateRouteTable, routerSeamModule, devRouteTableModule, buildSpecifier, devSpecifier, ROUTE_TABLE_ID } from './route-table';
import { generateLoaderModule, LOADER_MODULE_PREFIX } from './loader-module';
import { writeRouteTypes } from './route-types';
import type { ScannedRoute } from './plugin-utils';
import { ComponentResolver } from './component-resolver';
import { injectSplash, type SplashOptions } from './splash';
import type { PropsLookup, BrowserTarget } from './compiler/compile-context';
import type { EnumLookup } from './compiler/validate-enums';
import type { MethodsLookup } from './compiler/validate-commands';
import type { ModelsLookup } from './compiler/validate-two-way';
import type { AlphaLookup } from './language/alpha-events';
import type { RequiredPropsLookup } from './compiler/validate-required-props';
import type { RequiredSlotsLookup } from './compiler/validate-required-slots';
import { jsQuote } from './compiler/js-literal';
import { designTargetPlugin } from './design-target';
/** The route table (`route-table.ts`): data the router reads, in dev and in a build. */
const RESOLVED_ROUTE_TABLE_ID = '\0' + ROUTE_TABLE_ID;
/**
 * The route table's door in DEV — a module `index.html` loads first, which hands the table to the
 * router as `globalThis.__pdx_route_table`.
 *
 * Without a table, dev answers 404 on every route including `/`: a page module registers itself
 * only WHEN IT IS IMPORTED, and an eager `import.meta.glob` importing them all would put every page
 * in the first chunk and defeat the code splitting `@page` promises. With it, the outlet imports
 * one page when it first shows it — the same shape a build has.
 */
const VIRTUAL_ROUTES_DEV_ID = 'virtual:pdx-routes-dev';
const RESOLVED_ROUTES_DEV_ID = '\0virtual:pdx-routes-dev';
// The devtools bootstrap. A MODULE the plugin serves, not code inlined in the page: an inline script
// added by `transformIndexHtml` never goes through Vite's import rewriting, so the bare specifier it
// carries would reach the browser verbatim — `Failed to resolve module specifier
// "@pdxui/core/devtools"`, once per page, in every consumer's console. Pointing at a virtual
// module also drops the inline `<script>` that a strict CSP rejects.
const VIRTUAL_DEVTOOLS_ID = 'virtual:pdx-devtools';
const RESOLVED_DEVTOOLS_ID = '\0virtual:pdx-devtools';

export interface PdxPluginOptions {
    /** File extensions to process. Default: ['.pdx'] */
    extensions?: string[];
    /** Compiler plugins for custom transformations. */
    plugins?: CompilerPlugin[];
    /** Minify HTML templates — strip unnecessary whitespace. Default: false (dev), true (build). */
    minify?: boolean;
    /**
     * More folders whose .pdx files are auto-importable components, relative to the Vite root or
     * absolute — scanned IN ADDITION to `src/` and `pages/`, the same rule `pdx check` and the
     * editor follow.
     */
    components?: string[];
    /** Enable DevTools overlay in dev mode. Default: true. */
    devtools?: boolean;
    /** Auto-discover @pdxui/* packages in workspace. Default: true. */
    autoAlias?: boolean;

    /**
     * Which platform features the compiled output relies on (#121). `'baseline-2026'` by default;
     * `'baseline-2024'` emits today's mechanisms where the beta's output needs a 2026 feature, for an
     * app whose users run older browsers. That target is maintained frozen — fixed, not developed —
     * and retired when `@scope` is Baseline widely available (September 2028).
     */
    target?: BrowserTarget;

    /**
     * The prefix of the app's component tags (#136): `button.pdx` → `<app-button>` by default. `pdx-`
     * is reserved for the `@pdxui/*` packages; `@tag` still names one component.
     */
    prefix?: string;

    /**
     * The routes whose chunks the built `index.html` announces with `<link rel="modulepreload">`.
     *
     * Without it a cold first screen fetches its JavaScript in three waves — the entry, then the
     * route's own chunk once the browser has run the entry and learnt of it, then that chunk's own
     * imports. Vite emits preloads for what it can see statically and a route is a dynamic import,
     * so it sees none of them; the compiler has the route table.
     *
     * `['/']` by default, because that is the URL an app is usually entered at and the one a build
     * can name without guessing. Name another for an app that lands elsewhere, or pass `[]` to
     * emit nothing. Only the named route's chunk and its STATIC imports are announced — preloading
     * every route is the barrel defect one layer up, where the first screen pays for the whole app.
     *
     * Build only: in dev there are no chunks.
     */
    preloadRoutes?: string[];

    /**
     * Print the design-review findings too (the `design` category of the diagnostics catalog, such
     * as PDX_EFFECT_STATE) on every compile. Off by default: they are questions for a review — `pdx
     * check --design` — and a console that repeats them on every save is a console nobody reads.
     * Defects are always printed.
     */
    design?: boolean;

    /**
     * The layout every `@page` renders in unless it declares its own — `'shell'` resolves to
     * `pdx-shell-layout` (a `shell/_layout.pdx`) or `pdx-shell` (a `shell.pdx` with a slot), as
     * `@layout 'shell'` would. A page that must stand alone, a sign-in, says `@layout 'none'`.
     *
     * Without it, an app's shell in a layout means `@layout 'shell'` on every page.
     */
    defaultLayout?: string;

    /**
     * The start-up splash `index.html` paints before any JavaScript, until the app is ready: the
     * first page shown, and whatever the app added with `splashReady()` from `@pdxui/core`.
     * Then one 200 ms fade — none under `prefers-reduced-motion`.
     *
     * On by default with the page's `<title>`; `{ title, logo, minDuration }` to say more, `false`
     * for none. Only for an app with `@page` routes: the router is what says the first page is up,
     * and a splash nothing takes away is a blank app.
     */
    splash?: SplashOptions | false;
}

/**
 * Vite plugin for .pdx Single File Components.
 *
 * Usage in vite.config.ts:
 *   import { pdx } from '@pdxui/compiler';
 *   export default defineConfig({ plugins: [pdx()] });
 *
 * Two plugins, which Vite takes as one entry of `plugins`: the compiler, and the one that gives
 * `@pdxui/design`'s stylesheets the form of the target (./design-target, #156).
 */
export function pdx(options?: PdxPluginOptions): Plugin[] {
    const extensions = options?.extensions ?? ['.pdx', '.pdx.ts'];
    const compilerPlugins = options?.plugins ?? [];
    const shouldMinify = options?.minify; // undefined = auto (dev: false, build: true)
    const componentDirs = options?.components ?? [];
    const devtools = options?.devtools ?? true;
    const autoAlias = options?.autoAlias ?? true;
    const preloadRoutes = options?.preloadRoutes ?? ['/'];
    const design = options?.design ?? false;
    const defaultLayout = options?.defaultLayout;
    const splash = options?.splash === false ? null : (options?.splash ?? {});
    const target = options?.target ?? 'baseline-2026';
    const prefix = options?.prefix ?? DEFAULT_TAG_PREFIX;
    let isDevMode = false;
    // Vite's `base`, for the preload hrefs: an app served under a sub-path has to name its chunks
    // the way the browser will ask for them.
    let viteBase = '/';
    // The root Vite resolved for this build. Set in configResolved, read by the @page/@store scan.
    let viteRoot: string | undefined;
    // Dev only: the @pdxui package directories the auto-alias points at, which the dev server
    // must be allowed to read. Found in `config`, added to Vite's `fs.allow` in `configResolved`.
    let aliasDirs: string[] = [];

    // Store registry: tracks @store declarations for auto-import
    const storeRegistry = new Map<string, string>(); // storeName → filePath
    // Route registry: tracks @page declarations for the route table
    const scannedRoutes: ScannedRoute[] = [];
    // Component resolver: auto-import for <pdx-*> tags in templates
    const componentResolver = new ComponentResolver();
    // Tag registry: detects collisions between .pdx files that derive the same CE tag
    const tagRegistry = new Map<string, string>(); // tag → first filePath
    // Development: the source each .pdx module was last compiled from, which a save is compared with
    // to tell a style-only change (#246).
    const compiledSources = new Map<string, string>(); // module id → source

    /**
     * Scan the routes again and rewrite `.pdx/routes.d.ts` if they changed (#150): the dev server's
     * answer to a page saved, added or stripped of its `@page`. The route table itself is left to
     * the reload that follows a structural change; only the types are refreshed here.
     */
    function refreshRouteTypes(): void {
        const root = viteRoot ?? process.cwd();
        const routes: ScannedRoute[] = [];
        for (const sub of ['src', 'pages']) {
            scanForRoutes(resolve(root, sub), routes, (tag) => componentResolver.has(tag), defaultLayout, prefix);
        }
        if (routes.length > 0) writeRouteTypes(root, routes.map((r) => r.path));
    }

    const main: Plugin = {
        name: 'pragmatic-pdx',
        enforce: 'pre',

        // Auto-configure @pdxui/* aliases and .pdx.ts handling
        config(_config: UserConfig, { command }: { command: string }) {
            const result: Partial<UserConfig> = {};
            const isBuild = command === 'build';
            isDevMode = !isBuild;

            // Auto-alias @pdxui/* packages from workspace
            if (autoAlias) {
                const aliases = discoverPragmaticAliases();
                if (Object.keys(aliases).length > 0) {
                    result.resolve = {
                        alias: aliases,
                        // Build mode needs explicit extensions for source-level resolution
                        ...(isBuild && {
                            extensions: ['.pdx', '.pdx.ts', '.ts', '.js', '.mjs', '.json'],
                        }),
                    };
                    // Dev: the package directories are added to Vite's own `fs.allow` in
                    // configResolved, not returned here — see there.
                    if (!isBuild) aliasDirs = Object.values(aliases).map(p => dirname(p));
                }
            }

            // Build mode treeshake: handled per-module via transform() return value
            // (moduleSideEffects: 'no-treeshake') — no global treeshake override needed.

            // The target, for core (#156): under baseline-2026 the design CSS reads the behaviour
            // tokens through style queries, and setTheme stops mirroring them as attributes.
            result.define = { __PDX_TARGET__: JSON.stringify(target) };

            // Exclude .pdx.ts from esbuild dep optimization (rune syntax breaks esbuild)
            result.optimizeDeps = {
                exclude: ['*.pdx.ts'],
                esbuildOptions: {
                    loader: { '.pdx.ts': 'text' },
                },
            };

            return Object.keys(result).length > 0 ? result : undefined;
        },

        configResolved(resolved: { root: string; base?: string; server: { fs: { allow: string[] } } }) {
            viteBase = resolved.base ?? '/';
            viteRoot = resolved.root;
            // Dev: let the server read the @pdxui packages, IN ADDITION to what Vite allows.
            // An `allow` returned from `config` REPLACES Vite's default — the workspace root of
            // `root` — and naming the cwd instead, with cwd ≠ root (`vite --root app`, a task
            // runner, the createServer API) the app's own files could not be loaded at all.
            // Vite reads this array when it checks a path, so extending the resolved one keeps its
            // default, and whatever the user configured, as they are. The cwd stays allowed.
            if (aliasDirs.length > 0) {
                const allow = resolved.server.fs.allow;
                for (const dir of [...aliasDirs, process.cwd()]) {
                    const d = resolve(dir).replace(/\\/g, '/');
                    if (!allow.includes(d)) allow.push(d);
                }
            }
        },

        // Pre-scan for @store and @page declarations at build start
        // Clear previous state to avoid stale data on re-builds / HMR
        buildStart() {
            storeRegistry.clear();
            tagRegistry.clear();
            scannedRoutes.length = 0;
            // Scan only src/ and pages/ to avoid traversing the entire monorepo.
            //
            // The ROOT VITE RESOLVED, not process.cwd(). They are the same when `vite build` is run
            // from the app directory and different every other time — `vite build --root app`, a
            // task runner invoking the API, a build launched from the repo root. Scanning the cwd
            // would find no `@page`, and the route table would come out empty: an app with no
            // routes, since the router reads them from that table.
            const root = viteRoot ?? process.cwd();
            // Build component auto-import registry (resolve @pdxui/ui from the app's
            // node_modules when consumed as a package, or the packages/ui sibling in the monorepo).
            // Prefer the custom-elements.json manifest (authoritative tags + prop enums); fall back
            // to scanning package.json exports when an older ui build ships no manifest.
            if (!componentResolver.registerUiManifest(root)) {
                componentResolver.registerUiPackage(root);
            }
            // From the same root as the stores and routes below, as the watcher does — the cwd finds
            // nothing to auto-import when it is not Vite's root.
            //
            // BEFORE the route scan, and that order is load-bearing: `@layout 'admin'` resolves to
            // `pdx-admin-layout` or to `pdx-admin` depending on which of the two the project has,
            // and a scan that runs first can only guess. Nothing here reads routes.
            componentResolver.registerProjectComponents(root, componentDirs, prefix);

            for (const sub of ['src', 'pages']) {
                const dir = resolve(root, sub);
                scanForStores(dir, storeRegistry);
                scanForRoutes(dir, scannedRoutes, (tag) => componentResolver.has(tag), defaultLayout, prefix);
            }
            // The routes as types (#150), for navigate() and <pdx-link>: an app with no route has none.
            if (scannedRoutes.length > 0) writeRouteTypes(root, scannedRoutes.map((r) => r.path));

            // Tag collisions found by the SCAN are reported here, through Rollup's warning channel,
            // so they carry a code and reach whatever is consuming the build — not only a terminal.
            // They cannot be left to the PDX_TAG_COLLISION thrown in `transform`: that one sees
            // only the files the build compiles, and the losing file is unreachable by auto-import
            // precisely because it lost.
            for (const c of componentResolver.collisions) {
                this.warn({ code: c.code, message: `${c.message}\n  Hint: ${c.hint}` });
            }
            // A .pdx has one render path, in dev and in a build (#107): the option selects nothing. It
            // has left the options' type (#121), so a typed config no longer compiles with it; an
            // untyped one still passes it, and is told.
            const inlineBindings = (options as { inlineBindings?: unknown } | undefined)?.inlineBindings;
            if (inlineBindings !== undefined) {
                this.warn({
                    code: 'PDX_INLINE_BINDINGS_IGNORED',
                    message: `pdx({ inlineBindings: ${String(inlineBindings)} }): the option no longer selects a render path; remove it.`,
                });
            }
        },

        resolveId(id: string) {
            if (id === ROUTE_TABLE_ID) return RESOLVED_ROUTE_TABLE_ID;
            if (id === VIRTUAL_ROUTES_DEV_ID) return RESOLVED_ROUTES_DEV_ID;
            if (id === VIRTUAL_DEVTOOLS_ID) return RESOLVED_DEVTOOLS_ID;
            // A component's `<style scoped>` block, as a real stylesheet. The id keeps
            // its `.css` ending through the `\0` prefix, which is what makes Vite run its CSS
            // pipeline on what `load` returns instead of treating it as a JS module.
            if (id.startsWith(STYLE_MODULE_PREFIX)) return '\0' + id;
            // A page's `@loader` in a module of its own, named after the page's tag (#119).
            if (id.startsWith(LOADER_MODULE_PREFIX)) return '\0' + id;
        },
        load(id: string) {
            if (id === RESOLVED_ROUTE_TABLE_ID) {
                // The two producers differ only in how a page's module is named.
                return generateRouteTable(scannedRoutes,
                    isDevMode ? devSpecifier(viteRoot ?? process.cwd()) : buildSpecifier, { devtools: isDevMode });
            }
            if (id === RESOLVED_ROUTES_DEV_ID) return devRouteTableModule();
            if (id.startsWith('\0' + LOADER_MODULE_PREFIX)) {
                // The page is found in the scan, by the tag the table named it by; its source is read
                // again, so an edit to the loader reaches this module as it reaches the page's.
                const tag = id.slice(1 + LOADER_MODULE_PREFIX.length);
                const route = scannedRoutes.find(r => r.tag === tag && r.loader);
                if (!route?.loader) return 'export default null;\n';
                this.addWatchFile(route.file);
                return generateLoaderModule(readFileSync(route.file, 'utf-8'), route.file, route.loader);
            }
            if (id.startsWith('\0' + STYLE_MODULE_PREFIX)) {
                // The source file and the block index are in the id, read back by the inverse of
                // the function that wrote it; the CSS is produced by the SAME function the dev-mode
                // injection uses, so the two modes cannot scope or minify a block differently.
                const styleModule = parseStyleModuleId(id.slice(1));
                if (!styleModule) return null;
                const { file, index } = styleModule;
                try {
                    // A block's `src=` resolved as the transform resolves it: re-reading the .pdx alone
                    // gave a `<style src>` block no content, and the build shipped it empty (#205).
                    const descriptor = parseSFC(readFileSync(file, 'utf-8'));
                    const resolver = projectFileResolver(normalize(viteRoot ?? process.cwd()));
                    for (const style of descriptor.styles ?? (descriptor.style ? [descriptor.style] : [])) {
                        if (style.src) style.content = resolver(style.src, file);
                    }
                    // And the template's: whether it writes anything inside a component's tag decides
                    // the scope's form (#511), and must be read from what the transform compiled.
                    if (descriptor.template?.src) descriptor.template.content = resolver(descriptor.template.src, file);
                    return styleCssFor(descriptor, file, index, true, target);
                } catch {
                    // A file that moved between the transform and this load: an empty stylesheet is
                    // wrong, but it is not a build that fails for a reason nobody can read.
                    this.warn(`[pdx] could not read the styles of ${file} — the component ships unstyled`);
                    return '';
                }
            }
            if (id === RESOLVED_DEVTOOLS_ID) {
                // Resolved through Vite like any other import, so `@pdxui/core/devtools` is
                // rewritten to a real URL before the browser ever sees it.
                return `import { initDevTools } from '@pdxui/core/devtools';\ninitDevTools();\n`;
            }
            // The router's seam. `@pdxui/router` funnels every import of the router through one
            // file, `src/active.ts`. In a production build this hook answers for that file with its
            // own source and the route table installed in front of it, so the table is in place
            // before the outlet can ask for it. Dev gets the table through `index.html` instead.
            //
            // Matched on the path rather than on a bare specifier because by the time `load` runs
            // Vite has already resolved it to a file, and the package ships the same layout whether
            // it is the monorepo sibling or an install under node_modules.
            //
            // `moduleSideEffects: true` because the package declares `active.ts` free of side
            // effects, and it was: a module of re-exports. Installed, the table IS its effect, and
            // without the flag Rollup follows the re-exports straight to `./runtime` and drops the
            // call — a production app with an empty route table.
            if (!isDevMode && isRouterSeam(id)) {
                return { code: routerSeamModule(readFileSync(id.split('?')[0], 'utf-8')), moduleSideEffects: true };
            }
        },

        // Inject DevTools overlay — DEV ONLY (never in production builds: it exposes diagnostics
        // and injects an inline script that breaks strict CSP).
        transformIndexHtml(html: string, ctx?: { bundle?: Record<string, BundleChunk> }) {
            // Idempotent by CONTENT, not by a flag. Vite calls `transformIndexHtml` more than once
            // per dev server: a plugin-lifetime boolean would be consumed by the first call, and the
            // page that actually reaches the browser — a later call — would come back without the
            // script: devtools that never initialise, and an injected-import error that appears only
            // sometimes.
            // The route table FIRST, and in the head: module scripts run in document order, and the
            // outlet boots the router from the shell the app imports in its own script. A table
            // seeded after that is a table the first navigation never sees.
            if (isDevMode && scannedRoutes.length > 0 && !html.includes(VIRTUAL_ROUTES_DEV_ID)) {
                const url = '/@id/' + RESOLVED_ROUTES_DEV_ID.replace('\0', '__x00__');
                const tag = `<script type="module" src="${url}"></script>`;
                html = html.includes('</head>')
                    ? html.replace('</head>', `${tag}\n</head>`)
                    : tag + html;
            }
            // A production build announces the first screen's chunks, which the browser would
            // otherwise learn about only after running the entry — one round-trip later, and two for
            // what those chunks import. `ctx.bundle` exists only in a build, which is also the only
            // place the file names exist.
            if (!isDevMode && ctx?.bundle && preloadRoutes.length > 0 && !html.includes('rel="modulepreload"')) {
                const tags = preloadTags(
                    routePreloadFiles(ctx.bundle, scannedRoutes, preloadRoutes), viteBase);
                // In the head, before the entry's own script: the browser starts them together
                // rather than after it.
                if (tags) html = html.replace('</head>', `${tags}\n</head>`);
            }
            // The splash, in dev as in a build: a cold load is a cold load either way.
            if (splash && scannedRoutes.length > 0) html = injectSplash(html, splash);
            if (devtools && isDevMode && !html.includes(VIRTUAL_DEVTOOLS_ID)) {
                // `/@id/` + the RESOLVED id, with the leading NUL written `__x00__`: that is how Vite
                // addresses a virtual module from a URL. Pointing at the bare id instead makes the tag
                // disappear from the served HTML altogether — no error, no devtools, and a clean
                // console that looks exactly like a fix.
                const url = '/@id/' + RESOLVED_DEVTOOLS_ID.replace('\0', '__x00__');
                // FIRST in the head, before the app's own script: module scripts run in document order,
                // and the devtools raise the telemetry level that makes the inspector record a signal
                // as it is created. Injected before </body> they would run after the app has built every
                // signal, and the Signals tab would be empty.
                const tag = `<script type="module" src="${url}"></script>`;
                return injectAfterHeadOpen(html, tag);
            }
            return html;
        },

        transform(code: string, id: string) {
            if (!extensions.some(ext => id.endsWith(ext))) return null;

            // A blank source is never a component, and compiling it is worse than refusing it:
            // `compile('')` produces a module that REGISTERS the tag and renders an empty <div>, so
            // `customElements.get()` answers true and the page comes up missing a piece with every
            // signal saying it is fine.
            //
            // The usual cause is a write still in flight — the editor truncated the file and had not
            // written it back when Vite read it — so the disk is asked ONCE before giving up. That is
            // the whole remedy for the in-flight case: no timer, no retry loop, just the current
            // bytes. If the disk agrees the file is blank, it is a real mistake and says so.
            if (code.trim() === '') {
                let onDisk = '';
                try { onDisk = readFileSync(id.split('?')[0], 'utf-8'); } catch { /* gone or virtual → blank */ }
                if (onDisk.trim() === '') {
                    throw new Error(
                        `PDX_EMPTY_SOURCE: ${basename(id)} is empty.
` +
                        `  File: ${id}
` +
                        `  A .pdx with no template and no script compiles to a component that registers and renders nothing,
` +
                        `  which is indistinguishable from a working one. If the file was just saved, save it again: this is
` +
                        `  what a read of a half-written file looks like.`
                    );
                }
                code = onDisk;
            }

            try {
                // Vite's root, not the cwd: with cwd ≠ root a template inside the app would be refused as
                // "outside the project root", and one outside it but under the cwd let in.
                const projectRoot = normalize(viteRoot ?? process.cwd());
                const resolver = projectFileResolver(projectRoot);
                // Determine minify: explicit option wins, otherwise auto-detect from build mode
                const minify = shouldMinify !== undefined ? shouldMinify : !isDevMode;
                const result = compile(code, id, compilerPlugins, resolver, {
                    minify, componentDirs, production: !isDevMode, logWarnings: true, logDesign: design, target, prefix,
                    // The file a runtime error names, as the app knows it.
                    sourceFile: isDevMode ? relative(projectRoot, normalize(id)).replace(/\\/g, '/') : undefined,
                    defaultLayout,
                    propsOf: (tag) => componentResolver.propsOf(tag),
                    enumValues: (tag, prop) => componentResolver.enumValues(tag, prop),
                    methodsOf: (tag) => componentResolver.methodsOf(tag),
                    modelsOf: (tag) => componentResolver.modelsOf(tag),
                    alphaOf: (tag) => componentResolver.alphaOf(tag),
                    requiredPropsOf: (tag) => componentResolver.requiredPropsOf(tag),
                    requiredSlotsOf: (tag) => componentResolver.requiredSlotsOf(tag),
                    eventHeardAbove: (event, tag) => componentResolver.eventHeardAbove(event, tag),
                    importPathOf: (tag) => componentResolver.resolve(tag)?.importPath ?? null,
                });
                let output = result.code;
                // The imports below go in after the map was made: it moves with them.
                let map = result.map;
                const shiftMap = (line: number, count: number) => { map = insertMapLines(map, line, count); };

                // Track @store declarations for auto-import
                const storeMatch = code.match(/@store\s+(\w+)/);
                if (storeMatch) {
                    const storeName = storeMatch[1];
                    storeRegistry.set(storeName, id);
                }

                // Auto-import: detect useXxx() calls without matching import
                output = injectStoreImports(output, id, storeRegistry, shiftMap);

                // Auto-import: detect <pdx-*> tags and inject component imports
                // Pass resolved template for <template src="..."> external templates
                output = injectComponentImports(output, id, code, componentResolver, result.resolvedTemplate, shiftMap);

                // Tag collision detection: two .pdx files must not derive the same CE tag
                const tagMatch = output.match(/component\('([\w-]+)'/);
                if (tagMatch) {
                    const tag = tagMatch[1];
                    const existingFile = tagRegistry.get(tag);
                    if (existingFile && existingFile !== id) {
                        throw new Error(
                            `PDX_TAG_COLLISION: "${tag}" is already registered by "${shortPath(existingFile)}".\n` +
                            `  Conflicting file: ${shortPath(id)}\n` +
                            `  Fix: add @tag '${prefix}-unique-name'; in one of the files to disambiguate.`
                        );
                    }
                    tagRegistry.set(tag, id);
                }

                // HMR: inject hot module replacement for dev mode, and keep the source this module
                // was compiled from, which a save is compared with (#246).
                if (isDevMode) {
                    if (tagMatch) output = injectHMR(output, tagMatch[1]);
                    compiledSources.set(id, code);
                }

                // 'no-treeshake': compiled .pdx modules register Custom Elements globally
                // via component() → customElements.define(). Rollup must preserve them.
                // SourceMapJSON.sourcesContent is (string|null)[]; Vite's SourceMapInput
                // wants string[]. Genuine framework-boundary impedance — Vite accepts it.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return { code: output, map: map as any, moduleSideEffects: 'no-treeshake' as const };
            } catch (e: unknown) {
                this.error(`[pdx] ${id}: ${(e as Error).message}`);
            }
        },

        /**
         * Notice a `.pdx` that did not exist when the map was built.
         *
         * `ComponentResolver` scans the project once, at `buildStart`, and auto-import consults that
         * map. A component created while the server runs would otherwise be unknown: its tag resolves
         * to nothing, the element upgrades to nothing, and it renders EMPTY — no error, no warning,
         * nothing in the console. `vite build` is not affected, so the thing you are debugging would
         * not exist in the artefact you ship.
         *
         * `handleHotUpdate` cannot serve here: it fires for files in the module graph, and a file
         * that has just been created is in nobody's graph. The watcher's `add` is the event.
         */
        configureServer(server: ViteDevServer) {
            server.watcher.on('add', (file: string) => {
                if (!extensions.some(ext => file.endsWith(ext))) return;
                refreshRouteTypes();

                const root = viteRoot ?? process.cwd();
                const before = componentResolver.size;
                componentResolver.registerProjectComponents(root, componentDirs, prefix);
                if (componentResolver.size === before) return;   // nothing new to tell anyone about

                // Every module that USES the new tag was already transformed without its import, so
                // patching one module would leave the rest stale. Drop the compiled .pdx modules and
                // reload: adding a component is rare, and a correct page beats a cheap update.
                for (const mod of server.moduleGraph.idToModuleMap.values()) {
                    if (mod.id && extensions.some(ext => mod.id!.endsWith(ext))) {
                        server.moduleGraph.invalidateModule(mod);
                    }
                }
                server.ws.send({ type: 'full-reload' });
                // Said out loud: a silent reload is the problem this exists to avoid.
                console.log(`[pdx] new component ${basename(file)} — reloading so its tag resolves`);
            });
        },

        async handleHotUpdate(ctx) {
            if (extensions.some(ext => ctx.file.endsWith(ext))) {
                // A route changed (#150): `.pdx/routes.d.ts` follows, while the server runs. Read the
                // saved text, not the module: a page that has just lost its `@page` changes the routes too.
                const file = ctx.file.replace(/\\/g, '/');
                if (/^[ \t]*@page[ \t]/m.test(await ctx.read()) || scannedRoutes.some((r) => r.file === file)) {
                    refreshRouteTypes();
                }
                const mod = ctx.server.moduleGraph.getModuleById(ctx.file);
                if (mod) {
                    ctx.server.moduleGraph.invalidateModule(mod);
                    // A save that changes only style blocks (#246): rewrite the style elements in the
                    // page and run no module update, so nothing re-renders. The module stays
                    // invalidated above, so a reload compiles the new CSS.
                    const id = mod.id ?? ctx.file;
                    const before = compiledSources.get(id);
                    if (before !== undefined) {
                        const next = await ctx.read();
                        const swaps = styleOnlyUpdate(before, next, id, target);
                        if (swaps) {
                            compiledSources.set(id, next);
                            if (swaps.length > 0) ctx.server.ws.send({ type: 'custom', event: STYLE_EVENT, data: { styles: swaps } });
                            return [];
                        }
                    }
                    // Let Vite's default HMR handle the update.
                    // The injected import.meta.hot.accept() in each module will:
                    //   1. Save signal state
                    //   2. Swap prototypes on the registered CE class
                    //   3. Re-render all live instances
                    //   4. Restore signal state
                    return;
                }
            }
        },
    };
    return [main, designTargetPlugin(target)];
}

/** Result of compiling a .pdx file. */
/** The slice of Vite's dev server this plugin touches. Declared rather than imported: the compiler
 *  does not depend on vite, and a structural type keeps it that way. */
interface ViteDevServer {
    watcher: { on(event: string, handler: (file: string) => void): void };
    ws: { send(payload: { type: string }): void };
    moduleGraph: {
        idToModuleMap: Map<string, { id: string | null }>;
        invalidateModule(mod: { id: string | null }): void;
    };
}

export interface CompileResult {
    code: string;
    map: SourceMapJSON;
    /** Validation warnings (non-fatal). Empty array if none. */
    warnings: ValidationWarning[];
    /** Resolved template content (for external <template src="...">, or inline). Used by auto-import. */
    resolvedTemplate?: string;
}

/**
 * Compile a .pdx source string into JavaScript + source map.
 * Exported for testing and programmatic use.
 */
/** Resolves a relative src= path to file content. Injected by Vite plugin or tests. */
export type FileResolver = (srcPath: string, fromFile: string) => string;

/** Compile options beyond plugins and file resolver. */
export interface CompileOptions {
    /** Minify HTML templates. Default: false. */
    minify?: boolean;
    /** Directories for auto-resolving component imports. */
    componentDirs?: string[];
    /** Production mode: enables CSS minification and optimizations. Default: false. */
    production?: boolean;
    /**
     * Write a block's static markup as HTML where the parser keeps it exactly (#369). Default: true.
     * False keeps one DOM call per node: what the test that proves the two equal compares it with.
     */
    staticMarkup?: boolean;
    /** The browser target the output relies on, `pdx({ target })` (#121). Default: 'baseline-2026'. */
    target?: BrowserTarget;
    /** The app's component tag prefix, `pdx({ prefix })` (#136). Default: 'app'. */
    prefix?: string;
    /**
     * The .pdx as the app knows it, relative to its root (`src/pages/login.pdx`). Registered with the
     * component so a runtime error names its file. The dev server passes it; a production
     * build ignores it.
     */
    sourceFile?: string;
    /** Log warnings to console. Default: false (silent for programmatic use). */
    logWarnings?: boolean;
    /**
     * With `logWarnings`, print the `design` category of findings too. Default false:
     * the console prints defects. The returned `warnings` carry both either way.
     */
    logDesign?: boolean;
    /**
     * Declared props of known components (the plugin passes the UI manifest's). With it, a bound
     * name that matches a prop only case-insensitively — `:withborder` — is emitted as the prop, and
     * one that matches none warns PDX_UNKNOWN_PROP. Without it, names are emitted as written.
     */
    propsOf?: PropsLookup;
    /**
     * Allowed values of enum props of known components (the plugin passes the UI manifest's). With
     * it, a static or literal value outside them warns PDX_INVALID_ENUM_VALUE.
     */
    enumValues?: EnumLookup;
    /**
     * Methods library components expose (the plugin passes the UI manifest's). With it, a
     * `command="--name"` its target does not expose is PDX_COMMAND_UNKNOWN (#140).
     */
    methodsOf?: MethodsLookup;
    /**
     * Models components declare (the plugin passes the resolver's: project .pdx files and the UI
     * manifest). With it, `::x` on a component prop that is not a model is PDX_TWO_WAY_NOT_MODEL (#124).
     */
    modelsOf?: ModelsLookup;
    /**
     * The alpha events library components no longer emit (the plugin passes the resolver's `alphaOf`,
     * #478). With it, a listener on one is PDX_REMOVED_FORM naming the model's event.
     */
    alphaOf?: AlphaLookup;
    /**
     * Props components require (the plugin passes the resolver's: project .pdx files and the UI
     * manifest). With it, a use that leaves one unset is PDX_PROP_REQUIRED (#130).
     */
    requiredPropsOf?: RequiredPropsLookup;
    /**
     * Typed snippets components require (the plugin passes the resolver's: project .pdx files). With
     * it, a use that does not fill one is PDX_SLOT_REQUIRED (#489).
     */
    requiredSlotsOf?: RequiredSlotsLookup;
    /**
     * Whether the project listens to an event above a component (the plugin passes the resolver's
     * `eventHeardAbove`: the project's templates). With it, an `@event(bubbles)` nothing hears above
     * the component is PDX_EVENT_BUBBLES_UNUSED (#138).
     */
    eventHeardAbove?: (event: string, tag: string) => boolean;
    /**
     * Where a `<pdx-…>` tag's module lives, for the components a `@defer` block renders.
     *
     * The tag scan auto-imports a component with a STATIC import at the top of the module, and a
     * static import is what decides the chunk — so a chart behind `@defer` would ship in the route's
     * payload and only its RENDER would be postponed. With this, the defer emits its own
     * `import()` and the payload is postponed too.
     */
    importPathOf?: (tag: string) => string | null;
    /** The layout a `@page` renders in when it declares none; `@layout 'none'` opts out. */
    defaultLayout?: string;
    /**
     * Honour the file's `pdx-ignore` exemptions. Default true. A caller that adds
     * findings of its own — `pdx check`, the editor — passes false and applies them once, to
     * everything, with `applyIgnores`.
     */
    applyIgnores?: boolean;
}

export function compile(
    source: string,
    filename: string,
    plugins?: CompilerPlugin[],
    resolveFile?: FileResolver,
    options?: CompileOptions
): CompileResult {
    // A .pdx with only a <style> block (no <template>, no <script>) is not a component — it
    // would otherwise be routed to the script-only path and analyzed as if the CSS were code,
    // producing garbage. Fail with a clear message.
    if (!filename.endsWith('.pdx.ts') && source.includes('<style') && !source.includes('<template') && !source.includes('<script')) {
        throw new Error(
            'A .pdx file needs a <template> or <script> block — found only <style>.\n' +
            '  Hint: add a <template> ... </template> block (a <style>-only file is not a component).'
        );
    }

    // .pdx.ts files are script-only (no SFC parsing)
    const isScriptOnly = filename.endsWith('.pdx.ts') || !source.includes('<template');
    if (isScriptOnly) {
        return compileScriptOnly(source, filename, plugins, options);
    }

    const descriptor = parseSFC(source);

    // A block was opened but never closed — report it instead of silently degrading to a
    // <div></div> / ignored script.
    if (descriptor.errors && descriptor.errors.length > 0) {
        throw new Error(descriptor.errors.join('\n'));
    }

    if (!descriptor.template && !descriptor.script) {
        throw new Error('Missing <template> and <script> blocks');
    }
    // Template optional for @store files — use empty div
    if (!descriptor.template) {
        descriptor.template = { content: '<div></div>', start: 0, end: 17, src: null, shadow: false };
    }

    // Resolve external src= references — read content from external files
    if (descriptor.script?.src) {
        if (!resolveFile) throw new Error(
            `<script src="${descriptor.script.src}"> requires a file resolver.\n` +
            `  When using compile() directly, pass a resolveFile function.\n` +
            `  The Vite plugin provides this automatically.`
        );
        descriptor.script.content = resolveFile(descriptor.script.src, filename);
    }
    // Every block, not only the first: a file may carry a scoped block and a plain one, and each
    // may name its own file.
    for (const style of descriptor.styles ?? (descriptor.style ? [descriptor.style] : [])) {
        if (!style.src) continue;
        if (!resolveFile) throw new Error(
            `<style src="${style.src}"> requires a file resolver.\n` +
            `  When using compile() directly, pass a resolveFile function.`
        );
        style.content = resolveFile(style.src, filename);
    }
    if (descriptor.template?.src) {
        if (!resolveFile) throw new Error(
            `<template src="${descriptor.template.src}"> requires a file resolver.`
        );
        descriptor.template.content = resolveFile(descriptor.template.src, filename);
    }

    const templateLineOffset = countLines(source, 0, descriptor.template!.start);
    const tag = deriveTag(filename, options?.prefix);

    const runner = plugins?.length ? new PluginRunner(plugins, filename, tag) : null;

    // Run transformScript hooks before parsing
    let scriptContent = descriptor.script?.content ?? '';
    const writtenScript = scriptContent;
    if (runner) {
        scriptContent = runner.runTransformScript(scriptContent);
        if (descriptor.script) {
            descriptor.script.content = scriptContent;
        }
    }

    // Minify template HTML if requested (strip whitespace between tags)
    let templateContent = descriptor.template!.content;
    if (options?.minify) templateContent = minifyHTML(templateContent);

    // Collect plugin custom directive names for the parser
    const parserDirectives = new Set<string>();
    if (runner) {
        const directives = runner.getTemplateDirectives();
        for (const name of directives.keys()) parserDirectives.add(name);
    }

    // And its column, when the content starts on the `<template>` line.
    const templateColumn = templateStartInFile(source, descriptor.template!).column;
    // A `@word (` that is no directive and no plugin's: the parser leaves it as text and tells us,
    // because only here are the plugins' directives known. The first occurrence of each name (#296).
    const unknownDirectives = new Map<string, SourceLoc>();
    const ast = parseTemplate(templateContent, templateLineOffset + 1, parserDirectives, templateColumn,
        (name, loc) => { if (!unknownDirectives.has(name)) unknownDirectives.set(name, loc); });

    // Run validation pass — cross-check template vs script declarations
    // Also reuse this analysis in compileSFC to avoid double-parsing
    const allWarnings: ValidationWarning[] = [];
    for (const [name, loc] of unknownDirectives) {
        allWarnings.push({
            code: 'PDX_UNKNOWN_DIRECTIVE',
            severity: 'warn',
            message: `\`@${name}\` is not a directive: no plugin registers it, so it is written into the page as text.`,
            hint: `Register it with a plugin's \`templateDirectives\`, or write \`@@${name}\` for the text.`,
            line: loc.line,
            column: loc.column,
        });
    }
    let cachedAnalysis: ReturnType<typeof analyzeScript> | null = null;
    if (scriptContent) {
        // Where the script starts in the .pdx, so the analysis can say where each line came from and
        // the source map follows it. Not for a script read from another file, nor one a
        // plugin rewrote: its lines are no longer the .pdx's.
        const originBase = descriptor.script && !descriptor.script.src && scriptContent === writtenScript
            ? descriptor.script.start : undefined;
        // And on which line, so a development build can name an effect `file.pdx:line`.
        const lineBase = originBase === undefined ? undefined : countLines(source, 0, originBase) + 1;
        cachedAnalysis = analyzeScript(scriptContent, filename, { originBase, lineBase });
        // Collect structural warnings from analyzer (@prop without type, etc.)
        allWarnings.push(...cachedAnalysis.warnings);
        // Cross-check template identifiers against script declarations
        // The tag this file registers, which a listener above it is written on another tag than.
        const ownTag = cachedAnalysis.customTag ?? tag;
        const heard = options?.eventHeardAbove;
        allWarnings.push(...validate(cachedAnalysis, ast, filename, {
            enumValues: options?.enumValues, methodsOf: options?.methodsOf, modelsOf: options?.modelsOf, requiredPropsOf: options?.requiredPropsOf,
            requiredSlotsOf: options?.requiredSlotsOf,
            eventHeardAbove: heard ? (event) => heard(event, ownTag) : undefined,
        }));
        // An @action offered to agents that no control of the template runs (#502, decision 31).
        allWarnings.push(...validateAgentActions(cachedAnalysis, ast));
        // The app's default layout, or none for `@layout 'none'`.
        if (cachedAnalysis.route?.page) {
            cachedAnalysis.route.layout = routeLayout(cachedAnalysis.route.layout, options?.defaultLayout);
        }
    }
    // What the styles say that the browser will not read.
    allWarnings.push(...validateStyles(descriptor.styles ?? [], source));
    // The variants the script declares against the @variant rules the styles write (#153).
    allWarnings.push(...validateVariants(cachedAnalysis?.variants, descriptor.styles ?? [], source));
    // The component-design rules one file can decide: CD-A1, A2, D3, C2.
    allWarnings.push(...validateDesign(descriptor, cachedAnalysis, source));
    // A name declared twice by runes or @prop: the output would keep one of them in silence.
    allWarnings.push(...validateDeclarations(descriptor, source));
    // A $signal's value changed in place: the signal is never set, and nothing updates.
    allWarnings.push(...validateSignalMutation(descriptor, cachedAnalysis, source, ast));
    // A signal()/computed() written by hand and read bare by the template: it shows the function (#362).
    allWarnings.push(...validateHandWrittenSignals(descriptor, cachedAnalysis, source));
    // Content inside `<component :is>`: no render path renders it (#358).
    if (descriptor.template) allWarnings.push(...validateDynamicContent(descriptor.template.content, descriptor.template.start, source));
    // A form the beta removed, from the registry of language changes (#121).
    allWarnings.push(...checkRemovedForms(descriptor, source, { alphaOf: options?.alphaOf }));
    // `required` on a control bound to a form field: the schema's to say (#128).
    allWarnings.push(...checkRequiredInMarkup(source));
    // A `$` rune where the compiler does not read it: left as written, undefined at run time (#278).
    allWarnings.push(...validateRunePosition(descriptor, source));
    // An `export` in a component script: inside setup() it is a syntax error at load (#551).
    allWarnings.push(...validateScriptExports(descriptor, source, !!cachedAnalysis?.globalStore));
    // `<script setup>`: one script grammar (#158), so `setup` changes nothing. Said once, at the tag.
    if (descriptor.script?.setup) allWarnings.push(setupRedundant(source));

    // A `${` inside a bound value would be written into the module as it is, and the module would not
    // parse: the build would die in rollup, far from the line at fault. Stop here, at the line.
    const unbuildable = allWarnings.find((w) => w.code === 'PDX_RAW_INTERPOLATION_IN_BINDING');
    if (unbuildable) {
        const where = unbuildable.line !== undefined ? `${filename}:${unbuildable.line}:${unbuildable.column ?? 1}` : filename;
        throw new Error(`[PDX_RAW_INTERPOLATION_IN_BINDING] ${where} — ${unbuildable.message}\n  Hint: ${unbuildable.hint}`);
    }

    // The findings the file declares intended are neither logged nor returned.
    const ignores = options?.applyIgnores === false ? [] : parseIgnores(source);

    // Emit warnings to console only when explicitly requested (not in test/programmatic use)
    const logFrom = (from: number, list: ValidationWarning[] = allWarnings) => {
        if (!options?.logWarnings) return;
        for (const w of list.slice(from)) {
            if (exemptionFor(ignores, w)) continue;
            // A design-review question is `pdx check --design`'s, not every save's.
            if (!options.logDesign && DIAGNOSTICS[w.code]?.category === 'design') continue;
            const where = w.line !== undefined ? `${filename}:${w.line}:${w.column ?? 1}` : filename;
            console.warn(`[pdx] ${where}: ${w.message}${w.hint ? `\n  Hint: ${w.hint}` : ''}`);
        }
    };
    // Where each finding is, by the text it names.
    positionWarnings(source, allWarnings, cachedAnalysis?.body);
    logFrom(0);

    // Codegen diagnostics land here. validate() has already run above and never sees them: they are
    // discovered while GENERATING, and without this PDX_REWRITE_FALLBACK would reach a console and
    // nothing else.
    const beforeCodegen = allWarnings.length;
    let code = compileSFC(
        descriptor, ast, filename, runner,
        { production: options?.production, warnings: allWarnings, propsOf: options?.propsOf, importPathOf: options?.importPathOf, mapOrigins: true,
          sourceFile: options?.sourceFile, staticMarkup: options?.staticMarkup, target: options?.target, tagPrefix: options?.prefix,
          // The template's code is marked too — not when minifying rewrote it, nor when
          // it was read from another file: its offsets would not be the .pdx's.
          templateOrigin: descriptor.template && !descriptor.template.src && !options?.minify ? descriptor.template.start : null },
        cachedAnalysis,
    );
    // Where they are: the rewrite has no positions, the source does. `pdx check` and the editor
    // report these by line.
    for (const w of allWarnings.slice(beforeCodegen)) {
        if (w.line !== undefined) continue;
        const at = locateBoundName(source, w.message);
        if (at) { w.line = at.line; w.column = at.column; }
    }
    positionWarnings(source, allWarnings, cachedAnalysis?.body);
    // ...and reach the dev console too: PDX_UNKNOWN_PROP is found while generating.
    logFrom(beforeCodegen);

    // The source map, from where each line came from: the code generator marked them, and the marks
    // come out of the module here — before a plugin sees it, so a plugin reads the
    // module it always read. One that moves lines moves them under the map.
    const origins = collectOrigins(code);
    code = origins.code;
    const map = mapFromOrigins(extractFilename(filename), source, origins.marks);

    // Run transformOutput hooks
    if (runner) {
        code = runner.runTransformOutput(code);
    }

    // The exemptions, applied once to everything this compile found. Unused ones are not reported
    // here: compile() does not run every check (`pdx check` does, and reports them).
    let warnings = allWarnings;
    if (ignores.length) {
        warnings = applyIgnores(source, allWarnings).warnings;
        logFrom(0, warnings.filter((w) => w.code.startsWith('PDX_IGNORE_')));
    }

    // Each finding points to where its code is explained.
    for (const w of warnings) w.url ??= diagnosticUrl(w.code);

    return { code, map, warnings, resolvedTemplate: descriptor.template?.content };
}

/** Count newlines in source from `start` to `end` position. */
function countLines(source: string, start: number, end: number): number {
    let count = 0;
    for (let i = start; i < end && i < source.length; i++) {
        if (source[i] === '\n') count++;
    }
    return count;
}

/**
 * Compile a script-only file (.pdx.ts or .pdx without <template>).
 * Applies signal rewrite + rune codegen without component() wrapping.
 * Used for @store modules and other non-UI code that uses PDX reactivity.
 */
function compileScriptOnly(
    source: string,
    filename: string,
    plugins?: CompilerPlugin[],
    options?: CompileOptions,
): CompileResult {
    const tag = deriveTag(filename, options?.prefix);
    const runner = plugins?.length ? new PluginRunner(plugins, filename, tag) : null;

    // A .pdx routed here may still carry <script> tags (a no-<template> SFC, e.g. @store files):
    // strip the SFC wrapper so we analyze/lower the pure script body, not the literal tags.
    // A genuine .pdx.ts / tag-less source is used as-is.
    const sfcScript = source.includes('<script') ? parseSFC(source).script : null;
    let scriptContent = sfcScript?.content ?? source;
    const writtenScript = scriptContent;
    // Run transformScript hooks
    if (runner) scriptContent = runner.runTransformScript(scriptContent);
    // Where the script starts in the file, so the module's map follows each line: the
    // same origins the setup script of a .pdx carries. Not when a plugin rewrote it.
    const originBase = scriptContent === writtenScript ? (sfcScript ? sfcScript.start : 0) : undefined;
    // The analysis the code generator reads, with origins. compileSFC runs the plugins'
    // analyzeScript hook on it, once.
    const lineBase = originBase === undefined ? undefined : countLines(source, 0, originBase) + 1;
    const codegenAnalysis = () => analyzeScript(scriptContent, filename, { originBase, lineBase });
    /** The module without its origin marks, and the map they make. */
    const mapped = (code: string) => {
        const origins = collectOrigins(code);
        return { code: origins.code, map: mapFromOrigins(extractFilename(filename), source, origins.marks) };
    };

    const analysis = analyzeScript(scriptContent, filename);
    if (runner) runner.runAnalyzeScript(analysis);
    // Positioned in the file, as compile() does for a .pdx: returned as they come, every finding of a
    // script-only file would have no line. Not when a plugin rewrote the script: its text is no
    // longer the file's.
    const warnings: ValidationWarning[] = scriptContent === writtenScript
        ? positionWarnings(source, [...analysis.warnings], analysis.body)
        : [...analysis.warnings];

    // @store files: use the full SFC pipeline (compileStoreMode in codegen)
    if (analysis.globalStore) {
        const wrappedSource = `<template><div></div></template>\n<script>\n${scriptContent}\n</script>`;
        const descriptor = parseSFC(wrappedSource);
        descriptor.script!.content = scriptContent;
        const ast = parseTemplate(descriptor.template!.content, 1);
        const out = mapped(compileSFC(descriptor, ast, filename, runner, {
            production: options?.production,
        }, codegenAnalysis()));
        let code = out.code;
        if (runner) code = runner.runTransformOutput(code);
        return { code, map: out.map, warnings };
    }

    // Pure script modules (utilities, composables): full rune lowering via SFC pipeline,
    // then strip the component() wrapper to produce a plain ES module.
    const wrappedSource = `<template><div></div></template>\n<script>\n${scriptContent}\n</script>`;
    const sfcDesc = parseSFC(wrappedSource);
    sfcDesc.script!.content = scriptContent;
    const ast = parseTemplate(sfcDesc.template!.content, 1);
    let code = compileSFC(sfcDesc, ast, filename, runner, {
        production: options?.production,
        scriptOnly: true,
    }, codegenAnalysis());

    // Strip component() wrapper — extract imports + setup body as module exports
    // Generated code shape: import {...} from '@pdxui/core';\n...component('tag', {\n  props: {},\n  setup(ctx) {\n    BODY\n  },\n  render: ...\n});\n
    const componentIdx = code.indexOf("component('");
    if (componentIdx !== -1) {
        const imports = code.slice(0, componentIdx).trim();
        // Extract setup body between setup(ctx) {\n and \n  },\n  render:
        const setupStart = code.indexOf('setup(ctx) {\n', componentIdx);
        const renderStart = code.indexOf('\n  },\n  render:', componentIdx);
        if (setupStart !== -1 && renderStart !== -1) {
            const bodyStart = setupStart + 'setup(ctx) {\n'.length;
            let body = code.slice(bodyStart, renderStart);
            // Remove leading indentation (4 spaces) and trailing return statement
            body = body.split('\n').map(l => l.startsWith('    ') ? l.slice(4) : l).join('\n');
            // Remove the auto-return: return { ... };
            body = body.replace(/\n\s*return\s*\{[^}]*\};\s*$/, '');
            // Remove 'component' and 'html' from the core import specifier list (not
            // needed for a pure module). Only EXACT specifiers are removed — names like
            // `componentUtils` or `htmlEscape` must survive.
            const cleanImports = stripImportSpecifiers(imports, ['component', 'html']);
            code = cleanImports + '\n\n' + body.trim() + '\n';
        }
    }

    // The marks come out once the wrapper is gone, where each line will stay.
    const out = mapped(code);
    code = out.code;
    if (runner) code = runner.runTransformOutput(code);

    if (options?.logWarnings) {
        for (const w of warnings) {
            if (!options.logDesign && DIAGNOSTICS[w.code]?.category === 'design') continue;
            console.warn(`[pdx] ${filename}: ${w.message}${w.hint ? `\n  Hint: ${w.hint}` : ''}`);
        }
    }

    return { code, map: out.map, warnings };
}


/**
 * Inject HMR accept handler into compiled module output.
 * Uses prototype swapping: saves state → swaps prototype → re-renders → restores state.
 * No full page reload needed — CE instances update in-place.
 */
function injectHMR(code: string, tag: string): string {
    return code + `
// HMR — prototype swapping (no full reload); a style-only save rewrites the style element instead
if (import.meta.hot) {
${styleSwapListener()}  import.meta.hot.accept(() => {
    import('@pdxui/core').then(({ __pdx_hmr_save, __pdx_hmr_swap, __pdx_hmr_rerender, __pdx_hmr_restore }) => {
      __pdx_hmr_save(${jsQuote(tag)});
      __pdx_hmr_swap(${jsQuote(tag)});
      __pdx_hmr_rerender(${jsQuote(tag)});
      __pdx_hmr_restore(${jsQuote(tag)});
    });
  });
}
`;
}

/**
 * Remove the given EXACT named specifiers from `{ ... }` import lists in the code.
 * Splits the specifier list on commas (so `componentUtils` is not touched when
 * removing `component`). Leaves the rest of the code unchanged.
 */
function stripImportSpecifiers(code: string, remove: string[]): string {
    const removeSet = new Set(remove);
    return code.replace(/import\s*\{([^}]*)\}\s*from\s*(['"][^'"]+['"])\s*;?/g, (_full, list: string, from: string) => {
        const kept = list.split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .filter(spec => {
                // Handle `name as alias` — match on the imported (left) name.
                const imported = spec.split(/\s+as\s+/)[0].trim();
                return !removeSet.has(imported);
            });
        if (kept.length === 0) return ''; // whole import becomes empty → drop it
        return `import { ${kept.join(', ')} } from ${from};`;
    });
}

/** Extract just the filename from a path: "/a/b/counter.pdx" → "counter.pdx" */
function extractFilename(path: string): string {
    return path.split('/').pop()?.split('\\').pop() ?? path;
}

function isPathInsideRoot(root: string, target: string): boolean {
    const rel = relative(root, target);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Reads a block's `src=` file, relative to the `.pdx`, refusing one that resolves outside the project
 * root. One resolver for the transform and for the production style module, so the two read the same
 * file.
 */
function projectFileResolver(projectRoot: string): FileResolver {
    return (srcPath, fromFile) => {
        const dir = dirname(fromFile);
        const resolved = normalize(resolve(dir, srcPath));
        // Guard against path traversal outside project root.
        // relative() catches shared-prefix siblings such as ui-framework-evil.
        if (!isPathInsideRoot(projectRoot, resolved)) {
            throw new Error(
                `src="${srcPath}" resolves outside the project root.\n` +
                `  Resolved: ${resolved}\n` +
                `  Project root: ${projectRoot}\n` +
                `  Hint: src= paths must stay within the project directory.`
            );
        }
        // Also resolve symlinks: a symlink inside the repo pointing outside would pass
        // the lexical check above but readFileSync follows it (could embed secrets in CI).
        let realResolved: string | null = null;
        try { realResolved = normalize(realpathSync(resolved)); } catch { /* missing → readFileSync errors below */ }
        if (realResolved && !isPathInsideRoot(projectRoot, realResolved)) {
            throw new Error(
                `src="${srcPath}" resolves (via symlink) outside the project root.\n` +
                `  Real path: ${realResolved}\n` +
                `  Project root: ${projectRoot}`
            );
        }
        try {
            return readFileSync(resolved, 'utf-8');
        } catch {
            throw new Error(
                `Cannot resolve src="${srcPath}" from ${fromFile}.\n` +
                `  Looked for: ${resolved}\n` +
                `  Hint: src= paths are relative to the .pdx file.`
            );
        }
    };
}

