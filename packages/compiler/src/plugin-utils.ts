// Utility functions for the Vite pdx plugin.
// Extracted from plugin.ts to keep file size manageable.

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { deriveTag } from './compiler/codegen';
import { layoutChain, routeLayout } from './compiler/codegen-shared';
import { DEFAULT_TAG_PREFIX, RESERVED_TAG_PREFIX } from './compiler/tag-prefix';
import { analyzeScript } from './compiler/script-analyzer';
import { parseSFC } from './parser/sfc';
import { moduleDir } from './module-dir';
import { jsQuote } from './compiler/js-literal';
import { elementContent, findOpenTag, removeHtmlComments } from './text-scan';
import { iconImportLines } from './icon-imports';

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
                                // A pattern (`./icons/*` → `./src/icon/pragmatic/*.ts`) is an alias of
                                // its folder: Vite matches `@pdxui/ui/icons/check` by prefix and finds
                                // `check.ts` by extension. Without it the base alias takes the id, and
                                // `@pdxui/ui/icons/check` becomes `.../src/index.ts/icons/check`.
                                if (targetPath && subpath.endsWith('/*') && /\/\*\.[a-z]+$/.test(targetPath)) {
                                    const folder = join(packagesDir, entry, targetPath.replace(/\/\*\.[a-z]+$/, ''));
                                    if (existsSync(folder)) aliases[aliasName.slice(0, -2)] = normalizePath(folder);
                                    continue;
                                }
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

/** Route entry from pre-scan — what the route table (`route-table.ts`) is written from. */
export interface ScannedRoute {
    path: string;
    file: string;
    tag: string;
    guard?: string;
    /** `@redirect '/target'` — this route matches, then sends the navigation elsewhere. */
    redirect?: string;
    /** `@redirect '/from' -> '/to'` — table entries, merged across every scanned file. */
    redirects?: { from: string; to: string }[];
    /** `@page { meta: { … } }` — the route's own metadata, exposed as currentMeta() while it is matched. */
    meta?: Record<string, unknown>;
    /**
     * `@loader loadUser` — the loader's NAME, never the function.
     *
     * Everything here is serialisable build-time data, and a function declared in a page module
     * cannot be referenced from the route table. The name is what the table needs to know a route
     * HAS a loader; the function arrives from the page module's own registration.
     */
    loader?: string;
    /** `@loader user: loadUser { staleTime: 30_000 };` — how long its result is used again, in ms (#148). */
    loaderStaleTime?: number;
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
    /**
     * The page's `@title` when it is a string literal, and `titleKey` when it is `$t('key')` (#389):
     * what `__PDX_DEVTOOLS__.map()` names a route with no crumb by, without importing the page.
     */
    title?: string;
    titleKey?: string;
    /** `@page { prefetch: 'hover' | 'eager' | 'viewport' | 'never' }` — when to fetch the chunk. */
    prefetch?: string;
    /** `@page { transition: 'fade' }` — the enter/exit animation between this page and the previous one. */
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
    knowsTag?: (tag: string) => boolean, defaultLayout?: string, prefix: string = DEFAULT_TAG_PREFIX): void {
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
                    // directives is what several of this scanner's own tests write.
                    const script = descriptor.script;
                    const analysis = analyzeScript(script?.content ?? content, normalizePath(fullPath));
                    const route = analysis.route;
                    if (!route.page) continue;

                    const tag = analysis.customTag ?? deriveTag(normalizePath(fullPath), prefix);
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
                            loaderStaleTime: route.loaderStaleTime,
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
                            title: route.title,
                            titleKey: route.titleKey,
                            outlets: route.outlets,
                            // `@layout 'admin'` → ['pdx-admin-layout']. The same call the page's own
                            // registration makes, so the two modes resolve a name identically.
                            // The app's default when the page declares none, none for `@layout 'none'`
                            // — `routeLayout`, the same call the page's registration makes.
                            layouts: layoutChain(routeLayout(route.layout, defaultLayout), knowsTag, prefix).length > 0
                                ? layoutChain(routeLayout(route.layout, defaultLayout), knowsTag, prefix) : undefined,
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
 * The one file `@pdxui/router` routes every internal import of a router through — the dev/prod
 * seam. Anchored to the package directory so a file merely named `active.ts` in the app is not it,
 * and written for both layouts the package ships in: the monorepo sibling `packages/router/src` and
 * an install under `node_modules/@pdxui/router/src`. Backslashes are accepted because a Windows
 * id can still reach `load` unnormalised.
 */
export function isRouterSeam(id: string): boolean {
    // The query goes first, then the path is compared by its ending: no pattern retried from every
    // position (#70).
    const query = id.indexOf('?');
    const path = (query === -1 ? id : id.slice(0, query)).replace(/\\/g, '/');
    return ['packages', '@pdxui'].some((root) =>
        ['ts', 'tsx'].some((ext) => {
            const tail = `${root}/router/src/active.${ext}`;
            return path === tail || path.endsWith('/' + tail);
        }));
}

/** `html` with `tag` just inside its `<head>`, or before everything when it has none. */
export function injectAfterHeadOpen(html: string, tag: string): string {
    const head = findOpenTag(html, 'head');
    return head ? `${html.slice(0, head.end)}\n${tag}${html.slice(head.end)}` : tag + html;
}

/** A file path as a message shows it: from the package, or from its `src/`. */
export function shortPath(file: string): string {
    // After the LAST `/packages/`, then after the last `/src/` — what the greedy `.*` patterns took.
    const after = (path: string, segment: string): number => {
        let found = -1;
        for (let i = path.indexOf(segment.slice(1, -1)); i !== -1; i = path.indexOf(segment.slice(1, -1), i + 1)) {
            const before = path[i - 1];
            const next = path[i + segment.length - 2];
            if ((before === '/' || before === '\\') && (next === '/' || next === '\\')) found = i + segment.length - 1;
        }
        return found;
    };
    const p = after(file, '/packages/');
    const rest = p === -1 ? file : file.slice(p);
    const s = after(rest, '/src/');
    return s === -1 ? rest : 'src/' + rest.slice(s);
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
    return removeHtmlComments(template);
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
        const content = elementContent(originalSource, 'template');
        if (content === null) return compiledCode;
        templateContent = content;
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
    const scriptContent = elementContent(originalSource, 'script') ?? '';
    if (/\bwarnUnsaved\b/.test(scriptContent)) usedTags.add('pdx-overlay-outlet');

    if (usedTags.size === 0) return compiledCode;

    // PDX_UNRESOLVED_COMPONENT: a pdx-* or app-* tag the resolver does not know
    // almost always means a missing export in packages/ui/package.json, or a component
    // file that does not exist — otherwise a silent failure (the CE is never registered,
    // zero console errors). We exclude the current file's own tag (self-reference).
    const ownTag = deriveTag(currentFile, resolver.prefix);
    for (const tag of usedTags) {
        if (tag === ownTag) continue;
        // The library's prefix and the app's own (#136) are claims this warning can check: another
        // prefix may be an element the page gets elsewhere (a CDN script), which validate() reports
        // with its evidence.
        if (!tag.startsWith(RESERVED_TAG_PREFIX) && !tag.startsWith(`${resolver.prefix}-`)) continue;
        // `knownWithoutImport`, not `has`: a tag can be legitimate with nothing to import — the
        // design system styles pdx-split/center/container/cluster/stack/grid/spacer as element
        // selectors, @pdxui/router defines pdx-router-outlet, and pdx-toggle-group is a second
        // component() inside pdx-toggle.ts. With `has`, this warning fires for every one of them, and
        // a warning that is always wrong is the same as not having the diagnostic at all.
        if (!resolver.knownWithoutImport(tag)) {
            console.warn(`[pdx] PDX_UNRESOLVED_COMPONENT (${currentFile}): <${tag}> is unresolved — nothing in @pdxui/*, no design-system element style, and no project component. The custom element will not be registered.`);
        }
    }

    // Resolve imports for used tags, then for the icons the markup names (#47): one module each,
    // handed to pdx-icon's `defineIcons`.
    const imports = [
        ...resolver.resolveImports(Array.from(usedTags), compiledCode, currentFile),
        ...iconImportLines(outsideDefer, resolver, scriptContent),
    ];

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
