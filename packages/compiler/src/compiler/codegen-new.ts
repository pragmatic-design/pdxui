// New-mode compilation (@prop + $signal decorators/runes).
// Auto-return, auto-import, signal mutation rewriting. Plus @store mode.

import type { TemplateNode } from '../parser/template';
import type { SFCDescriptor } from '../parser/sfc';
import { generateInlineNodes, generateScriptSnippets } from './codegen-template-inline';
import type { analyzeScript } from './script-analyzer';
import type { PluginRunner } from '../plugin-system';
import { buildSetupBody, buildPropsObject, PROP_BUILDER } from './codegen-setup';
import { namesReadOffCtx } from './setup-return';
import { hostDescriptor } from './codegen-host';
import { liftStoreExports } from './store-exports';
import { dropScriptExports } from './script-exports';
import type { CompileContext } from './compile-context';
import { navigationIsRouter, templateReadsNavigation, setupReadsNavigation } from './navigation-import';
import { builtinAttachmentsToImport } from './attach-names';
import { foldConstantConditions } from './fold-constant-conditions';
import { literalConstNames } from './codegen-constant-bindings';
import { textNames } from './codegen-text-bindings';
import { mountValues } from './codegen-mount-values';
import { delegatedEventTypes } from './inline-event-delegation';
import { assembleModule, detectDeadSignals, extractTag, renderReturnIndex } from './codegen-shared';
import { jsQuote } from './js-literal';
import { coreRuleImports } from './form-rules';
import { variantsDescriptor } from './variants';
import { repeatedParts, withScriptSnippets } from './validate-parts';
import { readParts } from './part-reads';
import { coreImportSpecifiers } from './core-import-names';

/** Compile using decorator+rune syntax. Auto-return, auto-import, signal mutation rewriting. */
export function compileNewMode(
    descriptor: SFCDescriptor,
    ast: TemplateNode[],
    filename: string,
    analysis: ReturnType<typeof analyzeScript>,
    runner: PluginRunner | null | undefined,
    ctx: CompileContext,
    scriptOnly?: boolean,
): string {
    const production = ctx.production;
    const imports = new Set<string>(['html', 'defineComponent']);
    for (const f of analysis.usedFeatures) imports.add(f);
    for (const name of analysis.coreImportNames) imports.add(name);
    // A script-only module compiles $effect to `effect()`; a component, to `ctx.track()` (#1265).
    if (scriptOnly && analysis.effects.length > 0) imports.add('effect');
    // @fetch needs resource + getDefaultClient
    if (analysis.fetches.length > 0) {
        imports.add('resource');
        imports.add('getDefaultClient');
    }
    // @form needs createForm, and the core validators its inline schemas name — sub-fields' included.
    // A rule the script declares is the script's, and is not imported (#203).
    // A section's inherited form (#613) creates nothing: it reads the form above it.
    if (analysis.forms.some(f => f.kind !== 'inherited')) {
        imports.add('createForm');
        for (const name of coreRuleImports(analysis)) imports.add(name);
    }
    if (analysis.forms.some(f => f.kind === 'inherited')) imports.add('inheritedForm');
    // @title/@meta needs useHead import
    if (analysis.head.meta.length > 0 || (analysis.head.title && !analysis.head.title.isDynamic)) {
        imports.add('useHead');
    }
    if (analysis.head.title?.isDynamic) imports.add('useTitle');
    // Lifecycle hooks: onMount is used directly (not wrapped in ctx.track)
    if (analysis.lifecycle.onMount.length > 0) imports.add('onMount');
    // onDestroy too: core's hook, not an effect (#1407)
    if (analysis.lifecycle.onDestroy.length > 0 && !scriptOnly) imports.add('onDestroy');
    // keepAlive pages need onShow for resume lifecycle
    if (analysis.route.keepAlive) imports.add('onShow');
    // i18n: auto-import $t/$n/$d/$r when used, + initI18n/createI18nLoader when @i18n present
    if (analysis.usedFeatures.has('$t')) imports.add('$t');
    if (analysis.usedFeatures.has('$n')) imports.add('$n');
    if (analysis.usedFeatures.has('$d')) imports.add('$d');
    if (analysis.usedFeatures.has('$r')) imports.add('$r');
    if (analysis.i18n) {
        imports.add('initI18n');
        imports.add('createI18nLoader');
    }

    // @params needs inject + computed for route param coercion
    if (analysis.route.params && analysis.route.params.length > 0) {
        imports.add('inject');
        imports.add('computed');
    }
    // @search needs computed for reactive search params
    if (analysis.route.searchParams && analysis.route.searchParams.length > 0) {
        imports.add('computed');
    }

    // Merge plugin imports
    if (runner) for (const name of runner.extraImports) imports.add(name);

    // Tell template codegen which names are NOT signals (form objects, resources, functions)
    // Exclude: signals, derived (they ARE callable signals)
    const signalAndDerivedNames = new Set<string>();
    for (const s of analysis.signals) signalAndDerivedNames.add(s.name);
    for (const d of analysis.deriveds) signalAndDerivedNames.add(d.name);

    const nonSignals = new Set<string>();
    for (const f of analysis.forms) nonSignals.add(f.name);
    for (const e of analysis.exports) {
        if (signalAndDerivedNames.has(e.name)) continue; // signals/derived ARE callable
        if (e.kind === 'function' || e.kind === 'const' || e.kind === 'let') nonSignals.add(e.name);
    }
    ctx.nonSignalNames = nonSignals;
    ctx.stateSignalNames = new Set(analysis.signals.map((s) => s.name));

    // Every name the setup declares: prefixCtx needs them to tell a signal called
    // "error"/"item" apart from the fallback loop vars of the same name.
    const declared = new Set<string>(signalAndDerivedNames);
    for (const n of nonSignals) declared.add(n);
    for (const pr of analysis.props) declared.add(pr.name);
    ctx.declaredNames = declared;
    // What the script imports is in scope for the template as it is.
    ctx.importedNames = new Set(analysis.importedNames ?? []);
    // And so is the router's `navigation`, imported below, when the template reads it (#149).
    const navigationFromRouter = navigationIsRouter(analysis);
    const templateNavigation = navigationFromRouter
        && templateReadsNavigation(ast, descriptor.template?.content ?? '');
    if (templateNavigation) ctx.importedNames.add('navigation');
    // And so are core's built-in attachments the template names and the script does not (#143).
    for (const name of builtinAttachmentsToImport(descriptor.template?.content ?? '', (n) => declared.has(n) || ctx.importedNames!.has(n))) {
        imports.add(name);
        ctx.importedNames.add(name);
    }

    // One render path, in dev and in a build (#107): the inline path.
    // A literal `@if (true)` / `@show (false)` is folded away in a production build (#236).
    if (production) ast = foldConstantConditions(ast);
    // Each block's static markup builder and walk are module-level declarations (#109), kept on the
    // context: compileSFC writes them into the module after the script's types are erased.
    const templateHoists = { lines: ctx.moduleHoists, count: 0 };
    // A `const MAX = 10` the template reads is written once, with no effect (#110).
    ctx.literalConsts = literalConstNames(descriptor.script?.content ?? '');
    // An interpolation of a primitive prop or signal is text, and joins its block's group (#1275).
    ctx.textNames = textNames(analysis.props, analysis.signals);
    // What those read at mount with the props at their defaults, written into the markup (#1275).
    ctx.mountValues = mountValues(analysis.props, analysis.signals);
    // Bubbling events inside a @for are delegated to one listener per type (#113).
    ctx.delegatedEvents = delegatedEventTypes(ast);
    // A literal `data-part` naming a declared part is also that part's ref (#134), when the part's
    // name is a signal: its own, or a `$signal` the script declares. A name the script declares as
    // anything else keeps its meaning (#999), and the element is not handed to it.
    // A part's own signal exists for what reads the part's name (#1268): one nothing reads is no ref,
    // no signal and no binding, at every mount; it keeps its data-part, its descriptor entry and its
    // diagnostics. A `$signal` the script declares under a part's name is the script's, and stays.
    const partsRead = readParts(analysis.parts, descriptor.script?.content ?? '', ast, new Set(analysis.signals.map(s => s.name)),
        (analysis.host ?? []).map(h => h.value ?? h.name));
    const unreadParts = new Set(analysis.signals.filter(s => s.part && !partsRead.has(s.name)).map(s => s.name));
    if (unreadParts.size > 0) {
        analysis.signals = analysis.signals.filter(s => !unreadParts.has(s.name));
        analysis.exports = analysis.exports.filter(e => !(e.kind === 'signal' && unreadParts.has(e.name)));
    }
    ctx.parts = new Set(analysis.parts.filter(name => analysis.signals.some(s => s.name === name)));
    // One the template can render more than once is the array of its elements (#988): its signal,
    // declared by the part, starts empty. The setup is written below, after this.
    ctx.repeatedParts = repeatedParts(analysis.parts, withScriptSnippets(ast, analysis.snippets));
    for (const s of analysis.signals) if (s.part && ctx.repeatedParts.has(s.name)) s.initialExpr = '[]';
    // What a `@render` calls (#489): a typed snippet the script declares, or one of its template
    // `@snippet`s, which are compiled here as functions of the render, beside the hoisted slots.
    const typedSlots = analysis.slots.filter(s => s.signature !== undefined).map(s => s.name);
    ctx.slotNames = new Set(typedSlots);
    ctx.scriptSnippets = new Set(analysis.snippets.map(s => s.name));
    // Declared in the render, they are in scope for the template as they are: `{{ cell(user) }}`
    // calls one as the alpha's `ctx.cell(user)` did.
    for (const s of analysis.snippets) ctx.importedNames!.add(s.name);
    const snippetFunctions = generateScriptSnippets(analysis.snippets, imports, ctx, templateHoists);
    for (const [i, code] of snippetFunctions.entries()) ctx.hoistedSlots.push([analysis.snippets[i].name, code]);
    const renderCode = generateInlineNodes(ast, imports, ctx, templateHoists);
    ctx.literalConsts = new Set();
    ctx.textNames = new Set();
    ctx.mountValues = new Map();
    ctx.delegatedEvents = new Set();
    // The `html` import is dropped LATER, once the whole module is assembled — see below, not here.
    // The inline path emits no tagged template — a scoped slot's hoisted function included, since
    // #364 — but the setup may still call `html`, and without the import it would throw.
    ctx.nonSignalNames = null;
    ctx.stateSignalNames = null;
    ctx.declaredNames = null;
    ctx.importedNames = null;

    // The descriptor's `host` (#133), compiled before the elimination below: it reads signals too.
    const hostCode = analysis.host ? hostDescriptor(analysis.host, ctx, imports) : '';

    // Production: dead signal elimination — remove signals with zero references
    if (production) {
        // A signal only a script snippet reads is read by the render all the same, and one only `@host`
        // reads is read by the host's bindings (#1242): a build dropped it, and `ctx.open` was undefined.
        const deadSignals = detectDeadSignals(analysis, [renderCode, hostCode, ...snippetFunctions].join('\n'));
        if (deadSignals.size > 0) {
            analysis.signals = analysis.signals.filter(s => !deadSignals.has(s.name));
            analysis.exports = analysis.exports.filter(e =>
                !(deadSignals.has(e.name) && e.kind === 'signal'));
        }
    }

    // Post-render: detect i18n helpers used in template (not just script)
    if (renderCode.includes('$t(')) imports.add('$t');
    if (renderCode.includes('$n(')) imports.add('$n');
    if (renderCode.includes('$d(')) imports.add('$d');
    if (renderCode.includes('$r(')) imports.add('$r');

    const tag = analysis.customTag ?? extractTag(filename, ctx.tagPrefix);

    // A `@model` is a prop the component writes (#124): the descriptor declares it under `models`. An
    // `@variants` axis is declared under `variants`, which core makes a prop reflected on the host (#986).
    const propsCode = buildPropsObject(analysis.props.filter(p => !p.model && !p.variant));
    const variantsCode = analysis.variants && analysis.variants.length > 0 ? variantsDescriptor(analysis.variants) : '';
    const models = analysis.props.filter(p => p.model);
    const modelsCode = models.length > 0 ? buildPropsObject(models) : '';
    // A model `{ form }` (#135) names core's form wiring in its entry.
    if (models.some(p => p.form)) imports.add('wireFormModel');
    // Each prop and model is a descriptor (#300), built with core's `prop`.
    if (analysis.props.length > 0) imports.add(PROP_BUILDER);
    // An `export` inside setup() is a syntax error at load: reported as PDX_SCRIPT_EXPORT, emitted without it (#551).
    // A .pdx.ts module (scriptOnly) unwraps the setup into the module itself, where its exports belong.
    const body = scriptOnly ? analysis.body : dropScriptExports(analysis.body);
    // In a build the setup returns only what the code outside it reads off the context (#1289): the
    // render, the host's bindings and listeners, the hoisted slots and snippets. Core copies the return
    // onto the context at every mount, and pdx-wizard returned 30 names to a `<slot>` that reads none.
    const returnOnly = production && !scriptOnly
        ? namesReadOffCtx([renderCode, hostCode, ...ctx.hoistedSlots.map(([, code]) => code)].join('\n'))
        : undefined;
    let setupParts = buildSetupBody(body === analysis.body ? analysis : { ...analysis, body }, filename, descriptor, production, scriptOnly ? 'module' : 'component', ctx.warnings, returnOnly);

    // Post-setup: detect i18n helpers used in setup body (functions with _ prefix skip feature detection)
    if (setupParts.includes('$t(')) imports.add('$t');
    if (setupParts.includes('$n(')) imports.add('$n');
    if (setupParts.includes('$d(')) imports.add('$d');
    if (setupParts.includes('$r(')) imports.add('$r');

    // Append plugin-injected setup code
    if (runner) {
        for (const code of runner.extraSetupCode) setupParts += `\n    ${code}`;
    }

    // Merge plugin user imports into the user imports list
    const allUserImports = [...analysis.userImports];
    if (runner) allUserImports.push(...runner.extraUserImports);
    // @search: import currentSearch from `@pdxui/router`, the only address of the router that is
    // running. `packages/compiler/tests/p2-plus.test.ts` holds this.
    if (analysis.route.searchParams && analysis.route.searchParams.length > 0) {
        autoImportRouter(allUserImports, ['currentSearch']);
    }
    // A named @loader: the same, for the same reason. The page DECLARES the loader, the router runs it,
    // and `user` reads it through `loaderSource` (#506) — so the component that owns the declaration
    // could not reach its own data without writing the import by hand. That is the framework's first
    // rule broken: if the dev writes wiring, it is a bug of the framework.
    if (analysis.route.loaderName) {
        autoImportRouter(allUserImports, ['loaderSource']);
    }
    // @params: the outlet provides the params under the router's `RouteParams` token (#495).
    if (analysis.route.params && analysis.route.params.length > 0) {
        autoImportRouter(allUserImports, ['RouteParams']);
    }
    // navigation: no declaration implies it — reading it does (navigation-import.ts says why).
    if (templateNavigation || (navigationFromRouter && setupReadsNavigation(setupParts))) {
        autoImportRouter(allUserImports, ['navigation']);
    }

    let finalRenderCode = renderCode;

    // Hoisted slot functions: emit OUTSIDE html`` to avoid nested template literal issues
    if (ctx.hoistedSlots.length > 0) {
        const hoisted = ctx.hoistedSlots.map(([, code]) => `    ${code}`).join('\n');
        if (finalRenderCode.trimStart().startsWith('{')) {
            // Already a block — insert before the return
            const retIdx = renderReturnIndex(finalRenderCode);
            if (retIdx !== -1) {
                finalRenderCode = finalRenderCode.slice(0, retIdx) + hoisted + '\n    ' + finalRenderCode.slice(retIdx);
            }
        } else {
            // Expression form — wrap in block
            finalRenderCode = `{\n${hoisted}\n    return ${finalRenderCode};\n  }`;
        }
    }

    // Binding deduplication is the inline generator's own (`inline-dedup.ts`, #236).

    // Now that everything the module will contain is assembled — the render and the hoisted slots —
    // drop `html` if none of it uses one. Asked of the CODE rather than of the mode. The setup is
    // part of the module too: a script function or a @snippet that returns html`` relies on this
    // import, which a .pdx script never writes.
    if (!/\bhtml`/.test(finalRenderCode) && !/\bhtml\b/.test(setupParts)) imports.delete('html');

    return assembleModule(imports, allUserImports, descriptor, filename, tag, propsCode, setupParts, finalRenderCode, analysis.route, production, ctx.warnings, ctx.importPathOf ?? undefined, ctx.mapOrigins, ctx.sourceFile, templateHoists.lines.length > 0,
        analysis.events,
        analysis.states.map(s => s.name),
        hostCode,
        analysis.parts,
        modelsCode,
        ctx.tagPrefix,
        ctx.target,
        typedSlots,
        ctx.ssr,
        analysis.hydrate ?? '',
        variantsCode);
}

/** Compile a @store .pdx file into a global store module (no component). */
export function compileStoreMode(
    descriptor: SFCDescriptor,
    filename: string,
    analysis: ReturnType<typeof analyzeScript>,
    _runner?: PluginRunner | null,
): string {
    const store = analysis.globalStore!;
    const imports = new Set<string>();
    for (const f of analysis.usedFeatures) imports.add(f);
    for (const name of analysis.coreImportNames) imports.add(name);

    // Always need createGlobalStore
    imports.add('createGlobalStore');
    // Signal rewrite needs signal
    if (analysis.signals.length > 0) imports.add('signal');
    if (analysis.deriveds.length > 0) imports.add('computed');
    if (analysis.stores.length > 0) imports.add('store');
    if (analysis.effects.length > 0) imports.add('effect');
    if (analysis.watches.length > 0) imports.add('watch');

    // The module's exports leave the factory: inside a function an `export` is a syntax error, and
    // it would compile there silently. Blanked in place, so the body keeps its lines and their
    // origins; one that reads the store's own names is reported by the analyser.
    const lifted = liftStoreExports(analysis, filename);
    const storeAnalysis = lifted.statements.length === 0 ? analysis : {
        ...analysis,
        body: lifted.body,
        exports: analysis.exports.filter(e => !lifted.names.has(e.name)),
    };

    // Build the store factory body (same rewrite as component setup); its $effect, onMount and
    // onDestroy are the store's own (#1458), registered on the StoreLifecycle the factory is given.
    const factoryBody = buildSetupBody(storeAnalysis, filename, descriptor, false, 'store');
    const usesLifecycle = analysis.lifecycle.onMount.length > 0 || analysis.lifecycle.onDestroy.length > 0;

    // Build options
    const optParts: string[] = [];
    if (store.persist) optParts.push(`persist: ${jsQuote(store.persist)}`);
    const optsStr = optParts.length > 0 ? `, { ${optParts.join(', ')} }` : '';

    // Capitalize store name for useXxx hook
    const hookName = `use${store.name.charAt(0).toUpperCase()}${store.name.slice(1)}`;

    const coreImports = coreImportSpecifiers(imports, filename);
    let code = `import { ${coreImports} } from '@pdxui/core';\n`;
    if (analysis.userImports.length > 0) code += analysis.userImports.join('\n') + '\n';
    code += '\n';
    if (lifted.statements.length > 0) code += lifted.statements.join('\n') + '\n\n';
    code += `const __store_${store.name} = createGlobalStore(${jsQuote(store.name)}, (${usesLifecycle ? '__store' : ''}) => {\n`;
    code += factoryBody + '\n';
    code += `}${optsStr});\n`;
    code += '\n';
    code += `export function ${hookName}() { return __store_${store.name}; }\n`;

    return code;
}

/**
 * Import router signals a page's own declarations imply — unless the author already imported them.
 *
 * The guard is not defensive tidiness: two `import { loaderSource }` statements in one module
 * is a duplicate binding and a SyntaxError, and it would appear only for the author who reached for
 * the import before the compiler offered it — the one person who cannot be blamed for it.
 *
 * Always from `@pdxui/router`: the package is the address of the router that is RUNNING, and a
 * production build installs its route table through it (`packages/router/src/active.ts`).
 */
function autoImportRouter(userImports: string[], names: string[]): void {
    const missing = names.filter(name => !userImports.some(
        imp => new RegExp(`\\{[^}]*\\b${name}\\b[^}]*\\}`).test(imp)));
    if (missing.length === 0) return;
    userImports.push(`import { ${missing.join(', ')} } from '@pdxui/router';`);
}
