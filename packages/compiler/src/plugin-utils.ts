// Utility functions for the Vite pdx plugin.
// Extracted from plugin.ts to keep file size manageable.

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { deriveTag } from './compiler/codegen';
import { layoutChain, routeLayout } from './compiler/codegen-shared';
import { analyzeScript } from './compiler/script-analyzer';
import { parseSFC } from './parser/sfc';
import { moduleDir } from './module-dir';
import { jsQuote, jsString } from './compiler/js-literal';

/**
 * Auto-discover @pdxui/* packages in the workspace.
 * Walks up from the compiler package to find the packages/ directory,
 * then maps each sub-package to its src/index.ts entry point.
 * Also maps known sub-path exports (e.g. @pdxui/core/testing).
 */
export function discoverPragmaticAliases(): Record<string, string> {
    const aliases: Record<string, string> = {};

    // Walk up to find packages/ directory
    let dir = moduleDir();
    for (let i = 0; i < 6; i++) {
        const packagesDir = join(dir, 'packages');
        if (existsSync(packagesDir)) {
            try {
                const entries = readdirSync(packagesDir);
                for (const entry of entries) {
                    const pkgJson = join(packagesDir, entry, 'package.json');
                    if (!existsSync(pkgJson)) continue;

                    try {
                        const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
                        const name = pkg.name as string;
                        if (!name?.startsWith('@pdxui/')) continue;

                        const srcIndex = join(packagesDir, entry, 'src', 'index.ts');
                        if (existsSync(srcIndex)) {
                            aliases[name] = normalizePath(srcIndex);
                        } else if (pkg.main) {
                            // Fallback: use main field (e.g. CSS packages like @pdxui/design)
                            const mainPath = join(packagesDir, entry, pkg.main);
                            if (existsSync(mainPath)) {
                                aliases[name] = normalizePath(mainPath);
                            }
                        }

                        // Sub-path exports
                        if (pkg.exports && typeof pkg.exports === 'object') {
                            for (const [subpath, target] of Object.entries(pkg.exports)) {
                                if (subpath === '.') continue;
                                const aliasName = name + subpath.slice(1); // './testing' → '@pdxui/core/testing'
                                const targetObj = target as Record<string, string>;
                                // Prefer the `development` condition (src) over `import` (dist): the framework
                                // is dev-first — resolution must hit source without a prior build. With
                                // dist-first exports and no dist/ on disk, picking `import` makes existsSync
                                // fail, the sub-path alias is dropped, and the base `@pdxui/x` alias then
                                // mis-resolves `@pdxui/x/sub` → `.../src/index.ts/sub`.
                                const targetPath = typeof targetObj === 'string' ? targetObj :
                                    targetObj?.development ?? targetObj?.import ?? targetObj?.types;
                                if (targetPath) {
                                    const fullPath = join(packagesDir, entry, targetPath);
                                    if (existsSync(fullPath)) {
                                        aliases[aliasName] = normalizePath(fullPath);
                                    }
                                }
                            }
                        }
                    } catch { /* skip malformed package.json */ }
                }
            } catch { /* skip unreadable directory */ }
            break;
        }
        dir = dirname(dir);
    }

    // Sort: longer aliases first (sub-paths before main packages)
    const sorted: Record<string, string> = {};
    const keys = Object.keys(aliases).sort((a, b) => b.length - a.length);
    for (const k of keys) sorted[k] = aliases[k];
    return sorted;
}

/** Normalize Windows backslash paths to forward slashes for Vite/Rollup compatibility. */
function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}

/**
 * Pre-scan directory for .pdx files with @store declarations.
 * Populates the store registry at build start, before any transforms.
 */
export function scanForStores(rootDir: string, registry: Map<string, string>): void {
    function scan(dir: string, depth = 0): void {
        if (depth > 5) return; // prevent deep recursion
        try {
            const entries = readdirSync(dir);
            for (const entry of entries) {
                if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
                const fullPath = join(dir, entry);
                try {
                    const stat = statSync(fullPath);
                    if (stat.isDirectory()) {
                        scan(fullPath, depth + 1);
                    } else if (entry.endsWith('.pdx') || entry.endsWith('.pdx.ts')) {
                        const content = readFileSync(fullPath, 'utf-8');
                        const match = content.match(/@store\s+(\w+)/);
                        if (match) {
                            registry.set(match[1], normalizePath(fullPath));
                        }
                    }
                } catch { /* skip unreadable */ }
            }
        } catch { /* skip unreadable dir */ }
    }
    scan(rootDir);
}

/** Route entry from pre-scan (simplified — just path + file for generated router). */
export interface ScannedRoute {
    path: string;
    file: string;
    tag: string;
    guard?: string;
    /** `@redirect '/target'` — this route matches, then sends the navigation elsewhere. */
    redirect?: string;
    /** `@redirect '/from' -> '/to'` — table entries, merged across every scanned file. */
    redirects?: { from: string; to: string }[];
    /** `@meta { … }` — the route's own metadata, exposed as currentMeta() while it is matched. */
    meta?: Record<string, unknown>;
    /**
     * `@loader loadUser` — the loader's NAME, never the function.
     *
     * Everything here is serialisable build-time data, and a function declared in a page module
     * cannot be referenced from `virtual:pdx-router`. The name is what the generated router needs
     * to know a route HAS a loader; the function arrives from the page module's own registration.
     */
    loader?: string;
    /**
     * The page renders a `<pdx-router-outlet>`, so routes below its path nest inside it.
     *
     * Read from the template, matched as an ELEMENT: a page that merely prints the tag inside a
     * source block is writing ABOUT the outlet, not rendering one.
     */
    hasOutlet?: boolean;

    // ─── What the OUTLET needs to render a page ─────────────────
    //
    // Not only through `globalThis.__pdx_routes`, which a page module fills when it is IMPORTED:
    // through that alone the router could not know a route exists until its page has been
    // downloaded, the entry would have to import every page, and `@page`'s promised code splitting
    // could not happen. Carried here, the generated table knows every route without loading any of
    // them, and the outlet lazily imports the one it is about to show.
    /** `@page { keepAlive }` — freeze the page instead of destroying it, optionally with a TTL. */
    keepAlive?: boolean | number;
    /** `@page { preload }` — put this page in the entry rather than in a chunk of its own. */
    preload?: boolean;
    /** `@page { label: 'Tickets' }` — what this route is called in a breadcrumb. */
    label?: string;
    /**
     * `@page { label: $t('customers.title') }` — the crumb as a dictionary key. Data,
     * so this table carries it: an ancestor a deep link never loads still names itself, in the
     * page's language. The router translates it with the route's params.
     */
    labelKey?: string;
    /** `@prefetch 'hover' | 'eager' | 'viewport' | 'never'` — when to fetch the chunk. */
    prefetch?: string;
    /** `@transition 'fade'` — the enter/exit animation between this page and the previous one. */
    transition?: string;
    /** `@scroll` — what the scroll position does when this route is entered. */
    scroll?: 'preserve' | 'top';
    /** `@outlet 'sidebar' -> 'pdx-nav'` — the parallel regions this route fills. */
    outlets?: { name: string; tag: string }[];
    /**
     * `@layout 'admin'` — the shell this page renders inside, as the TAG the outlet diffs.
     *
     * Resolved here rather than carried as the name: the outlet's stack is made of tags, and a
     * name carried all the way to the registration would be read by nobody.
     */
    layouts?: string[];
    /** The page is its own chunk: the outlet imports `file` the first time the route is shown. */
    lazy?: boolean;
}

/**
 * Pre-scan directory for .pdx files with @page declarations.
 * Populates the routes array at build start for virtual router module.
 */
export function scanForRoutes(rootDir: string, routes: ScannedRoute[],
    knowsTag?: (tag: string) => boolean, defaultLayout?: string): void {
    function scan(dir: string, depth = 0): void {
        if (depth > 5) return;
        try {
            const entries = readdirSync(dir);
            for (const entry of entries) {
                if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
                const fullPath = join(dir, entry);
                try {
                    const stat = statSync(fullPath);
                    if (stat.isDirectory()) {
                        scan(fullPath, depth + 1);
                        continue;
                    }
                    if (!entry.endsWith('.pdx')) continue;

                    const content = readFileSync(fullPath, 'utf-8');
                    if (!/^[ \t]*@page[ \t]/m.test(content)) continue;

                    // THE REAL ANALYSER, not a second set of regexes.
                    //
                    // A scan that re-reads each declaration itself — `@page` with one pattern,
                    // `@guard` with another, `@loader` with a third — drifts: every field the
                    // codegen emits and the scan does not is a route that behaves differently in
                    // a production build than in dev, silently. The scan needs EVERY field the
                    // outlet reads, so it does not guess and calls what the compiler calls.
                    const descriptor = parseSFC(content);
                    // A file with no `<script>` block is read WHOLE: a `.pdx` that is nothing but
                    // directives is what several of this scanner's own tests write. Treated as setup, which
                    // is what `<script setup>` is and what a bare declaration means.
                    const script = descriptor.script;
                    const analysis = analyzeScript(script?.content ?? content, normalizePath(fullPath),
                        { setup: script ? script.setup : true });
                    const route = analysis.route;
                    if (!route.page) continue;

                    const tag = analysis.customTag ?? deriveTag(normalizePath(fullPath));
                    // Every path this component answers to, in declaration order — the analyser
                    // puts the first in `page` and the rest in `aliases`, and the codegen registers
                    // one route per alias. A scan that produced fewer is a production build with
                    // fewer routes than the dev server.
                    const paths = [route.page, ...(route.aliases ?? [])];

                    for (const path of paths) {
                        routes.push({
                            path,
                            file: normalizePath(fullPath),
                            tag,
                            guard: route.guard,
                            redirect: route.redirectTo,
                            redirects: route.redirects,
                            meta: route.meta,
                            loader: route.loader,
                            // The outlet reads these to activate a page. Taken only from
                            // `globalThis.__pdx_routes`, which a page module fills WHEN IT IS
                            // IMPORTED, every page would have to be imported for the router to know
                            // it exists, and nothing could be split.
                            keepAlive: route.keepAlive,
                            preload: route.preload,
                            prefetch: route.prefetch,
                            transition: route.transition,
                            scroll: route.scroll as 'preserve' | 'top' | undefined,
                            // The STRING form only. `@page { label: ticketLabel }` names a
                            // function that lives in the page's module, which this table — built
                            // by scanning the sources, in a file of its own — cannot reference.
                            // The page's own registration carries it and replaces this entry when
                            // the module loads, which is before its crumb is ever drawn: the
                            // breadcrumb's last level IS the page on screen.
                            label: route.label,
                            labelKey: route.labelKey,
                            outlets: route.outlets,
                            // `@layout 'admin'` → ['pdx-admin-layout']. The same call the page's own
                            // registration makes, so the two modes resolve a name identically.
                            // The app's default when the page declares none, none for `@layout 'none'`
                            // — `routeLayout`, the same call the page's registration makes.
                            layouts: layoutChain(routeLayout(route.layout, defaultLayout), knowsTag).length > 0
                                ? layoutChain(routeLayout(route.layout, defaultLayout), knowsTag) : undefined,
                            // `@page` implies lazy loading unless the page opts out with preload.
                            // The file is the import specifier the outlet hands to `import()`.
                            lazy: !route.preload,
                            hasOutlet: /<pdx-router-outlet[\s/>]/.test(descriptor.template?.content ?? '') || undefined,
                        });
                    }
                } catch { /* skip */ }
            }
        } catch { /* skip unreadable dir */ }
    }
    scan(rootDir);
}

/**
 * A chunk of a Rollup bundle, as much of it as the preload needs.
 *
 * Declared here rather than imported from Rollup: this package has vite as a PEER dependency and
 * the shape used is four fields, three of which are strings.
 */
export interface BundleChunk {
    type: string;
    fileName?: string;
    /** The module a chunk was created FOR, when it has one — a route's `.pdx`, here. */
    facadeModuleId?: string | null;
    /** Everything the chunk contains, for a route whose chunk got merged into a bigger one. */
    moduleIds?: string[];
    /** The chunks it imports STATICALLY: fetched in the wave after it, unless they are announced. */
    imports?: string[];
    /** Vite's record of the CSS files the chunk imports, which its loader waits for. */
    viteMetadata?: { importedCss?: Set<string> };
}

/**
 * The files a cold load of `routes` needs, so the HTML can name them before the browser asks.
 *
 * Without them a cold `/` fetches its JavaScript in three waves: the entry, then — once the browser
 * has run it and learnt what else is needed — the route's own chunk, then what that chunk imports. Vite emits
 * `modulepreload` for what it can see statically, and a route is a dynamic import the generated
 * router resolves, so it sees none of it. The compiler does see it: the route table is built here.
 *
 * Two deliberate limits, and both are the same judgement — a preload that names too much is the
 * barrel defect one layer up, where the first screen pays for the whole application:
 *
 *   · only the routes asked for, `/` by default. `pdx({ preloadRoutes: […] })` for an app that
 *     lands somewhere else, and `[]` to turn it off;
 *   · the route's chunk and its STATIC imports, no deeper. A static import is fetched in the wave
 *     after the chunk that names it; a dynamic one is a thing the visitor may never reach.
 *
 * And the CSS those chunks import. Vite's dynamic-import helper waits for a chunk's stylesheets
 * before the import resolves, so the page cannot mount until they are in: found only once the entry
 * has run, they were the last wave of a cold load, and on slow 4G the first page was ready when
 * they arrived (`packages/showcase/tests/first-paint-waves.spec.ts`).
 *
 * Returns file names relative to the bundle root, in the order the browser should have them: the
 * scripts, then the stylesheets.
 */
export function routePreloadFiles(
    bundle: Record<string, BundleChunk>,
    routes: ScannedRoute[],
    paths: string[],
): string[] {
    const chunks = Object.values(bundle).filter((c) => c.type === 'chunk' && c.fileName);
    const files: string[] = [];
    const styles: string[] = [];

    for (const path of paths) {
        const route = routes.find((r) => r.path === path);
        if (!route?.file) continue;
        const source = normalizePath(route.file);

        // The chunk built FOR the page, or — when Rollup merged it into a larger one — the chunk
        // that contains it. Never the entry: preloading what the HTML already loads with a
        // `<script type="module">` is a duplicate request in some browsers and noise in all of them.
        const own = chunks.find((c) => c.facadeModuleId && normalizePath(c.facadeModuleId) === source)
            ?? chunks.find((c) => c.moduleIds?.some((m) => normalizePath(m) === source));
        if (!own || own.fileName === undefined) continue;

        for (const file of [own.fileName, ...(own.imports ?? [])]) {
            // An import may name the entry, which is already in the page — its CSS too.
            if (files.includes(file) || isEntry(bundle, file)) continue;
            files.push(file);
            const chunk = chunks.find((c) => c.fileName === file);
            for (const css of chunk?.viteMetadata?.importedCss ?? []) {
                if (!styles.includes(css)) styles.push(css);
            }
        }
    }
    return [...files, ...styles];
}

/** True when the file is the bundle's own entry chunk, which `index.html` already loads. */
function isEntry(bundle: Record<string, BundleChunk>, fileName: string): boolean {
    const chunk = Object.values(bundle).find((c) => c.fileName === fileName);
    return !!chunk && (chunk as { isEntry?: boolean }).isEntry === true;
}

/**
 * The `<link rel="modulepreload">` tags for those files, ready to go into the head.
 *
 * `crossorigin` because the module scripts Vite emits carry it, and a preload whose CORS mode does
 * not match the request it is meant to serve is fetched TWICE — which would turn a saved
 * round-trip into an extra download. A stylesheet is a `preload` `as="style"`, not a
 * `rel="stylesheet"`: it downloads without blocking the splash's paint, and the `<link>` Vite's
 * loader inserts later (also `crossorigin`) finds it in the cache.
 */
export function preloadTags(files: string[], base: string): string {
    const prefix = base.endsWith('/') ? base : `${base}/`;
    return files.map((f) => f.endsWith('.css')
        ? `<link rel="preload" as="style" crossorigin href="${prefix}${f}">`
        : `<link rel="modulepreload" crossorigin href="${prefix}${f}">`).join('\n');
}

/**
 * The route table a DEV server seeds, so the interpreted router knows what routes exist.
 *
 * A production build reads the generated router's compiled table. Dev reads
 * `globalThis.__pdx_routes`, which a page module fills WHEN IT IS IMPORTED — and with no eager
 * `import.meta.glob` importing them all (it would defeat the code splitting `@page` promises),
 * nothing else fills it: without this table every route answers 404.
 *
 * Each entry carries the page's URL rather than its module, so the outlet imports one page when it
 * first shows it: the dev server loads what the visitor reaches and nothing else, which is the same
 * shape a build has.
 *
 * Three things it deliberately does NOT do:
 *
 *   · it never overwrites an entry a page module already published. A page that has been imported
 *     has registered the real thing — its `@loader` as a FUNCTION, for one — and this table holds
 *     a name;
 *   · `loader` becomes a bridge rather than a string: import the page, then call the loader its
 *     registration brought. A string here would reach `config.loader()` as a call on a string;
 *   · nothing of this reaches a build. The module is only injected when the plugin is in dev.
 */
export function generateDevRouteTable(routes: ScannedRoute[], root: string): string {
    /** The page as the browser can ask for it: root-relative, which is what Vite serves in dev. */
    const urlOf = (file: string): string => {
        const rel = relative(root, file).replace(/\\/g, '/');
        return rel.startsWith('..') ? `/@fs/${file}` : `/${rel}`;
    };

    const entries = routes.map((r) => {
        const serialisable: Record<string, unknown> = {
            path: r.path, tag: r.tag, file: urlOf(r.file), lazy: true,
        };
        for (const key of ['guard', 'redirect', 'meta', 'keepAlive', 'preload', 'prefetch',
            'transition', 'scroll', 'label', 'labelKey', 'outlets', 'hasOutlet', 'layouts'] as const) {
            if (r[key] !== undefined) serialisable[key] = r[key];
        }
        const json = jsString(serialisable);
        // The loader bridge, written per entry so it closes over its own URL and path.
        return r.loader
            ? `{ ...${json}, loader: () => __load(${jsString(urlOf(r.file))}, ${jsString(r.path)}) }`
            : json;
    });

    const redirects = routes.flatMap((r) => r.redirects ?? []);

    return `// Generated by @pdxui/compiler for the DEV server — ${routes.length} routes.
//
// The interpreted router learns what routes exist from this table; a page module replaces its own
// entry when the outlet imports it. See generateDevRouteTable.

/** Import the page, then call the @loader its own registration published. */
async function __load(url, path) {
  const before = (globalThis.__pdx_routes ?? []).find(r => r.path === path);
  await import(/* @vite-ignore */ url);
  const live = (globalThis.__pdx_routes ?? []).find(r => r.path === path);
  // Not the bridge itself: a page whose import registered nothing would recurse forever.
  if (live && typeof live.loader === 'function' && live.loader !== before?.loader) return live.loader();
  return undefined;
}

const seeded = [\n${entries.map((e) => `  ${e},`).join('\n')}\n];
const table = (globalThis.__pdx_routes ??= []);
for (const route of seeded) {
  if (!table.some(existing => existing.path === route.path)) table.push(route);
}
${redirects.length > 0 ? `const redirects = (globalThis.__pdx_redirects ??= []);
for (const pair of ${jsString(redirects)}) {
  if (!redirects.some(existing => existing.from === pair.from)) redirects.push(pair);
}` : ''}
`;
}

/**
 * Inject auto-imports for store hooks (useXxx) that aren't explicitly imported.
 * Scans compiled code for useXxx() calls, matches against storeRegistry,
 * and adds missing import statements.
 */
export function injectStoreImports(
    code: string,
    currentFile: string,
    registry: Map<string, string>,
    /** Told where whole lines go in (0-based line, how many), so a source map can move with them. */
    onInsert?: (line: number, count: number) => void,
): string {
    if (registry.size === 0) return code;

    // Find all useXxx() calls in the code
    const usePattern = /\buse([A-Z]\w*)\s*\(/g;
    const neededImports = new Map<string, string>(); // hookName → storePath

    let match: RegExpExecArray | null;
    while ((match = usePattern.exec(code)) !== null) {
        const hookName = `use${match[1]}`;
        const storeName = match[1].charAt(0).toLowerCase() + match[1].slice(1); // useCart → cart

        // Skip if already imported
        if (code.includes(`import`) && code.includes(hookName)) {
            // Check if it's actually imported (not just mentioned in a comment)
            const importLine = code.split('\n').find(l =>
                l.trimStart().startsWith('import') && l.includes(hookName)
            );
            if (importLine) continue;
        }

        // Check if this store name is registered
        const storeFile = registry.get(storeName);
        if (storeFile && storeFile !== currentFile) {
            const fromDir = dirname(currentFile);
            let rel = relative(fromDir, storeFile).replace(/\\/g, '/');
            if (!rel.startsWith('.')) rel = './' + rel;
            neededImports.set(hookName, rel);
        }
    }

    if (neededImports.size === 0) return code;

    // Inject imports after the last existing import line
    const lines = code.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trimStart().startsWith('import ')) lastImportIdx = i;
    }

    const importLines = Array.from(neededImports.entries()).map(
        ([hook, path]) => `import { ${hook} } from ${jsQuote(path)};`
    );

    if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, ...importLines);
    } else {
        lines.unshift(...importLines);
    }
    onInsert?.(lastImportIdx + 1, importLines.length);

    return lines.join('\n');
}

/**
 * A template with its HTML comments taken out, for the passes that ask "which components does this
 * file USE".
 *
 * A comment renders nothing, so a `<pdx-…>` inside one is a mention, not a use. Counted as a use, a
 * comment explaining why a page uses a NATIVE `<select>` and not a `<pdx-select>` would ship
 * `pdx-select` (47 KB of source, plus the `createDataSource` it imports), and nothing would say so —
 * the import is not an error, the component simply registers and nobody renders it.
 *
 * Non-greedy, so a comment consumes up to its own `-->` and not past it: over-greedy would drop a
 * component that IS rendered, which fails in the browser instead of here.
 *
 * NOT for the passes that produce output — the comment stays in the rendered markup, as it does
 * in any HTML document.
 */
export function stripHtmlComments(template: string): string {
    return template.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * The template with every `@defer` block's BODY removed, for deciding which components need a
 * static import.
 *
 * Brace-counted rather than regex-matched: a defer body contains braces of its own —
 * interpolations, a nested `@if`, an inline object — and `@defer \(…\) \{[^}]*\}` stops at the
 * first of them. The `@placeholder` / `@loading` / `@error` blocks that follow are NOT removed:
 * they render immediately, so what they name belongs in the payload.
 */
export function stripDeferBlocks(template: string): string {
    let out = '';
    let i = 0;
    const re = /@defer\s*(?:\([^)]*\))?\s*\{/gi;
    for (;;) {
        re.lastIndex = i;
        const m = re.exec(template);
        if (!m) { out += template.slice(i); return out; }
        out += template.slice(i, m.index);
        // Walk to the matching close brace, counting nesting.
        let depth = 1;
        let j = m.index + m[0].length;
        for (; j < template.length && depth > 0; j++) {
            if (template[j] === '{') depth++;
            else if (template[j] === '}') depth--;
        }
        i = j;
    }
}

/**
 * Inject auto-imports for <pdx-*> component tags found in the original .pdx source.
 * Scans the source template for custom element tags, resolves them via ComponentResolver,
 * and adds missing import statements to the compiled output.
 */
export function injectComponentImports(
    compiledCode: string,
    currentFile: string,
    originalSource: string,
    resolver: import('./component-resolver').ComponentResolver,
    resolvedTemplate?: string,
    /** Told where whole lines go in (0-based line, how many), so a source map can move with them. */
    onInsert?: (line: number, count: number) => void,
): string {
    if (resolver.size === 0) return compiledCode;

    // Use resolved template if available (for <template src="..."> external files),
    // otherwise extract from original source
    let templateContent: string;
    if (resolvedTemplate) {
        templateContent = resolvedTemplate;
    } else {
        const templateMatch = originalSource.match(/<template[^>]*>([\s\S]*?)<\/template>/);
        if (!templateMatch) return compiledCode;
        templateContent = templateMatch[1];
    }
    // A tag named in a comment is not a tag used.
    templateContent = stripHtmlComments(templateContent);

    // A tag rendered ONLY inside a `@defer` block is imported by that block, dynamically, so it
    // must not get a static import here — a static import is what puts the code in the route's
    // chunk, and the whole point of `@defer` is to keep it out. A tag used both
    // inside and outside keeps its static import: it is in the payload anyway.
    const outsideDefer = stripDeferBlocks(templateContent);
    // Every custom-element tag, not only pdx-*: a component package may be anyone's.
    const tagRegex = /<([a-z][\w]*-[\w-]+)/gi;
    const usedTags = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(templateContent)) !== null) {
        usedTags.add(match[1].toLowerCase());
    }
    // Before anything is added for a reason OTHER than the markup: this drops the tags that live
    // only inside a `@defer`, and a tag that no template names cannot be judged by where it is.
    for (const tag of [...usedTags]) {
        if (!new RegExp(`<${tag}\\b`, 'i').test(outsideDefer)) usedTags.delete(tag);
    }

    // warnUnsaved (in @form or in a createForm written in script) asks through the in-app dialog,
    // which <pdx-overlay-outlet> draws. No template names it, and without it registered the
    // question cannot be shown.
    const scriptContent = originalSource.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
    if (/\bwarnUnsaved\b/.test(scriptContent)) usedTags.add('pdx-overlay-outlet');

    if (usedTags.size === 0) return compiledCode;

    // PDX_UNRESOLVED_COMPONENT: a pdx-* tag the resolver does not know
    // almost always means a missing export in packages/ui/package.json, or a component
    // file that does not exist — otherwise a silent failure (the CE is never registered,
    // zero console errors). We exclude the current file's own tag (self-reference).
    const ownTag = deriveTag(currentFile);
    for (const tag of usedTags) {
        if (tag === ownTag) continue;
        // Only the library's prefix is a claim this warning can check: another prefix may be an
        // element the page gets elsewhere (a CDN script), which validate() reports with its evidence.
        if (!tag.startsWith('pdx-')) continue;
        // `knownWithoutImport`, not `has`: a tag can be legitimate with nothing to import — the
        // design system styles pdx-split/center/container/cluster/stack/grid/spacer as element
        // selectors, @pdxui/router defines pdx-router-outlet, and pdx-toggle-group is a second
        // component() inside pdx-toggle.ts. With `has`, this warning fires for every one of them, and
        // a warning that is always wrong is the same as not having the diagnostic at all.
        if (!resolver.knownWithoutImport(tag)) {
            console.warn(`[pdx] PDX_UNRESOLVED_COMPONENT (${currentFile}): <${tag}> is unresolved — nothing in @pdxui/*, no design-system element style, and no project component. The custom element will not be registered.`);
        }
    }

    // Resolve imports for used tags
    const imports = resolver.resolveImports(
        Array.from(usedTags),
        compiledCode,
        currentFile,
    );

    if (imports.length === 0) return compiledCode;

    // Inject after the last existing import line
    const lines = compiledCode.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trimStart().startsWith('import ')) lastImportIdx = i;
    }

    if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, ...imports);
    } else {
        lines.unshift(...imports);
    }
    onInsert?.(lastImportIdx + 1, imports.length);

    return lines.join('\n');
}

/**
 * Generate an optimized switch-based router module.
 * Used as the virtual module `virtual:pdx-router`.
 * Zero regex, zero loop — pure switch statement matching.
 */
export function generateOptimizedRouter(routes: ScannedRoute[]): string {
    // No early return for a route-less project. This module is what `packages/router/src/active.ts`
    // BECOMES in a production build, so it has to export the router's whole surface even
    // when it matches nothing — a stub of `export const routes = []` is a build that fails on
    // every other import, and only in production. An app can legitimately have no `@page` yet.

    // Param constraints compile to one RegExp each, hoisted to module scope so the matcher builds
    // nothing per navigation. They are the ONLY regexes in the matcher: an unconstrained `:id` is
    // still a plain segment read, which is why the header below only claims "zero regex" when no
    // route declares a constraint.
    const constraintDecls: string[] = [];
    function constraintTest(constraint: string, segIdx: number): string {
        // The two named constraints are spelled out; anything else is the developer's own pattern,
        // embedded as a STRING (JSON.stringify escapes it) rather than pasted into a regex literal,
        // where a `/` in the pattern would terminate it early.
        const source = constraint === 'number' ? '[0-9]+'
            : constraint === 'uuid'
                ? '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
                : constraint;
        const name = `_c${constraintDecls.length}`;
        constraintDecls.push(`const ${name} = new RegExp(${jsString(`^(?:${source})$`)});`);
        return `${name}.test(s[${segIdx}])`;
    }

    // Build switch cases from routes
    const cases = routes.map((r, i) => {
        const segments = r.path.split('/').filter(Boolean);
        // `*` is dynamic too. Testing only for ':' would send '/files/*' down the static branch, where
        // it becomes a switch case compared by string equality — so the one URL that reaches the
        // route is the literal '/files/*'.
        const wildcardIdx = segments.indexOf('*');
        const isStatic = wildcardIdx === -1 && !segments.some(s => s.startsWith(':'));

        if (isStatic) {
            // Static route: exact match
            return `    case ${jsString(r.path)}: return { idx: ${i}, params: {} };`;
        } else if (wildcardIdx !== -1) {
            // A wildcard is not a param with a different sigil: `(.+)` spans slashes, so the match
            // cannot be decided from `s.length` the way every other case is — it needs "at least
            // this many segments" plus a join of the tail. The runtime router names the tail
            // `$rest` and decodes it as one string; both are reproduced here, including `(.+)`
            // requiring at least one segment after the prefix.
            const conditions = [`s.length > ${wildcardIdx}`];
            for (let j = 0; j < wildcardIdx; j++) {
                conditions.push(`s[${j}] === ${jsString(segments[j])}`);
            }
            // Decoded AFTER the join, like the runtime's single `(.+)` capture: decoding each
            // segment first would turn an encoded %2F into a separator and change the shape.
            const rest = `decodeURIComponent(s.slice(${wildcardIdx}).join('/'))`;
            return `    // ${r.path}\n    if (${conditions.join(' && ')}) return { idx: ${i}, params: { "$rest": ${rest} } };`;
        } else {
            // Dynamic route: needs segment extraction
            // Generate condition + param extraction
            const conditions: string[] = [];
            const params: string[] = [];
            conditions.push(`s.length === ${segments.length}`);
            for (let j = 0; j < segments.length; j++) {
                if (segments[j].startsWith(':')) {
                    // `:id(number)` is a param NAMED id, constrained to digits. Splitting the two
                    // apart is not cosmetic: a name that includes the constraint keys the params
                    // object `"id(number)"`, and every reader of `params.id` gets undefined — the
                    // constraint would not merely be unenforced, it would rename the param.
                    const m = /^:([^(]+)(?:\((.+)\))?$/.exec(segments[j]);
                    const paramName = m ? m[1] : segments[j].slice(1);
                    if (m?.[2]) conditions.push(constraintTest(m[2], j));
                    // Quote the param name so a segment that isn't a valid JS identifier is still a
                    // legal object key in the generated code. Decode percent-encoding so route
                    // params arrive as their literal values.
                    params.push(`${jsString(paramName)}: decodeURIComponent(s[${j}])`);
                } else {
                    // jsString escapes ', \, etc. → no broken/injectable generated string.
                    conditions.push(`s[${j}] === ${jsString(segments[j])}`);
                }
            }
            return `    // ${r.path}\n    if (${conditions.join(' && ')}) return { idx: ${i}, params: { ${params.join(', ')} } };`;
        }
    });

    // Separate static (switch) from dynamic (if chain)
    const staticCases = cases.filter(c => c.includes('case '));
    const dynamicCases = cases.filter(c => !c.includes('case '));

    // Nested routes, resolved at BUILD time.
    //
    // The interpreted router works this out per navigation; here the whole table is known, so each
    // route's chain is an array of indices decided once, by the compiler, and the running app only
    // maps it. That is the shape the "Dual Mode" table claims for the production router, applied to
    // the one feature that needed it.
    //
    // A parent is a route whose path is a SEGMENT prefix AND that renders an outlet. Both halves:
    // `/owners` is a prefix of `/owners/new` and they are siblings. `/` is excluded — a prefix of
    // everything is nobody's parent.
    const chains = routes.map((r, i) => {
        const parents = routes
            .map((p, j) => ({ p, j }))
            .filter(({ p }) => p.hasOutlet && !p.redirect && p.path !== '/' && p.path !== r.path
                && r.path.startsWith((p.path.endsWith('/') ? p.path.slice(0, -1) : p.path) + '/'))
            .sort((a, b) => a.p.path.length - b.p.path.length)
            .map(({ j }) => j);
        return `[${[...parents, i].join(',')}]`;
    }).join(', ');

    const routeEntries = routes.map((r) =>
        `  { path: ${jsString(r.path)}, tag: ${jsString(r.tag)}`
        + `${r.guard ? `, guard: ${jsString(r.guard)}` : ''}`
        + `${r.redirect ? `, redirect: ${jsString(r.redirect)}` : ''}`
        + `${r.loader ? `, loader: ${jsString(r.loader)}` : ''}`
        + `${r.meta ? `, meta: ${jsString(r.meta)}` : ''}`
        + `${r.hasOutlet ? `, hasOutlet: true` : ''}`
        // What the OUTLET needs to render the page, so it does not have to wait for the page
        // module to import itself and announce it.
        + `${r.keepAlive !== undefined ? `, keepAlive: ${jsString(r.keepAlive)}` : ''}`
        + `${r.preload ? `, preload: true` : ''}`
        + `${r.prefetch ? `, prefetch: ${jsString(r.prefetch)}` : ''}`
        + `${r.transition ? `, transition: ${jsString(r.transition)}` : ''}`
        + `${r.scroll ? `, scroll: ${jsString(r.scroll)}` : ''}`
        + `${r.label ? `, label: ${jsString(r.label)}` : ''}`
        + `${r.labelKey ? `, labelKey: ${jsString(r.labelKey)}` : ''}`
        + `${r.outlets && r.outlets.length > 0 ? `, outlets: ${jsString(r.outlets)}` : ''}`
        + `${r.layouts && r.layouts.length > 0 ? `, layouts: ${jsString(r.layouts)}` : ''}`
        + `${r.lazy ? `, lazy: true, file: ${jsString(r.file)}` : ''} }`
    ).join(',\n');

    // One `import()` with a LITERAL specifier per route that declares a loader, keyed by path. A
    // literal is what makes it a code-splitting primitive rather than a defeat of one: the bundler
    // sees it, gives the page its own chunk, and nothing is pulled in for a route without a loader.
    // Only the module is imported here — the function comes from the registration it performs.
    const loaderModules = routes
        .filter(r => r.loader && r.file)
        .map(r => `  ${jsString(r.path)}: () => import(${jsString(r.file)})`)
        .join(',\n');

    // The same, for the PAGE itself.
    //
    // `import(/* @vite-ignore */ config.file)` — a runtime string — tells Rollup not to look, so it
    // produces no chunk and the whole app stays in the entry. A literal here is what makes the split real: the bundler sees each page, gives it its
    // own chunk, and the entry keeps none of them.
    //
    // Keyed by path rather than by file because two routes can share a page (an `@alias`), and the
    // outlet has the path in hand when it is about to render.
    const pageModules = routes
        .filter(r => r.lazy && r.file && !r.redirect)
        .map(r => `  ${jsString(r.path)}: () => import(${jsString(r.file)})`)
        .join(',\n');

    // `@redirect '/from' -> '/to'` is a table entry, and a file declares it wherever it likes, so
    // the entries are merged across every scanned route. First declaration wins, which is what a
    // Map built in source order gives.
    const redirectPairs = routes.flatMap(r => r.redirects ?? [])
        .map(p => `[${jsString(p.from)}, ${jsString(p.to)}]`);

    return `// Generated by @pdxui/compiler — optimized switch-based router
// ${routes.length} routes, switch-based matching, zero loop${constraintDecls.length === 0 ? ', zero regex' : `, ${constraintDecls.length} param constraint(s)`}
import { signal, computed, effect, $t, sanitizeUrl, saveScrollPosition, restoreScrollPosition, setRouteTrail } from '@pdxui/core';

export const routes = [\n${routeEntries}\n];

/**
 * The build-time route table, for <pdx-router-outlet>.
 *
 * The outlet does not learn what routes exist from \`globalThis.__pdx_routes\`: a page module fills
 * that WHEN IT IS IMPORTED, so the entry would have to import every page and \`@page\`'s code
 * splitting could not happen. Here the whole table is known at build time and the outlet lazily
 * imports the one page it is about to show. The interpreted router answers null.
 */
export function routeTable() { return routes; }

/**
 * One \`import()\` per lazily loaded page, keyed by route path, with a LITERAL specifier.
 *
 * The literal is the whole point: \`import(config.file)\` with a runtime string is not analysed by
 * Rollup, so every page would stay in the entry chunk and \`@page\`'s code splitting would not
 * happen.
 */
const _pageModules = {${pageModules ? `
${pageModules}
` : ''}};
export function pageModule(path) { return _pageModules[path]; }
// Each route's nesting chain, outermost first, as indices into \`routes\`. Decided by the compiler:
// a flat route is a chain of one, so an app that does not nest pays a one-element array per route.
const _chains = [${chains}];
${constraintDecls.length > 0 ? `\n${constraintDecls.join('\n')}\n` : ''}
const _path = signal(typeof location !== 'undefined' ? location.pathname : '/');
const _search = signal(typeof location !== 'undefined' ? location.search : '');
const _params = signal({});
const _routeIdx = signal(-1);
const _navError = signal(null);
// The level of the chain the last 403 was raised at. A denial takes down its own level and
// what is below it, never the levels above: those were allowed.
const _navErrorDepth = signal(0);
// _search is the raw string, _query the parsed record. Both, because they answer different
// questions and deriving one from the other at every read is work done on every navigation.
const _query = signal({});
// The matched route's @meta block, cleared when the next route declares none — a stale breadcrumb
// outliving its page is the failure this is measured against.
const _meta = signal(undefined);
// Ephemeral navigation state: passed to navigate(), never in the URL, restored from history.state
// when the browser goes back.
const _state = signal(undefined);

export const currentPath = computed(() => _path());
export const currentSearch = computed(() => _search());
export const currentParams = computed(() => _params());
export const currentQuery = computed(() => _query());
export const currentMeta = computed(() => _meta());
export const currentState = computed(() => _state());
// '403' a guard denied, '404' nothing matched, null otherwise. The outlet renders one or the other,
// and without it a denial is indistinguishable from a typo in the URL.
export const currentNavError = computed(() => _navError());
// Which outlet the error belongs to: the one whose depth matches renders it, the ones above
// keep their level. 0 for a 404 and for a denial with nothing allowed above it.
export const currentNavErrorDepth = computed(() => _navErrorDepth());
export const currentRoute = computed(() => {
  const idx = _routeIdx();
  if (idx < 0) return null;
  // \`chain\` is what <pdx-router-outlet> reads to know which level IT renders. Without it a nested
  // app renders FLAT — the parent never appears — in production only. The dev router computes the
  // same array per navigation.
  return { config: routes[idx], params: _params(), path: routes[idx].path, chain: _chains[idx].map(i => routes[i]) };
});

// ─── The breadcrumb's trail ───────────────────────────────────────
// The same thing the interpreted router publishes, written here because in a production build THIS
// module is the router: a feature added only to \`runtime.ts\` works in dev and is silently absent
// from the build. \`parity.test.ts\` is what says the two agree.
//
// Ancestors BY PATH, not the render chain: a breadcrumb is navigation, and a reader who came
// through /tickets is one click from it whether or not the detail renders inside it. What keeps
// this from inventing steps is the label — a route without one contributes no crumb.
function _fillParams(pattern, params) {
  return pattern.replace(/:([A-Za-z0-9_]+)\\??/g, (whole, name) => {
    const value = params[name];
    return value === undefined ? whole : encodeURIComponent(value);
  });
}

function _isSegmentPrefix(parent, child) {
  if (parent === child || parent === '/') return false;
  const p = parent.endsWith('/') ? parent.slice(0, -1) : parent;
  return child.startsWith(p + '/');
}

// A label the page MODULE published, when this table has none: \`@page { label: ticketLabel }\`
// names a function, and a function cannot be written into a table built by scanning the sources.
// The module carries it and announces itself when it loads.
function _liveRoute(path) {
  const reg = typeof globalThis !== 'undefined' ? globalThis.__pdx_routes : undefined;
  return (reg && reg.find(r => r.path === path)) || undefined;
}

// What a level of the trail is called, or undefined for a level that is not a crumb. A dictionary
// KEY first: it is data in this table, so an ancestor a deep link never loaded still
// names itself, translated with the route's params. Then a written label, then a published one.
function _crumbLabel(level, params) {
  const key = level.labelKey !== undefined ? level.labelKey : (_liveRoute(level.path) || {}).labelKey;
  if (key !== undefined) return $t(key, params);
  const declared = level.label === undefined ? (_liveRoute(level.path) || {}).label : level.label;
  if (declared === undefined) return undefined;
  return typeof declared === 'function' ? declared(params) : _fillParams(declared, params);
}

// The last navigation, so a registration arriving after it can draw the trail again.
let _lastTrail = null;

function _onRouteRegistered(path) {
  if (!_lastTrail) return;
  if (path !== _lastTrail.matched.path && !_isSegmentPrefix(path, _lastTrail.matched.path)) return;
  _publishTrail(_lastTrail.matched, _lastTrail.params);
}

// The trail is drawn inside an effect, disposed at the next navigation: a label that reads the
// dictionary is drawn again when the language changes, or when the section holding it arrives.
// Drawn once, it would keep the language it was built in.
let _trailEffect = null;

function _publishTrail(matched, params) {
  _lastTrail = { matched, params };
  globalThis.__pdx_routeRegistered = _onRouteRegistered;
  if (_trailEffect) _trailEffect();
  _trailEffect = effect(() => {
    const ancestors = routes
      .filter(c => !c.redirect && _isSegmentPrefix(c.path, matched.path))
      .sort((a, b) => a.path.length - b.path.length);
    const crumbs = [];
    for (const level of [...ancestors, matched]) {
      const label = _crumbLabel(level, params);
      if (label === undefined) continue;
      crumbs.push({ label, href: _fillParams(level.path, params), current: level === matched });
    }
    setRouteTrail(crumbs);
  });
}

// ─── Guards ───────────────────────────────────────────────────────
// The checker is registered from OUTSIDE, exactly as in the runtime router: wiring core's
// permission system in here would make every consumer of the generated module depend on it, and
// <pdx-router-outlet> is the seam that already knows about both.
let _guardChecker = null;
let _guardFailRedirect = null;
let _warnedNoChecker = false;

export function registerGuardChecker(checker) {
  _guardChecker = checker;
  _warnedNoChecker = false;
}

// ─── Base path and redirects ──────────────────────────────────────
// The table is built at COMPILE time from every \`@redirect '/from' -> '/to'\` in the project;
// __pdx_redirects is the same list as the interpreted build publishes it, consulted so a module
// registering itself late is still honoured — exactly as runtime.ts does.
let _basePath = '';
const _redirects = new Map([${redirectPairs.join(', ')}]);
const _MAX_REDIRECTS = 5;

/**
 * The interpreted router's entry point, with the half this module cannot use removed.
 *
 * \`routes\` is IGNORED, and that is the whole difference between the two implementations: there the
 * table is built at runtime from what the page modules registered, here it was baked in at build
 * time and compiled into the switch above. The outlet passes one anyway, because it calls the same
 * function in both modes — which is what makes the seam a swap rather than a fork.
 *
 * The re-resolution is not optional. This module resolves location.pathname when it is IMPORTED,
 * which is before the outlet has registered the guard checker and before the page modules have
 * registered their loaders. createRouter is the outlet saying "now".
 */
export function createRouter(routes, options) {
  configureRouter(options);
  if (typeof window !== 'undefined') _handleNav(_stripBase(location.pathname) + location.search);
}

/** Runtime options the compiler cannot know: base path, extra redirects, the denial target. */
export function configureRouter(options) {
  if (!options) return;
  // A string, or a FUNCTION of the permission that was denied which answers one — or null for
  // "show the refusal here". A denial has two causes: no session wants the login, a session without
  // the permission wants the 403, and only the app knows which this is.
  if (typeof options.guardFailRedirect === 'string' || typeof options.guardFailRedirect === 'function') _guardFailRedirect = options.guardFailRedirect;
  if (options.redirects) for (const r of options.redirects) _redirects.set(r.from, r.to);
  if (typeof options.basePath === 'string' && options.basePath !== _basePath) {
    _basePath = options.basePath;
    // The module resolves location.pathname the moment it is imported, and that ran before this
    // call — so with a base path the first resolution used the un-stripped URL. Re-resolve rather
    // than leave the app one navigation behind its own address bar.
    if (typeof window !== 'undefined') _handleNav(_stripBase(location.pathname) + location.search);
  }
}

/** Strip the configured base path from an absolute pathname; '/base' itself becomes '/'. */
function _stripBase(pathname) {
  if (!_basePath) return pathname;
  return pathname.startsWith(_basePath) ? (pathname.slice(_basePath.length) || '/') : pathname;
}

/**
 * Is this a target the router may navigate to? Stricter than sanitizeUrl, and deliberately so:
 * sanitizeUrl exists for <a href>, where https://stripe.com is a fine target. history.pushState
 * cannot leave the origin, so an absolute URL here is never meaningful — letting one through
 * produces a SecurityError from inside the browser instead of a message naming the mistake.
 * Same rule, same order, as isRouterTarget in @pdxui/router's runtime.
 */
function _isRouterTarget(path) {
  if (sanitizeUrl(path) === null) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  if (/^[/\\\\]{2}/.test(path.replace(/\\\\/g, '/'))) return false;
  return true;
}

/** Refuse a target that leaves the origin, naming which of the four sources produced it. */
function _refuse(source, target) {
  console.warn(
    '[pdx-router] Refused ' + source + ' to "' + target + '": a router target must be a path ' +
    'inside this origin. Use location.href for an external destination.'
  );
}

// ─── Query API ────────────────────────────────────────────────────
// Both writers go through history.replaceState and then update BOTH signals from the URL that
// resulted. Setting _query alone would leave currentSearch() answering for the previous query —
// the two are one fact with two shapes, and the URL is the one that decides.

function _parseQuery(search) {
  const out = {};
  new URLSearchParams(search).forEach((v, k) => { out[k] = v; });
  return out;
}

// Publish the query, and only when it actually changed. _parseQuery builds a NEW object every
// call, so the identity check inside the signal suppresses nothing: ?status=closed written over
// ?status=closed would re-run every reader. On a page where the query round-trips — a filter
// builder writes the source, the page's handler writes the param, the param feeds the builder's
// value back — that is a pump, and the flush guard breaks the loop by dropping the pending
// effects: computeds stay marked dirty with nobody left to read them, and the screen freezes in
// silence. The same publisher exists in the interpreted router; the parity table holds the two
// together.
function _publishQuery(next) {
  const prev = _query.peek();
  const keys = Object.keys(next);
  if (keys.length === Object.keys(prev).length && keys.every(k => prev[k] === next[k])) return;
  _query.set(next);
}

/** Replace the entire query string. */
export function setQuery(params) {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams(params);
  history.replaceState(null, '', location.pathname + '?' + sp.toString());
  _publishQuery(params);
  _search.set(location.search);
}

/** Set one query param, or remove it by passing null. */
export function setQueryParam(key, value) {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams(location.search);
  if (value === null) sp.delete(key);
  else sp.set(key, value);
  const qs = sp.toString();
  history.replaceState(null, '', qs ? location.pathname + '?' + qs : location.pathname);
  _publishQuery(_parseQuery(location.search));
  _search.set(location.search);
}

// ─── Scroll restoration ───────────────────────────────────────────
// Saved on the way OUT (navigate, before the URL changes) and restored on the way BACK. A forward
// navigation goes to the top, or to the element the hash names — which is why this is not just
// "scrollTo(0,0) unless going back".

// Scroll restoration is core's, imported above — this module emits no copy of it. Several
// implementations of one behaviour is how a fix reaches one and not the others.

// ─── Route loaders ────────────────────────────────────────────────
// This module holds the loader's NAME, never the function. It is generated from serialisable
// build-time data and does not import the page modules — importing them statically would defeat the
// code splitting it exists for. The FUNCTION reaches it the way everything else a page module owns
// does: the compiled page pushes { path, tag, loader } into globalThis.__pdx_routes when it is
// imported, and this reads it from there — the same table already consulted above for redirects
// registered late.
//
// A lazily loaded route has NOT been imported yet on its first visit. So the page module is
// imported first, and only for a route that declares a loader: the outlet is about to import that module anyway to mount the
// component, and import() caches, so what this costs is the ordering, not a second fetch.
//
// One entry per LEVEL, keyed by route pattern — the same shape runtime.ts uses, for the same
// reason: with a parent and a child both loading, one signal has no answer to "whose data is
// this?". \`currentLoaderData()\` means the matched route's; \`loaderData(path)\`
// reads a named level, which is how a child reads its parent's record.
const _loaderData = signal({});
const _loaderState = signal({});
const _loaderFocus = signal(null);
/** The params each level's loader last ran with — its OWN, so a sibling move does not refetch it. */
let _loaderKeys = {};
const _loaderModules = {${loaderModules ? `\n${loaderModules}\n` : ''}};

/** What the matched route's @loader returned; undefined while loading, on error, or with no loader. */
export const currentLoaderData = computed(() => {
  const focus = _loaderFocus();
  return focus === null ? undefined : _loaderData()[focus];
});
/** 'idle' | 'loading' | 'done' | 'error' — same four values, same meanings, as the runtime router. */
export const currentLoaderState = computed(() => {
  const focus = _loaderFocus();
  return focus === null ? 'idle' : (_loaderState()[focus] ?? 'idle');
});

/** What a specific level's @loader returned, by its route pattern. Same contract as runtime.ts. */
export function loaderData(routePath) {
  return _loaderData()[routePath];
}

/** The same, for the state. */
export function loaderState(routePath) {
  return _loaderState()[routePath] ?? 'idle';
}

/** The params a level declares in its OWN pattern. */
function _ownParamNames(pattern) {
  return [...pattern.matchAll(/:([A-Za-z0-9_]+)/g)].map(m => m[1]);
}

function _loaderKey(pattern, params) {
  return _ownParamNames(pattern).map(n => n + '=' + (params[n] ?? '')).join('&');
}

/**
 * Decide what has to load and commit what does not — SYNCHRONOUSLY, and that is the point.
 * Awaiting unconditionally makes every navigation asynchronous, and then one that started earlier
 * finishes later and publishes over a newer one.
 */
function _planLoaders(chain, params) {
  const prevData = _loaderData.peek();
  const prevState = _loaderState.peek();
  const prevKeys = _loaderKeys;
  const data = {}, state = {}, keys = {}, pending = [];
  for (const level of chain) {
    const key = _loaderKey(level.path, params);
    keys[level.path] = key;
    if (!level.loader) continue;
    if (prevKeys[level.path] === key && level.path in prevData) {
      data[level.path] = prevData[level.path];
      state[level.path] = prevState[level.path] ?? 'done';
      continue;
    }
    state[level.path] = 'loading';
    pending.push(level);
  }
  _loaderData.set(data);
  _loaderState.set(state);
  _loaderKeys = keys;
  return pending;
}

/** Nothing matched, or a guard denied: no level has data any more. */
function _clearLoaders() {
  _loaderData.set({});
  _loaderState.set({});
  _loaderKeys = {};
  _loaderFocus.set(null);
}

/** The live loader a page module published for this path, or null while it has not registered. */
function _registeredLoader(path) {
  const reg = typeof globalThis !== 'undefined' ? globalThis.__pdx_routes : undefined;
  if (!reg) return null;
  const hit = reg.find(r => r.path === path);
  return hit && typeof hit.loader === 'function' ? hit.loader : null;
}

/** Look it up; import the page module and look again when it has not registered yet. */
async function _resolveLoader(config) {
  const direct = _registeredLoader(config.path);
  if (direct) return direct;
  const load = _loaderModules[config.path];
  if (!load) return null;
  await load();
  return _registeredLoader(config.path);
}

// ─── Navigation hooks ─────────────────────────────────────────────
// before: returning false cancels. after: observes a navigation that happened.
// Each returns its own unsubscribe — a hook you cannot remove is a leak for anything that
// re-registers on mount, which an outlet does.
const _beforeHooks = [];
const _afterHooks = [];

export function onBeforeNavigate(hook) {
  _beforeHooks.push(hook);
  return () => {
    const i = _beforeHooks.indexOf(hook);
    if (i >= 0) _beforeHooks.splice(i, 1);
  };
}

export function onAfterNavigate(hook) {
  _afterHooks.push(hook);
  return () => {
    const i = _afterHooks.indexOf(hook);
    if (i >= 0) _afterHooks.splice(i, 1);
  };
}

function resolve(path) {
  // Normalize trailing slash so '/users/' and '/users' resolve identically
  // (root '/' is preserved). Keeps static and dynamic matching consistent.
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const s = path.split('/').filter(Boolean);
${staticCases.length > 0 ? `  switch (path) {\n${staticCases.join('\n')}\n  }` : ''}
${dynamicCases.length > 0 ? dynamicCases.join('\n') : ''}
  return null;
}

// The main outlet (no name) the page renders in: core saves and restores the scroll of the
// container it scrolls in, not only the window's. Looked up per navigation. Same as runtime.ts
// primaryOutlet().
function _primaryOutlet() {
  return typeof document === 'undefined' ? null
    : document.querySelector('pdx-router-outlet:not([name]), pdx-router-outlet[name=""]');
}

export function navigate(path, params, state) {
  let resolved = path;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      // Global replace with a name boundary so ':id' does NOT match inside ':idCard'.
      const re = new RegExp(':' + k.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '(?![A-Za-z0-9_])', 'g');
      resolved = resolved.replace(re, encodeURIComponent(String(v)));
    }
  }
  // Checked BEFORE the address bar is written. _handleNav checks too — that is the parity with the
  // runtime router — but pushState to another origin throws a SecurityError from inside the browser,
  // which buries the message that names the mistake.
  if (!_isRouterTarget(resolved)) { _refuse('to navigate', resolved); return; }
  if (typeof window === 'undefined') { _state.set(state); return; }
  // Saved BEFORE the address bar moves: once the URL has changed, the position belongs to the
  // wrong path.
  saveScrollPosition(_path.peek ? _path.peek() : _path(), _primaryOutlet());
  // Resolved here, with or without the Navigation API: the before-hooks must run BEFORE the address
  // bar is written, and the API's navigate event only arrives after. The commit gets the
  // final target, so a redirect table entry pushes its target, once. _writeUrl keeps the listener
  // below from answering our own pushState — answering it would resolve each navigation twice, which
  // the outlet turns into two mounted pages.
  _handleNav(resolved, 0, false, false, (target) => {
    _state.set(state);
    _writeUrl('push', state ?? null, _basePath + target);
  });
}

// ─── The address bar ──────────────────────────────────────────────
// Written only once the before-hooks accept, for navigate() and for a link a person clicks. When it
// has ALREADY moved — Back, Forward, code writing history itself — a refusal puts it back on the
// screen shown. Same as runtime.ts.
let _shownUrl = null;
let _shownState = null;
let _writingUrl = false;

function _writeUrl(mode, state, url) {
  _writingUrl = true;
  try {
    if (mode === 'push') history.pushState(state, '', url);
    else history.replaceState(state, '', url);
  } finally {
    _writingUrl = false;
  }
}

function _markShown() {
  if (typeof window === 'undefined') return;
  _shownUrl = location.pathname + location.search + location.hash;
  _shownState = history.state;
}

function _restoreShown() {
  if (typeof window === 'undefined' || _shownUrl === null) return;
  _state.set(_shownState ?? undefined);
  if (location.pathname + location.search + location.hash === _shownUrl) return;
  _writeUrl('replace', _shownState, _shownUrl);
}

// Async because a guard may be: the checker returns boolean OR Promise<boolean>. Callers do not
// await it — the same fire-and-forget the runtime router uses — so navigation stays a void call.
let _navSeq = 0;

// \`bootstrap\` marks the ONE resolution this module performs when it is imported. A guarded landing
// route is denied there — correctly, it fails closed — but telling the developer to "mount
// <pdx-router-outlet>, which registers one" while the outlet is three statements away from doing
// exactly that is noise, not a diagnostic. It travels through the redirect recursion so a bootstrap
// that redirects is still a bootstrap, and it is a property of the CALL rather than of a moment in
// time: a real navigation racing the bootstrap keeps its warning.
// \`commit\` is present when the address bar has NOT been written yet (a navigate() call, a clicked link) and writes
// it once the before-hooks accept; without it the URL has already moved, and a refusal puts it back.
async function _handleNav(fullPath, depth = 0, isBack = false, bootstrap = false, commit = null) {
  const navId = ++_navSeq;

  if (!_isRouterTarget(fullPath)) { _refuse('to navigate', fullPath); return; }
  if (depth > _MAX_REDIRECTS) {
    console.warn('[pdx-router] Redirect loop detected (max ' + _MAX_REDIRECTS + ')');
    return;
  }

  // Strip query string and hash before matching — they're not part of the route pattern
  const qIdx = fullPath.indexOf('?');
  const hIdx = fullPath.indexOf('#');
  const cutIdx = qIdx >= 0 ? (hIdx >= 0 ? Math.min(qIdx, hIdx) : qIdx) : hIdx;
  const pathname = cutIdx >= 0 ? fullPath.slice(0, cutIdx) : fullPath;
  const search = qIdx >= 0 ? fullPath.slice(qIdx, hIdx >= 0 && hIdx > qIdx ? hIdx : undefined) : '';

  // The redirect table is consulted BEFORE the hooks and before matching — same order as the
  // runtime router — because a redirected navigation is the target's navigation, not the source's.
  const _redirectTarget = _redirects.get(pathname)
    ?? (typeof globalThis !== 'undefined' && globalThis.__pdx_redirects
      ? (globalThis.__pdx_redirects.find(r => r.from === pathname) || {}).to
      : undefined);
  if (_redirectTarget) {
    // Checked HERE, not on re-entry: the address bar is written before the recursive call, so a
    // check at the top of this function would let replaceState see the raw target first.
    if (!_isRouterTarget(_redirectTarget)) { _refuse('a redirect from "' + pathname + '"', _redirectTarget); return; }
    // Not written yet? Then the pending commit writes the target instead of the source.
    if (typeof window !== 'undefined' && !commit) _writeUrl('replace', null, _basePath + _redirectTarget);
    return _handleNav(_redirectTarget, depth + 1, isBack, bootstrap, commit);
  }

  const prevPath = _path.peek ? _path.peek() : _path();

  // Before-hooks run FIRST and can cancel: nothing else has happened yet — not even the address
  // bar — so a cancellation leaves the router exactly as it was. Awaited one at a time — a hook that
  // asks the user something is the reason this is async.
  for (const hook of _beforeHooks) {
    // A boolean is not awaited: awaiting it would make every navigation asynchronous as soon as any
    // hook is registered — the outlet's leave check, for one — pages with nothing to ask included.
    // The HOP, as the interpreted router passes it: depth > 0 means this navigation
    // was redirected on its way here, and a hook that asks the user something must ask once per
    // gesture rather than once per destination the router tries. It is passed rather than inferred
    // from the address bar, which this router moves and the other does not.
    const answer = hook(prevPath, pathname, { redirected: depth > 0 });
    const ok = typeof answer === 'boolean' ? answer : await answer;
    if (navId !== _navSeq) return; // superseded while the hook ran
    if (ok === false) {
      if (!commit) _restoreShown(); // the URL had already moved: put it back
      return;
    }
  }
  if (commit) commit(fullPath);

  const result = resolve(pathname);
  _path.set(pathname);
  _search.set(search);
  _publishQuery(_parseQuery(search));

  if (!result) {
    _params.set({});
    _routeIdx.set(-1);
    _meta.set(undefined);
    _navError.set('404');
    _navErrorDepth.set(0); // a no-match belongs to the outlet that owns the whole navigation
    _clearLoaders();
    _markShown();
    restoreScrollPosition(pathname, isBack, _primaryOutlet());
    for (const hook of _afterHooks) hook(prevPath, pathname);
    return;
  }

  const config = routes[result.idx];
  // A route-level redirect: matched, and sends the navigation on. After the hooks, like the runtime.
  if (config.redirect) {
    if (!_isRouterTarget(config.redirect)) { _refuse('a redirect from "' + pathname + '"', config.redirect); return; }
    if (typeof window !== 'undefined') _writeUrl('replace', null, _basePath + config.redirect);
    return _handleNav(config.redirect, depth + 1, isBack, bootstrap);
  }
  // EVERY level's guard, outermost first — the same rule as the runtime router. Reading
  // \`config.guard\` alone, a guard declared on a parent would protect the child in \`pdx dev\` and be
  // silently skipped in a production build. A flat route is a chain of one.
  const _chainIdx = _chains[result.idx];
  const _chain = _chainIdx.map(i => routes[i]);
  for (let _d = 0; _d < _chain.length; _d++) {
    const level = _chain[_d];
    if (!level.guard) continue;
    // FAILS CLOSED. A declared guard with nothing able to evaluate it is DENIED, never allowed:
    // an app that uses this module without registering a checker must not get its admin routes
    // opened by the omission.
    const allowed = _guardChecker ? await _guardChecker(level.guard) : false;
    if (!_guardChecker && !_warnedNoChecker && !bootstrap) {
      _warnedNoChecker = true;
      console.warn(
        '[pdx-router] Route guard "' + level.guard + '" was denied because no guard checker is ' +
        'registered. Mount <pdx-router-outlet>, which registers one, or call registerGuardChecker() ' +
        'yourself. A declared guard that cannot be evaluated is denied, never allowed.'
      );
    }
    if (navId !== _navSeq) return; // a newer navigation superseded us while the guard ran
    if (!allowed) {
      // Loop-safe: only redirect when configured AND not already there. The address is written
      // here as well: the commit ran before the route was matched, so it says the route that was
      // refused, and the login would render under the URL of the page it did not open.
      const _redirectTo = typeof _guardFailRedirect === 'function' ? _guardFailRedirect(level.guard) : _guardFailRedirect;
      if (_redirectTo && _redirectTo !== pathname) {
        if (!_isRouterTarget(_redirectTo)) { _refuse('a guard redirect from "' + pathname + '"', _redirectTo); return; }
        if (typeof window !== 'undefined') _writeUrl('replace', null, _basePath + _redirectTo);
        return _handleNav(_redirectTo, depth + 1, isBack, bootstrap);
      }
      _navError.set('403');
      _navErrorDepth.set(_d);
      _clearLoaders();
      // The levels ABOVE the denial were allowed and stay on screen. Pointing _routeIdx at the
      // deepest allowed level is enough: currentRoute() builds its chain from _chains[idx], which
      // IS the allowed prefix, so every outlet above the denial renders the level it already had
      // and the one at _d finds nothing and shows the refusal.
      if (_d === 0) {
        _params.set({});
        _routeIdx.set(-1); // nothing was allowed: the error page is the page
      } else {
        _params.set(result.params);
        _routeIdx.set(_chainIdx[_d - 1]);
      }
      _markShown();
      for (const hook of _afterHooks) hook(prevPath, pathname);
      return;
    }
  }

  // The loader runs AFTER the guard and BEFORE the route is published — the same position it holds
  // in runtime.ts. Data-then-render: a component that mounts and then discovers its data arrived is
  // the flicker @loader exists to remove.
  _loaderFocus.set(config.path);
  const _pending = _planLoaders(_chain, result.params);
  if (_pending.length > 0) {
    for (const level of _pending) {
      try {
        const fn = await _resolveLoader(level);
        if (navId !== _navSeq) return; // superseded while the page module loaded
        if (!fn) {
          throw new Error(
            '@loader "' + level.loader + '" is declared on ' + level.path + ' but the page module ' +
            'registered none. Declare it in <script>: async function ' + level.loader + '() { … }'
          );
        }
        const data = await fn();
        if (navId !== _navSeq) return; // a newer navigation won — drop this stale result
        _loaderData.set({ ..._loaderData.peek(), [level.path]: data });
        _loaderState.set({ ..._loaderState.peek(), [level.path]: 'done' });
      } catch (err) {
        if (navId !== _navSeq) return;
        const next = { ..._loaderData.peek() };
        delete next[level.path];
        _loaderData.set(next);
        _loaderState.set({ ..._loaderState.peek(), [level.path]: 'error' });
        console.error('[pdx-router] Loader failed for ' + level.path + ':', err);
      }
    }
    // Checked on the way out: with something to await, a navigation that started earlier can
    // finish later, and must not publish its route over a newer one.
    if (navId !== _navSeq) return;
  }

  _params.set(result.params);
  _routeIdx.set(result.idx);
  _meta.set(config.meta);
  _navError.set(null);
  _publishTrail(config, result.params);
  _markShown();
  // config.scroll, the fourth argument. Without it core's decision collapses to
  // restoring = isBack, so BOTH declarations would be no-ops in a production build: 'top' would
  // restore on Back and 'preserve' would not restore on a forward navigation. The interpreted
  // router passes it too. (No backticks in this comment: it lives inside the template
  // literal that IS the generated module.)
  restoreScrollPosition(pathname, isBack, _primaryOutlet(), config.scroll);
  for (const hook of _afterHooks) hook(prevPath, pathname);
}

// ─── Navigation listeners, and the way to take them back ──────────
// A module-level listener with no way to remove it survives HMR and every re-init: two of them
// answer the same popstate, and the second overwrites what the first decided. destroyRouter() is
// what the outlet calls before handing over — the same contract the runtime router publishes.

let _routerCleanup = null;

/** Remove this module's navigation listeners. Idempotent. */
export function destroyRouter() {
  if (_routerCleanup) { _routerCleanup(); _routerCleanup = null; }
}

if (typeof window !== 'undefined') {
  if ('navigation' in window) {
    // A person following a link (a push/replace they started, cancelable, not a form post) is
    // cancelled and resolved the way navigate() is: the hooks answer before the address bar moves.
    // Intercepting it would commit the URL first, so "leave?" would be asked with the destination
    // already in the address bar. Back/Forward, and code writing history itself, keep the intercept:
    // their URL has moved, and a refusal puts it back. Same rule as runtime.ts isLinkClick().
    const onNavigate = (e) => {
      if (_writingUrl || !e.canIntercept || e.hashChange) return;
      // A download is the browser's: it saves the file and the page stays. A bare download attribute
      // gives downloadRequest "", which is falsy: a truthiness check takes <a href download> as a
      // link click and renders a page, or the 404. A string, empty or not, is a download.
      if (typeof e.downloadRequest === 'string') return;
      const u = new URL(e.destination.url);
      const linkClick = e.cancelable && e.userInitiated
        && (e.navigationType === 'push' || e.navigationType === 'replace')
        && !e.formData && typeof e.downloadRequest !== 'string';
      if (linkClick) {
        e.preventDefault();
        const mode = e.navigationType === 'replace' ? 'replace' : 'push';
        saveScrollPosition(_path.peek ? _path.peek() : _path(), _primaryOutlet());
        _handleNav(_stripBase(u.pathname) + u.search, 0, false, false, (target) => {
          _state.set(undefined);
          _writeUrl(mode, null, _basePath + target + u.hash);
        });
        return;
      }
      // A traversal is Back or Forward: restored where it was left, as on popstate.
      const isBack = e.navigationType === 'traverse';
      e.intercept({ handler: () => _handleNav(_stripBase(u.pathname) + u.search, 0, isBack) });
    };
    navigation.addEventListener('navigate', onNavigate);
    _routerCleanup = () => navigation.removeEventListener('navigate', onNavigate);
  } else {
    // A popstate IS the back/forward button: isBack is what tells restoreScrollPosition to put the page
    // where the user left it instead of at the top, and history.state carries back the ephemeral
    // state that navigate() pushed.
    const onPopState = (e) => {
      _state.set(e.state ?? undefined);
      _handleNav(_stripBase(location.pathname) + location.search, 0, true);
    };
    window.addEventListener('popstate', onPopState);
    _routerCleanup = () => window.removeEventListener('popstate', onPopState);
  }
  _handleNav(_stripBase(location.pathname) + location.search, 0, false, true);
}
`;
}
