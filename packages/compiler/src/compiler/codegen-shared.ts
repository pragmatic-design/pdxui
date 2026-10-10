// Codegen shared helpers — used by both new-mode and legacy-mode compilation.
//   assembleModule        — final JS module assembly + route/layout/error registration
//   extractTag/deriveTag  — filename → CE tag
//   indent                — block indentation
//   detectDeadSignals     — production: dead signal elimination
//   deduplicateBindings   — production: shared computed for repeated bindings

import type { SFCDescriptor } from '../parser/sfc';
import { generateStyles } from './codegen-styles';
import { skipNonCode, maskNonCode } from './tokenizer';
import { extractBlock } from './script-analyzer-helpers';
import type { analyzeScript } from './script-analyzer';
import type { ValidationWarning } from './validate';
import { originMark, ORIGIN_PREFIX } from './sourcemap';
import { jsQuote, jsString } from './js-literal';
import { routeParams } from '../text-scan';

// ─── Template-literal escaping ─────────────────────────────────────

/**
 * Escape author-written literal HTML text so it can be safely embedded inside a
 * `html\`...\`` tagged template. Without this, an author's backtick breaks the
 * module (SyntaxError) and `${...}` would be EXECUTED as a real interpolation.
 * Order matters: backslash first, then backtick and ${.
 * Apply ONLY to literal author text — NEVER to generated code/placeholders/bindings.
 */
export function escapeForTemplateLiteral(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/**
 * Escape author text that is embedded in a template literal whose `${...}` interpolations must
 * KEEP WORKING — a reactive `@fetch` URL, where `${id}` is the whole feature.
 *
 * So this differs from {@link escapeForTemplateLiteral} in exactly one way: it does not touch
 * `${`. It still escapes the backslash and the backtick, and the backslash MUST go first or the
 * escapes it introduces would themselves be escaped.
 *
 * Applying the wrong one of the two makes a URL executable code — as does escaping the HTTP
 * method, which can never contain either character, while the URL goes in raw.
 */
export function escapeForReactiveTemplate(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

// ─── Tag derivation ────────────────────────────────────────────────

/** Extract component tag from filename: "counter.pdx" → "pdx-counter" */
export function extractTag(filename: string): string {
    return deriveTag(filename);
}

/**
 * Derive a CE tag name from a .pdx filename.
 * Simple and predictable: uses ONLY the filename, never path segments.
 * If two files collide (e.g. admin/button.pdx vs settings/button.pdx),
 * the dev resolves it with `@tag` — the compiler warns on collision.
 *
 * - `counter.pdx` → `pdx-counter`
 * - `pages/counter.pdx` → `pdx-counter`
 * - `_layout.pdx` → `pdx-layout` (strip leading _)
 * - `admin/_layout.pdx` → `pdx-admin-layout` (special files keep one parent for uniqueness)
 * - `App.pdx` → `pdx-app` (lowercased: an element name cannot hold an uppercase letter)
 */
export function deriveTag(filename: string): string {
    const normalized = filename.replace(/\\/g, '/');
    const parts = normalized.split('/');
    // Lowercased: a custom element name may not contain an uppercase letter, and `App.pdx` compiled
    // to `pdx-App` would make `customElements.define` throw. The one rule — the CLI, the LSP and the
    // plugin call this rather than keeping their own.
    const baseName = parts.pop()!.replace(/\.pdx$/, '').toLowerCase();

    // Special files (_layout, _error, _error-404): include immediate parent for uniqueness
    if (baseName.startsWith('_')) {
        const suffix = baseName.slice(1);
        const parent = parts.length > 0 ? parts[parts.length - 1].toLowerCase() : '';
        if (parent && parent !== 'src' && parent !== 'pages' && parent !== 'routes' && parent !== 'components') {
            return `pdx-${parent}-${suffix}`;
        }
        return `pdx-${suffix}`;
    }

    return baseName.startsWith('pdx-') ? baseName : `pdx-${baseName}`;
}

/**
 * `@layout 'admin'` → the custom element that wraps the page.
 *
 * The directive names a layout; the outlet builds its stack out of TAGS (`_diffLayouts`), and
 * `layouts` is the field it reads. Resolving here bridges the two, and it is done at build time so
 * the runtime keeps exactly one notion of a layout.
 *
 *     @layout 'admin'  →  pdx-admin-layout   (admin/_layout.pdx), preferred
 *                      →  pdx-admin         (admin.pdx), when the first is not a known tag
 *
 * The first is what `deriveTag` gives a layout file, so the directory convention works with no
 * further ceremony. The second is what lets a shell be an ordinary component with a slot, which is
 * how an app shell is usually written.
 *
 * `knows` is the resolver's tag map, absent when `compile()` is called without one — then the
 * layout-file form is taken, because a compilation that cannot look does not get to guess.
 *
 * One layout, not a chain: nothing declares a layout's own parent, and a shell around a shell is
 * what nested routes already compose (`hasOutlet`). `layouts` stays an array because
 * that is what the outlet diffs, and a hand-written route table may still pass several.
 */
export function layoutChain(name: string | undefined, knows?: (tag: string) => boolean): string[] {
    if (!name) return [];
    const slug = name.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    if (!slug) return [];
    const fromLayoutFile = `pdx-${slug}-layout`;
    if (knows && !knows(fromLayoutFile) && knows(`pdx-${slug}`)) return [`pdx-${slug}`];
    return [fromLayoutFile];
}

/**
 * The layout a route renders in: its own `@layout`, none for `@layout 'none'`, and the app's
 * default when it declares nothing.
 *
 * Without a default, moving a shell into a layout would mean writing `@layout 'shell'` on every page,
 * which is the boilerplate rule 1 of this repository calls a framework bug. One helper, called by
 * the page's registration AND the route-table scan, so the two cannot disagree.
 */
export function routeLayout(declared: string | undefined, fallback: string | undefined): string | undefined {
    if (declared !== undefined) return declared.trim() === 'none' ? undefined : declared;
    return fallback;
}

/**
 * The `file` line of `component()`'s options — the .pdx a runtime error names — or
 * nothing. The caller passes a file in development builds only.
 */
export function sourceFileOption(sourceFile: string | null | undefined): string {
    return sourceFile ? `  file: ${jsString(sourceFile)},\n` : '';
}

// ─── Route loaders ─────────────────────────────────────────────────

/**
 * Take the function `@loader` names OUT of the setup body, so the route registration below the
 * component can pass the function itself instead of its name.
 *
 * A loader runs BEFORE the component exists — that is the whole point of it — so it cannot read
 * props or signals, and living at module level costs it nothing. It stays visible to the setup
 * body, which closes over the module scope, so a template that also calls it keeps working.
 *
 * Returns the body with the declaration removed and the declaration itself, or `null` when the
 * name matches nothing: registering `loader: undefined` would leave the page rendering with no
 * data and no error, which is the failure this exists to prevent.
 */
export function hoistLoader(setupBody: string, name: string):
    { body: string; declaration: string } | null {
    const lines = setupBody.split('\n');
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // A line may open with its origin mark: the declaration moves with it.
    const fnDecl = new RegExp(`^\\s*(?:\\/\\*@pdx-at:\\d+\\*\\/)?(?:async\\s+)?function\\s+${esc}\\s*\\(`);
    const varDecl = new RegExp(`^\\s*(?:\\/\\*@pdx-at:\\d+\\*\\/)?(?:const|let|var)\\s+${esc}\\s*=`);

    for (let i = 0; i < lines.length; i++) {
        const isFn = fnDecl.test(lines[i]);
        const isVar = varDecl.test(lines[i]);
        if (!isFn && !isVar) continue;

        // A block-bodied declaration ends at its matching brace; a one-line arrow ends at its own
        // line. `extractBlock` is brace-depth aware and skips strings and comments.
        const hasBrace = lines[i].includes('{');
        const end = hasBrace ? extractBlock(lines, i).endLine : i;
        const declaration = lines.slice(i, end + 1).join('\n');
        const body = [...lines.slice(0, i), ...lines.slice(end + 1)].join('\n');
        return { body, declaration };
    }
    return null;
}

// ─── Module assembly ───────────────────────────────────────────────

/** Assemble the final JS module string. */
export function assembleModule(
    imports: Set<string>,
    userImports: string[],
    descriptor: SFCDescriptor,
    filename: string,
    tag: string,
    propsCode: string,
    setupBody: string,   // reassigned when a @loader declaration is lifted out of it
    renderCode: string,
    route?: {
        page?: string; guard?: string; scroll?: string; keepAlive?: boolean | number;
        preload?: boolean; prefetch?: string; transition?: string; layout?: string; layouts?: string[];
        label?: string;
        labelFn?: string;
        labelKey?: string;
        loader?: string;
        redirectTo?: string; redirects?: { from: string; to: string }[];
        meta?: Record<string, unknown>; aliases?: string[];
        outlets?: { name: string; tag: string }[];
        params?: { name: string; type: string }[];
    },
    production?: boolean,
    inlineBindings?: boolean,
    /** Codegen diagnostics sink — PDX_LOADER_NOT_FOUND is raised here. */
    warnings?: { push(w: ValidationWarning): void },
    /** Where a tag's module lives — used to resolve `@layout` and to import what it resolves to. */
    importPathOf?: (tag: string) => string | null,
    /** The caller turns origin marks into a source map: mark the frame's lines too. */
    mapOrigins?: boolean,
    /** The .pdx relative to the app root, registered with the component — dev builds. */
    sourceFile?: string | null,
): string {
    // Production: static template pre-compilation — use __staticHTML instead of html``
    // Skip for inline bindings (they generate imperative code, not html``)
    const isStaticAssembly = production && !inlineBindings && !renderCode.includes('${');
    if (isStaticAssembly) {
        imports.delete('html');
        imports.add('__staticHTML');
    }

    // The setup body of a `<template shadow>` component adopts its CSS into the root, and the helper
    // that does it has to be imported or the module throws on its first mount. Read from
    // the emitted body rather than passed down: the decision is made in buildSetupBody, and a second
    // flag threaded through here is a second thing to keep in step.
    if (setupBody.includes('__adoptStyles(')) imports.add('__adoptStyles');

    // @loader: lift the named function to module scope so the route below can reference it.
    // Done before the setup body is written out, and `loaderRef` records whether it worked —
    // the route only carries a loader it can actually call.
    let loaderRef: string | null = null;
    let hoistedLoader = '';
    if (route?.loader) {
        const hoisted = hoistLoader(setupBody, route.loader);
        if (hoisted) {
            setupBody = hoisted.body;
            hoistedLoader = hoisted.declaration + '\n\n';
            loaderRef = route.loader;
        } else {
            const message = `PDX_LOADER_NOT_FOUND (${filename}): @loader names "${route.loader}", `
                + 'but no function with that name is declared in the script.';
            console.warn(`[pdx] ${message}`);
            warnings?.push({
                code: 'PDX_LOADER_NOT_FOUND',
                severity: 'warn',
                message,
                hint: `Declare it in <script>: async function ${route.loader}() { … }. `
                    + 'The route is registered without a loader, so the page renders with no data.',
            });
        }
    }

    // @page { label: fn }: the same lift, for the same reason. A breadcrumb builds
    // from the route table, outside any component, so a label that names a function has to find it
    // at module scope. `labelRef` records whether it worked — a route carries a label it can
    // actually call, or none.
    let labelRef: string | null = null;
    if (route?.labelFn) {
        const hoisted = hoistLoader(setupBody, route.labelFn);
        if (hoisted) {
            setupBody = hoisted.body;
            hoistedLoader += hoisted.declaration + '\n\n';
            labelRef = route.labelFn;
        } else {
            const message = `PDX_LABEL_NOT_FOUND (${filename}): @page's label names "${route.labelFn}", `
                + 'but no function with that name is declared in the script.';
            console.warn(`[pdx] ${message}`);
            warnings?.push({
                code: 'PDX_LABEL_NOT_FOUND',
                severity: 'warn',
                message,
                hint: `Declare it in <script>: function ${route.labelFn}(params) { … }, `
                    + 'or write the crumb as a string. The route is registered without a label, '
                    + 'so it contributes no crumb.',
            });
        }
    }

    // The layout's module, imported like any component the template uses: without it the tag
    // resolves to nothing, `document.createElement` returns an unupgraded element, and the page
    // renders inside an empty box with nothing reporting it.
    const layoutTags = layoutChain(route?.layout, importPathOf ? (t) => importPathOf(t) !== null : undefined);
    const layoutImports = importPathOf
        ? layoutTags.map((t) => importPathOf(t)).filter((path): path is string => path !== null)
        : [];

    const coreImports = Array.from(imports).sort().join(', ');
    let code = `import { ${coreImports} } from '@pdxui/core';\n`;
    if (userImports.length > 0) code += userImports.join('\n') + '\n';
    for (const path of layoutImports) code += `import ${jsQuote(path)};\n`;
    code += '\n';
    code += generateStyles(descriptor, filename, production);
    code += hoistedLoader;
    code += `component(${jsQuote(tag)}, {\n`;
    code += `  props: ${propsCode},\n`;
    code += sourceFileOption(sourceFile);
    // Shadow DOM opt-in via <template shadow>
    if (descriptor.template && 'shadow' in descriptor.template && descriptor.template.shadow) {
        code += `  shadow: true,\n`;
    }
    // The frame's own lines point at their blocks, when the caller builds a source map:
    // the setup function at the script, the render at the template.
    const frameMark = (block?: { start: number } | null) => (mapOrigins && block ? originMark(block.start) : '');
    code += `  ${frameMark(descriptor.script)}setup(ctx) {\n`;
    code += setupBody + '\n';
    code += `  },\n`;
    if (isStaticAssembly) {
        code += `  static: true,\n`;
        const staticContent = renderCode.slice(5, -1); // strip html` and `
        code += `  ${frameMark(descriptor.template)}render: () => __staticHTML(\`${staticContent}\`),\n`;
    } else {
        code += `  ${frameMark(descriptor.template)}render: (ctx) => ${renderCode},\n`;
    }
    code += `});\n`;

    // Auto-register route from @page declaration — zero manual createRouter() needed
    if (route?.page) {
        const routeParts: string[] = [`path:${jsString(route.page)}`, `tag:${jsString(tag)}`];
        if (route.guard) routeParts.push(`guard:${jsString(route.guard)}`);
        if (route.scroll) routeParts.push(`scroll:${jsString(route.scroll)}`);
        if (route.keepAlive !== undefined) routeParts.push(`keepAlive:${route.keepAlive}`);
        if (route.preload) routeParts.push(`preload:true`);
        // The REFERENCE, not the name: the router calls this. The string would make
        // `config.loader()` a call on a string and the whole feature unreachable.
        if (loaderRef) routeParts.push(`loader:${loaderRef}`);
        if (route.prefetch) routeParts.push(`prefetch:${jsString(route.prefetch)}`);
        if (route.transition) routeParts.push(`transition:${jsString(route.transition)}`);
        // The RESOLVED chain, not the name: the outlet diffs the chain, and nothing reads the
        // unresolved name.
        const chain = route.layouts && route.layouts.length > 0 ? route.layouts : layoutTags;
        if (chain.length > 0) {
            routeParts.push(`layouts:[${chain.map(l => jsString(l)).join(',')}]`);
        }
        // Nested routes: this page is a PARENT only if it renders a child outlet.
        //
        // The rule is the outlet, not the path. Inferring the parent from a shared prefix is wrong:
        // `/owners` is a prefix of `/owners/new` and they are siblings, so the list would render in
        // place of the form. `/docs` and `/docs/:slug`, `/components` and
        // `/components/:tag` — the prefix relationship is everywhere and it means nothing on its own.
        //
        // Read from the template the author wrote, which is exactly what the feature says out loud:
        // put a <pdx-router-outlet> in the parent's template and its children render there.
        //
        // Matched as an ELEMENT, not as a substring. `includes('pdx-router-outlet')` would mark the
        // showcase page FOR the overlay outlet as a parent, because it prints
        // `&lt;pdx-router-outlet&gt;` inside a source block — text about the element, not the
        // element. The tag must be followed by `>`, `/` or whitespace, and `<` must be the real
        // one rather than an entity.
        if (/<pdx-router-outlet[\s/>]/.test(descriptor.template?.content ?? '')) routeParts.push('hasOutlet:true');
        // The breadcrumb's crumb. It has to be HERE as well as in the scanned table:
        // a page module re-registers its own route when it is imported, replacing the scanned
        // entry for that path — so a field emitted only by the scan is a field that disappears the
        // moment the page loads, leaving the trail empty while the manifest contains the labels.
        // The REFERENCE for a function label, the string for a written one — never the function's
        // NAME as a string, which no runtime can call.
        if (labelRef) routeParts.push(`label:${labelRef}`);
        else if (route.label) routeParts.push(`label:${jsString(route.label)}`);
        // A dictionary key: data, like the scanned table's, so the two agree.
        if (route.labelKey) routeParts.push(`labelKey:${jsString(route.labelKey)}`);
        if (route.redirectTo) routeParts.push(`redirect:${jsString(route.redirectTo)}`);
        if (route.meta) routeParts.push(`meta:${jsString(route.meta)}`);
        if (route.outlets && route.outlets.length > 0) {
            routeParts.push(`outlets:[${route.outlets.map((o: { name: string; tag: string }) => `{name:${jsString(o.name)},tag:${jsString(o.tag)}}`).join(',')}]`);
        }
        // Param constraints extracted from path: :id(number) → { id: 'number' }
        const constraintParts: string[] = [];
        for (const param of routeParams(route.page!)) {
            if (param.constraint) constraintParts.push(`${param.name}:${jsString(param.constraint)}`);
        }
        if (constraintParts.length > 0) routeParts.push(`paramConstraints:{${constraintParts.join(',')}}`);
        // @params { id: number } — typed route params for coercion
        if (route.params && route.params.length > 0) {
            const typeParts = route.params.map((p: { name: string; type: string }) => `${p.name}:${jsString(p.type)}`);
            routeParts.push(`paramTypes:{${typeParts.join(',')}}`);
        }
        // Lazy loading: include file path for dynamic import()
        if (!route.preload) {
            routeParts.push(`lazy:true`);
            // Use import.meta.url relative path for Vite import()
            const basename = filename.replace(/\\/g, '/').split('/').pop() ?? filename;
            routeParts.push(`file:'./${basename}'`);
        }
        code += `\n// Auto-route: @page ${jsQuote(route.page)}\n`;
        code += `if(!globalThis.__pdx_routes)globalThis.__pdx_routes=[];\n`;
        // HMR-safe push: replace any existing route for the same path instead of
        // appending a duplicate on module re-execution.
        // The announcement at the end is what lets a route field that only this module can carry
        // reach a router that was built before the import — today a `label` function. Both
        // routers install the hook; a host that installs neither is unaffected.
        code += `const __pdx_pushRoute=(r)=>{const i=globalThis.__pdx_routes.findIndex(x=>x.path===r.path);if(i>=0)globalThis.__pdx_routes[i]=r;else globalThis.__pdx_routes.push(r);globalThis.__pdx_routeRegistered&&globalThis.__pdx_routeRegistered(r.path);};\n`;
        code += `__pdx_pushRoute({${routeParts.join(',')}});\n`;

        // Aliases: register same component under additional paths
        if (route.aliases) {
            for (const alias of route.aliases) {
                code += `__pdx_pushRoute({path:${jsString(alias)},tag:${jsString(tag)}${route.guard ? `,guard:${jsString(route.guard)}` : ''}});\n`;
            }
        }

        // Redirects: register in __pdx_redirects table
        if (route.redirects) {
            code += `if(!globalThis.__pdx_redirects)globalThis.__pdx_redirects=[];\n`;
            for (const r of route.redirects) {
                code += `globalThis.__pdx_redirects.push({from:${jsString(r.from)},to:${jsString(r.to)}});\n`;
            }
        }
    }

    // No layout self-registration: the resolution happens at build time, where the name is turned
    // into the tag (`layoutChain` above). A layout file is an ordinary component: its module
    // defines its element, and the page that declares it imports it.
    const normalizedFn = filename.replace(/\\/g, '/');
    const baseFn = normalizedFn.split('/').pop()?.replace(/\.pdx$/, '') ?? '';

    // Error page self-registration: _404.pdx, _error-{code}.pdx
    const errorCodeMatch = baseFn.match(/^_(?:error-)?(\d+)$/) || (baseFn === '_404' ? ['', '404'] : null);
    if (errorCodeMatch) {
        const errorCode = errorCodeMatch[1] || '404';
        code += `\n// Auto-error: ${errorCode}\n`;
        code += `if(!globalThis.__pdx_error_pages)globalThis.__pdx_error_pages={};\n`;
        code += `if(!globalThis.__pdx_error_pages[${jsQuote(errorCode)}])globalThis.__pdx_error_pages[${jsQuote(errorCode)}]=${jsQuote(tag)};\n`;
    }

    return code;
}

/** Indent all lines of a code block by the given number of spaces. */
export function indent(code: string, spaces: number): string {
    const pad = ' '.repeat(spaces);
    return code.split('\n').join('\n' + pad);
}

// ─── Production Optimizations ─────────────────────────────────────

/**
 * Detect signals declared but never referenced anywhere (template, body, effects, deriveds, etc).
 * Conservative: only flags signals with ZERO references — no false positives.
 */
export function detectDeadSignals(
    analysis: ReturnType<typeof analyzeScript>,
    renderCode: string,
): Set<string> {
    const dead = new Set<string>();

    for (const sig of analysis.signals) {
        const name = sig.name;
        const re = new RegExp(`\\b${name}\\b`);

        if (re.test(renderCode)) continue;           // template
        if (re.test(analysis.body)) continue;         // script body (functions, statements)
        if (analysis.deriveds.some(d => re.test(d.expr))) continue;
        if (analysis.effects.some(e => re.test(e))) continue;
        if (analysis.watches.some(w => re.test(w.source) || re.test(w.callback))) continue;
        if (analysis.lifecycle.onMount.some(m => re.test(m))) continue;
        if (analysis.lifecycle.onDestroy.some(d => re.test(d))) continue;
        if (analysis.signals.some(s => s !== sig && re.test(s.initialExpr))) continue;
        if (analysis.stores.some(s => re.test(s.initialExpr))) continue;
        if (analysis.inlineBlocks?.some(b => re.test(b))) continue;

        dead.add(name);
    }

    return dead;
}

/**
 * Deduplicate identical reactive binding expressions in template output.
 * Extracts duplicated ${() => expr} patterns into shared computed() signals.
 * Uses brace-balanced extraction for correct handling of nested expressions.
 */
/**
 * Index of the `return ` that BEGINS the render statement, in a block-form render body.
 *
 * The body is `{ …statements…; return html`…` }`, so every character the page displays sits inside
 * that template literal — after the only real return. A plain `lastIndexOf('return ')` therefore
 * finds a documented snippet's `return ` whenever a page shows one, and anything inserted at that
 * index lands inside the page instead of before it. Masking strings, templates and comments first
 * leaves only the return that is a statement.
 *
 * Returns -1 when the body has no return statement.
 */
export function renderReturnIndex(blockCode: string): number {
    return maskNonCode(blockCode).lastIndexOf('return ');
}

export function deduplicateBindings(renderCode: string): { code: string; computeds: string[] } {
    // A binding carries its origin mark just inside its `${` when the compile builds a source map.
    // Two copies of one expression are still one expression: they are compared without
    // their marks, and each keeps its own mark when it is replaced.
    if (renderCode.includes(ORIGIN_PREFIX)) return deduplicateMarkedBindings(renderCode);
    const marker = '${() => ';
    const exprCounts = new Map<string, number>();

    // Every `${…}` interpolation span. A binding inside another interpolation sits in a
    // control-flow branch (`${when(…)}`, `${each(…)}`, `${errorBoundary(…)}`…) that may guard it:
    // hoisting it to the top of render would evaluate it while the branch is closed —
    // `@if (x()) { … x().a … }` would throw on `null.a` in production only. Only bindings at
    // the top level of the render template are counted; a guarded copy never makes one hoistable.
    const spans: [number, number][] = [];
    for (let p = renderCode.indexOf('${'); p !== -1; p = renderCode.indexOf('${', p + 2)) {
        if (renderCode[p - 1] === '\\') continue; // an escaped `\${` is template text, not an interpolation
        spans.push([p, interpolationEnd(renderCode, p)]);
    }
    const isNested = (pos: number): boolean => spans.some(([s, e]) => s < pos && pos < e);

    // Collect the top-level ${() => expr} interpolations
    let i = 0;
    while (true) {
        const start = renderCode.indexOf(marker, i);
        if (start === -1) break;
        const j = interpolationEnd(renderCode, start);
        if (!isNested(start)) {
            const fullExpr = renderCode.slice(start, j + 1); // "${() => ...}"
            exprCounts.set(fullExpr, (exprCounts.get(fullExpr) || 0) + 1);
        }
        i = j + 1;
    }

    const computeds: string[] = [];
    let code = renderCode;
    let idx = 0;

    for (const [interpolation, count] of exprCounts) {
        if (count < 2) continue;
        const arrowExpr = interpolation.slice(2, -1); // "() => ctx.xxx()"
        // Hoisting moves this into a top-level computed(), OUTSIDE any each() scope.
        // If the expression references a loop-local (a bare identifier that is not a
        // ctx.* access, global, or literal), hoisting would cause a ReferenceError.
        // Only dedup expressions whose free identifiers are all ctx.* / globals.
        if (referencesLocalScope(arrowExpr)) continue;
        const varName = `__bd_${idx++}`;
        computeds.push(`const ${varName} = computed(${arrowExpr});`);
        code = code.split(interpolation).join(`\${${varName}}`);
    }

    return { code, computeds };
}

/**
 * `deduplicateBindings` for a render that carries origin marks: the same rules — copies counted at
 * the top level only, every copy replaced — with each `${() => …}` compared without its mark and
 * replaced by `${<its mark>__bd_N}`.
 */
function deduplicateMarkedBindings(renderCode: string): { code: string; computeds: string[] } {
    const spans: [number, number][] = [];
    for (let p = renderCode.indexOf('${'); p !== -1; p = renderCode.indexOf('${', p + 2)) {
        if (renderCode[p - 1] === '\\') continue;
        spans.push([p, interpolationEnd(renderCode, p)]);
    }
    const isNested = (pos: number): boolean => spans.some(([s, e]) => s < pos && pos < e);

    // Every `${<mark?>() => …}`, nested ones included: [start, end, mark, the binding without its mark].
    const found: { start: number; end: number; mark: string; key: string; top: boolean }[] = [];
    // Match: an interpolation that opens an arrow, with an origin mark or not. Groups: [1]=the mark
    const opener = /\$\{(\/\*@pdx-at:\d+\*\/)?\(\) => /g;
    for (const m of renderCode.matchAll(opener)) {
        const start = m.index ?? 0;
        if (renderCode[start - 1] === '\\') continue;
        const end = interpolationEnd(renderCode, start);
        const mark = m[1] ?? '';
        const key = '${' + renderCode.slice(start + 2 + mark.length, end + 1);
        found.push({ start, end, mark, key, top: !isNested(start) });
    }

    const counts = new Map<string, number>();
    for (const f of found) if (f.top) counts.set(f.key, (counts.get(f.key) ?? 0) + 1);
    const names = new Map<string, string>();
    const computeds: string[] = [];
    for (const [key, count] of counts) {
        if (count < 2) continue;
        const arrowExpr = key.slice(2, -1);
        if (referencesLocalScope(arrowExpr)) continue;
        const varName = `__bd_${names.size}`;
        names.set(key, varName);
        computeds.push(`const ${varName} = computed(${arrowExpr});`);
    }

    // A copy inside another copy that is replaced goes with it: replacing it first would move the
    // outer one's end. The rest are replaced from the end, so earlier positions stay where they are.
    const replaced = found.filter((f) => names.has(f.key));
    const outermost = replaced.filter((f) => !replaced.some((o) => o !== f && o.start < f.start && f.end <= o.end));
    let code = renderCode;
    for (const f of outermost.sort((a, b) => b.start - a.start)) {
        code = code.slice(0, f.start) + '${' + f.mark + names.get(f.key) + '}' + code.slice(f.end + 1);
    }
    return { code, computeds };
}

/**
 * Index of the `}` that closes the interpolation opened by the `${` at `start`.
 * String/template/comment-aware brace counting — a `{` inside a string (e.g. "{") or a nested
 * template literal must not unbalance the scan. Returns `code.length` when unbalanced.
 */
function interpolationEnd(code: string, start: number): number {
    let depth = 1;
    let j = start + 2; // past ${
    while (j < code.length && depth > 0) {
        const skip = skipNonCode(code, j);
        if (skip !== null && skip > j) { j = skip; continue; }
        if (code[j] === '{') depth++;
        else if (code[j] === '}') depth--;
        if (depth > 0) j++;
    }
    return j;
}

/**
 * Detect whether an arrow expression references a local (loop/scope) identifier
 * that would be unbound if hoisted to module/top-of-render scope. Returns true
 * if any bare identifier (not preceded by `.`, not a global/keyword) appears that
 * is NOT a ctx.* member access.
 */
function referencesLocalScope(arrowExpr: string): boolean {
    // Strip strings/templates/comments so identifiers inside them don't count.
    let masked = '';
    let k = 0;
    while (k < arrowExpr.length) {
        const skip = skipNonCode(arrowExpr, k);
        if (skip !== null && skip > k) {
            for (let q = k; q < skip; q++) masked += ' ';
            k = skip;
        } else { masked += arrowExpr[k]; k++; }
    }
    const idRe = /(?<![.\w$])([A-Za-z_$][\w$]*)\b/g;
    let m: RegExpExecArray | null;
    while ((m = idRe.exec(masked)) !== null) {
        const name = m[1];
        if (DEDUP_SAFE_IDENTS.has(name)) continue;
        // `ctx.x` — the `ctx` token is safe; the `x` after `.` is excluded by lookbehind.
        if (name === 'ctx') continue;
        // Any other bare identifier is a potential loop/scope local → don't hoist.
        return true;
    }
    return false;
}

/** Identifiers always safe to appear in a hoisted computed (globals, keywords, arrow). */
const DEDUP_SAFE_IDENTS = new Set([
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
    'typeof', 'instanceof', 'in', 'void', 'new', 'return',
    'Math', 'Date', 'JSON', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Intl',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite',
]);
