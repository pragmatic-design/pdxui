// New-mode compilation (@prop + $signal decorators/runes).
// Auto-return, auto-import, signal mutation rewriting. Plus @store mode.

import type { TemplateNode } from '../parser/template';
import type { SFCDescriptor } from '../parser/sfc';
import { generateNodes } from './codegen-template';
import { generateInlineNodes } from './codegen-template-inline';
import type { analyzeScript } from './script-analyzer';
import type { PluginRunner } from '../plugin-system';
import { buildSetupBody, buildPropsObject } from './codegen-setup';
import { liftStoreExports } from './store-exports';
import type { CompileContext } from './compile-context';
import { applyFormBindings, applyInjectedFormBindings } from './codegen-form-binding';
import { maskNonCode } from './tokenizer';

/** The script calls `useForm()` or `tryUseForm()`: the component is a section of a form above it. */
function declaresFormSection(script: string): boolean {
    // Match: a call of useForm or tryUseForm — not useFormCoordinator, not a method `x.useForm(`.
    return /(?<![\w$.])(?:useForm|tryUseForm)\s*\(/.test(maskNonCode(script));
}
import { assembleModule, detectDeadSignals, deduplicateBindings, extractTag, renderReturnIndex } from './codegen-shared';
import { jsQuote } from './js-literal';

/** Compile using decorator+rune syntax. Auto-return, auto-import, signal mutation rewriting. */
export function compileNewMode(
    descriptor: SFCDescriptor,
    ast: TemplateNode[],
    filename: string,
    analysis: ReturnType<typeof analyzeScript>,
    runner: PluginRunner | null | undefined,
    ctx: CompileContext,
    inlineBindings?: boolean,
    scriptOnly?: boolean,
): string {
    const production = ctx.production;
    const imports = new Set<string>(['html', 'component']);
    for (const f of analysis.usedFeatures) imports.add(f);
    for (const name of analysis.coreImportNames) imports.add(name);
    // @fetch needs resource + getDefaultClient
    if (analysis.fetches.length > 0) {
        imports.add('resource');
        imports.add('getDefaultClient');
    }
    // @form needs createForm + validators used in inline schemas
    if (analysis.forms.length > 0) {
        imports.add('createForm');
        // Auto-import validators referenced in inline schemas
        for (const f of analysis.forms) {
            if (f.kind === 'inline' && f.fields) {
                for (const fd of f.fields) {
                    if (fd.required) imports.add('required');
                    for (const rule of fd.rules) {
                        const fn = rule.includes(':') ? rule.slice(0, rule.indexOf(':')).trim() : rule;
                        imports.add(fn);
                    }
                }
            }
        }
    }
    // @title/@meta needs useHead import
    if (analysis.head.meta.length > 0 || (analysis.head.title && !analysis.head.title.isDynamic)) {
        imports.add('useHead');
    }
    // Lifecycle hooks: onMount is used directly (not wrapped in ctx.track)
    if (analysis.lifecycle.onMount.length > 0) imports.add('onMount');
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

    // Every name the setup declares: prefixCtx needs them to tell a signal called
    // "error"/"item" apart from the fallback loop vars of the same name.
    const declared = new Set<string>(signalAndDerivedNames);
    for (const n of nonSignals) declared.add(n);
    for (const pr of analysis.props) declared.add(pr.name);
    ctx.declaredNames = declared;
    // What the script imports is in scope for the template as it is.
    ctx.importedNames = new Set(analysis.importedNames ?? []);

    // Form-binding pass: auto-wire <pdx-input name="x"> inside <pdx-form :form="xxx">
    // Always run — works whether the form was created via @form rune or manually.
    // A file that calls useForm()/tryUseForm() is a SECTION of the form above it, and its whole
    // template is wired to that form. Read from the script with comments and strings
    // masked, so a mention is not a call.
    if (declaresFormSection(descriptor.script?.content ?? '')) {
        if (applyInjectedFormBindings(ast)) imports.add('tryUseForm');
    } else {
        applyFormBindings(ast);
    }

    let renderCode: string;
    if (production && inlineBindings) {
        renderCode = generateInlineNodes(ast, imports, ctx);
        // The `html` import is dropped LATER, once the whole module is assembled — see below, not
        // here. The inline path emits no tagged template in the render, but the module may still
        // hold one: a scoped slot is hoisted into its own function, generated by the template path,
        // and without the import the module calls `html` — `ReferenceError: html is not defined`.
    } else {
        renderCode = generateNodes(ast, imports, ctx);
    }
    ctx.nonSignalNames = null;
    ctx.declaredNames = null;
    ctx.importedNames = null;

    // Production: dead signal elimination — remove signals with zero references
    if (production) {
        const deadSignals = detectDeadSignals(analysis, renderCode);
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

    const tag = analysis.customTag ?? extractTag(filename);

    const propsCode = buildPropsObject(analysis.props);
    let setupParts = buildSetupBody(analysis, filename, descriptor, production, scriptOnly, ctx.warnings);

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
    // @search: import currentSearch from `@pdxui/router`, never from 'virtual:pdx-router'.
    //
    // The virtual module is what `@pdxui/router` RESOLVES TO in a production build, and it exposes
    // the same reactive signal — but importing the virtual module by name instantiates a SECOND
    // router beside the one the outlet is driving, with its own signals and its own popstate listener. The package is the only address of the router
    // that is running. `packages/compiler/tests/p2-plus.test.ts` holds this.
    if (analysis.route.searchParams && analysis.route.searchParams.length > 0) {
        autoImportRouter(allUserImports, ['currentSearch']);
    }
    // @loader: the same, for the same reason. The page DECLARES the loader, the router runs it, and
    // the data lands in currentLoaderData() — so the component that owns the declaration could not
    // reach its own data without writing the import by hand. That is the framework's first rule
    // broken: if the dev writes wiring, it is a bug of the framework.
    if (analysis.route.loader) {
        autoImportRouter(allUserImports, ['currentLoaderData', 'currentLoaderState']);
    }

    // $inline blocks: wrap render function to include render-time code
    let finalRenderCode = renderCode;
    if (analysis.inlineBlocks && analysis.inlineBlocks.length > 0) {
        const inlineCode = analysis.inlineBlocks.map(b => `    ${b}`).join('\n');
        finalRenderCode = `{\n${inlineCode}\n    return ${renderCode};\n  }`;
    }

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

    // Production: binding deduplication — shared computed for repeated reactive expressions.
    //
    // Not applicable to inline bindings, and that is a property of the TRANSFORM rather than a gap:
    // it works by finding repeated `${() => expr}` interpolations in a tagged template, and the
    // inline path writes `effect(() => { el.title = expr })` instead — there is no interpolation to
    // count. On `<p :title="name + '!'">{{ name + '!' }}</p><span :title="name + '!'">`, neither
    // path deduplicates (the template path's own transform does not fire there either), and the
    // inline path emits 1139 bytes of render against 164.
    //
    // ⚠️ The EQUIVALENT optimisation does exist and is not implemented: two effects reading the
    // same expression could share one computed, the way loop-invariant hoisting works on both
    // paths. What the measurement says about it: on the showcase's whole bundle the difference
    // between the two paths is +0.4 KB raw and 0 KB gzipped, so it is a subscription-count
    // argument, not a payload one.
    if (production && !inlineBindings) {
        const dedup = deduplicateBindings(finalRenderCode);
        if (dedup.computeds.length > 0) {
            finalRenderCode = dedup.code;
            const hoisted = dedup.computeds.join(' ');
            if (finalRenderCode.trimStart().startsWith('{')) {
                // Block form ($inline): insert before the return statement
                const retIdx = renderReturnIndex(finalRenderCode);
                if (retIdx !== -1) {
                    finalRenderCode = finalRenderCode.slice(0, retIdx) +
                        hoisted + '\n    ' + finalRenderCode.slice(retIdx);
                }
            } else {
                // Expression form: wrap in IIFE (same pattern as loop-invariant hoisting)
                finalRenderCode = `(() => { ${hoisted} return ${finalRenderCode}; })()`;
            }
            imports.add('computed');
        }
    }

    // Now that everything the module will contain is assembled — the render, the hoisted slots, the
    // deduplicated computeds — drop `html` if none of it uses one. Asked of the CODE rather than of
    // the mode, because "which render path ran" is the wrong question. The setup is
    // part of the module too: a script function or a @snippet that returns html`` relies on this
    // import, which a .pdx script never writes.
    if (production && inlineBindings && !/\bhtml`/.test(finalRenderCode) && !/\bhtml\b/.test(setupParts)) imports.delete('html');

    return assembleModule(imports, allUserImports, descriptor, filename, tag, propsCode, setupParts, finalRenderCode, analysis.route, production, inlineBindings, ctx.warnings, ctx.importPathOf ?? undefined, ctx.mapOrigins, ctx.sourceFile);
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

    // Build the store factory body (same rewrite as component setup)
    const factoryBody = buildSetupBody(storeAnalysis, filename, descriptor);

    // Build options
    const optParts: string[] = [];
    if (store.persist) optParts.push(`persist: ${jsQuote(store.persist)}`);
    const optsStr = optParts.length > 0 ? `, { ${optParts.join(', ')} }` : '';

    // Capitalize store name for useXxx hook
    const hookName = `use${store.name.charAt(0).toUpperCase()}${store.name.slice(1)}`;

    const coreImports = Array.from(imports).sort().join(', ');
    let code = `import { ${coreImports} } from '@pdxui/core';\n`;
    if (analysis.userImports.length > 0) code += analysis.userImports.join('\n') + '\n';
    code += '\n';
    if (lifted.statements.length > 0) code += lifted.statements.join('\n') + '\n\n';
    code += `const __store_${store.name} = createGlobalStore(${jsQuote(store.name)}, () => {\n`;
    code += factoryBody + '\n';
    code += `}${optsStr});\n`;
    code += '\n';
    code += `export function ${hookName}() { return __store_${store.name}; }\n`;

    return code;
}

/**
 * Import router signals a page's own declarations imply — unless the author already imported them.
 *
 * The guard is not defensive tidiness: two `import { currentLoaderData }` statements in one module
 * is a duplicate binding and a SyntaxError, and it would appear only for the author who reached for
 * the import before the compiler offered it — the one person who cannot be blamed for it.
 *
 * Always from `@pdxui/router`, never from `virtual:pdx-router`. The package is the address of
 * the router that is RUNNING — `packages/router/src/active.ts` is what a production build swaps
 * — while naming the virtual module instantiates a SECOND router beside the one the
 * outlet is driving, with its own signals and its own popstate listener.
 */
function autoImportRouter(userImports: string[], names: string[]): void {
    const missing = names.filter(name => !userImports.some(
        imp => new RegExp(`\\{[^}]*\\b${name}\\b[^}]*\\}`).test(imp)));
    if (missing.length === 0) return;
    userImports.push(`import { ${missing.join(', ')} } from '@pdxui/router';`);
}
