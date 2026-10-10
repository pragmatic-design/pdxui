// Setup Body Generator — builds the setup() function body for new-mode SFC compilation.
// Extracted from codegen.ts for single-responsibility: this module handles
// prop accessors, signal/store/fetch/form declarations, derived, effects, lifecycle,
// head management, CSS scoping, and auto-return.

import type { SFCDescriptor } from '../parser/sfc';
import type { ScriptAnalysis } from './script-analyzer';
import { extractCSSBindings, hash, styleBlocks, generateShadowStyles } from './codegen-styles';
import { escapeForReactiveTemplate } from './codegen-shared';
import { generateSignalDeclarations, generateDerivedDeclarations, generateAutoReturn, rewritePropPeeks } from './signal-rewrite';
import { rewriteAst, parsesCleanly, type WarningSink } from './signal-rewrite-ast';
import { emitWatchSource } from './watch-source';
import { lateSignals, lateSignalOffsets, insertLateSignalMarkers, replaceLateSignalMarkers } from './setup-signal-placement';
import { originMark } from './sourcemap';
import { maskNonCode } from './tokenizer';
import { jsQuote, jsString } from './js-literal';

// ─── Public API ────────────────────────────────────────────────────

/** Build the props: { ... } object string from PropInfo array. */
export function buildPropsObject(props: { name: string; runtimeType: string; default?: string }[]): string {
    if (props.length === 0) return '{}';
    const entries = props.map(p => {
        const parts = [`type: ${p.runtimeType}`];
        if (p.default !== undefined) parts.push(`default: ${p.default}`);
        return `    ${p.name}: { ${parts.join(', ')} }`;
    });
    return `{\n${entries.join(',\n')}\n  }`;
}

/**
 * Build all parts of the setup() function body for new mode.
 * @param scriptOnly - When true, emit standalone effect()/cleanup instead of ctx.track()
 */
export function buildSetupBody(
    analysis: ScriptAnalysis,
    filename: string,
    descriptor?: SFCDescriptor,
    production = false,
    scriptOnly = false,
    /** Codegen diagnostics sink — CompileContext.warnings. Omitted by direct callers in tests. */
    sink?: WarningSink,
): string {
    const propNames = new Set(analysis.props.map(p => p.name));
    const parts: string[] = [];

    // i18n initialization (before props — runs once in app root)
    if (analysis.i18n) {
        const cfg = analysis.i18n;
        const localesStr = cfg.locales.map(l => jsString(l)).join(', ');
        const opts: string[] = [`locales: [${localesStr}]`, `default: ${jsString(cfg.default)}`];
        if (cfg.detect !== undefined) opts.push(`detect: ${cfg.detect}`);
        if (cfg.persist !== undefined) {
            opts.push(`persist: ${typeof cfg.persist === 'string' ? jsString(cfg.persist) : cfg.persist}`);
        }
        parts.push(`    initI18n({ ${opts.join(', ')} });`);
        parts.push(`    const __i18nLoader = createI18nLoader({ mode: 'static', basePath: ${jsQuote(cfg.translationsPath)} });`);
    }

    // Prop accessors — only generate if prop is actually referenced in body/lifecycle/effects/watches.
    // The watches count too: a prop read only in a `$watch` is rewritten to a call of the
    // accessor, and without the accessor declared, setup throws.
    const bodyText = analysis.body + analysis.effects.join(' ') +
        analysis.lifecycle.onMount.join(' ') + analysis.lifecycle.onDestroy.join(' ') +
        analysis.watches.map(w => `${w.source} ${w.callback} ${w.options ?? ''}`).join(' ');
    for (const p of analysis.props) {
        // Always generate accessor if prop is used in body, signals, deriveds, or is a common pattern
        const namePattern = new RegExp(`\\b${p.name}\\b`);
        if (namePattern.test(bodyText) || analysis.signals.some(s => namePattern.test(s.initialExpr)) ||
            analysis.deriveds.some(d => namePattern.test(d.expr))) {
            parts.push(`    const ${p.name} = ctx.${p.name};`);
        }
    }

    // @inject — declarative context consumer (walks up DOM tree). BEFORE the body, with the props: the
    // body reads what it injects, and emitted after it a top-level read would be in the name's TDZ.
    // The lookup needs nothing the body declares — a key and the host element.
    for (const inj of analysis.injects) {
        const localName = inj.alias ?? inj.key;
        parts.push(`    const ${localName} = inject(${jsQuote(inj.key)}, ctx.el);`);
    }

    // TDZ-safe ordering. Signals normally emit BEFORE the body, but a signal may
    // depend on a body-local const (`const base = 10; let c = $signal(base)`).
    // Such signals must wait for that declaration. Conversely a derived used in the body
    // must emit BEFORE the body. We compute body-local declared names and partition.
    const bodyLocalNames = collectBodyLocalNames(analysis.body);
    // @event name: T → `name(detail)` dispatches it from the host. Declared before
    // everything else, so the body can call it at setup time. An author who declares the name
    // themselves keeps their own function. `$emit(event, detail)` is the untyped form of the same.
    const emitterNames = analysis.events.map(e => e.name).filter(n => !bodyLocalNames.has(n));
    for (const n of emitterNames) parts.push(`    const ${n} = (detail) => ctx.emit(${jsQuote(n)}, detail);`);
    const usesEmit = /\$emit\s*\(/.test(bodyText) || /\$emit\s*\(/.test(descriptor?.template?.content ?? '');
    if (usesEmit) parts.push(`    const $emit = (event, detail) => ctx.emit(event, detail);`);

    // Late signals: those reading a body-local, and those reading a late signal. They are
    // declared inside the body, after the statement that declares what they read.
    const late = lateSignals(analysis.signals, bodyLocalNames);
    const signalsBeforeBody = analysis.signals.filter(s => !late.has(s.name));
    const signalsAfterBody = analysis.signals.filter(s => late.has(s.name));
    // Where each line of the body was written: marked before anything moves or rewrites
    // it, so the mark travels with the line.
    const originBody = analysis.bodyOrigins && analysis.bodyOrigins.length === analysis.body.split('\n').length
        ? markEach(analysis.body, analysis.bodyOrigins, true)
        : analysis.body;
    const declareSignal = (sig: (typeof analysis.signals)[number]) =>
        markFirst(generateSignalDeclarations([sig], filename, propNames, production), sig.origin);
    const declareDerived = (d: (typeof analysis.deriveds)[number]) =>
        markFirst(generateDerivedDeclarations([d], signalNames, allCallableInDerived, filename, production), d.origin);

    // Signal declarations with debug names (independent ones — emit before body)
    if (signalsBeforeBody.length > 0) {
        parts.push(signalsBeforeBody.map(declareSignal).join('\n'));
    }

    // Store declarations ($store → store()) — rewrite prop references with .peek()
    // (string/object-key-aware so keys and string contents aren't touched).
    for (const s of analysis.stores) {
        const storeExpr = rewritePropPeeks(s.initialExpr, propNames);
        parts.push(markFirst(`    const ${s.name} = store(${storeExpr});`, s.origin));
    }

    // @fetch declarations → resource() calls with HttpClient
    // (BEFORE derived — derived may reference fetch results)
    if (analysis.fetches.length > 0) {
        parts.push(`    const __httpClient = getDefaultClient();`);
        for (const f of analysis.fetches) {
            // Escape the URL so a backtick in it cannot close the generated literal and turn the
            // rest into an executed expression. Static URLs go through jsString, which
            // cannot be escaped out of. Reactive URLs must keep their `${...}` interpolations —
            // that is the feature — so they get the sibling escape that leaves `${` alone.
            const safeUrl = escapeForReactiveTemplate(f.url);
            const cacheKey = f.hasReactiveParams
                ? `() => \`${f.method}:${safeUrl}\``
                : jsString(`${f.method}:${f.url}`);
            const fetchUrl = f.hasReactiveParams ? `\`${safeUrl}\`` : jsString(f.url);
            const optsEntries: string[] = [`key: ${cacheKey}`];
            if (f.options) {
                optsEntries.push(f.options.slice(1, -1).trim());
            }
            parts.push(`    const ${f.name} = resource(() => __httpClient.get(${fetchUrl}), { ${optsEntries.join(', ')} });`);
        }
    }

    // @form declarations → createForm() calls with field configs
    // (BEFORE derived — derived may reference form state)
    for (const f of analysis.forms) {
        // Extended-option tail shared by inline + external forms. `warnUnsaved` goes to createForm,
        // which installs the leave guard itself: the in-app confirm, not window.confirm.
        const optionParts: string[] = [];
        if (f.saveMode) optionParts.push(`saveMode: ${jsQuote(f.saveMode)}`);
        if (f.warnUnsaved) optionParts.push('warnUnsaved: true');
        if (f.source) optionParts.push(`source: ${f.source}`);
        if (f.parent) optionParts.push(`parent: ${f.parent}`);
        // The cross-field rule, emitted as the expression it was written as.
        if (f.validate) optionParts.push(`validate: ${f.validate}`);
        // name lets a parent coordinator + DataSource identify this form.
        if (f.source || f.parent) optionParts.push(`name: ${jsQuote(f.name)}`);
        if (f.fieldConfig && Object.keys(f.fieldConfig).length > 0) {
            const entries = Object.entries(f.fieldConfig).map(([k, v]) => {
                const opts: string[] = [];
                if (v.saveMode) opts.push(`saveMode: ${jsQuote(v.saveMode)}`);
                if (v.saveDebounce) opts.push(`saveDebounce: ${v.saveDebounce}`);
                return `${k}: { ${opts.join(', ')} }`;
            });
            optionParts.push(`fieldConfig: { ${entries.join(', ')} }`);
        }
        const tail = optionParts.length > 0 ? `, ${optionParts.join(', ')}` : '';

        if (f.kind === 'external') {
            parts.push(`    const ${f.name} = createForm({ initialValues: {}, schema: ${f.schemaExpr}${tail} });`);
        } else if (f.fields) {
            /** A field's empty value, by declared type. A list type (`string[]`) starts empty. */
            const defaultFor = (type: string) => type.endsWith('[]') ? '[]'
                : type === 'number' ? '0' : type === 'boolean' ? 'false' : "''";
            const initEntries = f.fields.map(fd => {
                if (fd.isArray) return `${fd.name}: []`;
                // A nested object is emitted NESTED, not pre-flattened: `createForm` flattens
                // `initialValues` itself and recursively, and the nested shape is what
                // `getValues()` gives back.
                if (fd.objectFields) {
                    const subs = fd.objectFields.map(s => `${s.name}: ${defaultFor(s.type)}`);
                    return `${fd.name}: { ${subs.join(', ')} }`;
                }
                return `${fd.name}: ${defaultFor(fd.type)}`;
            });

            /** `required` plus the declared rules, as constructor calls. */
            const rulesOf = (fd: { required: boolean; rules: string[] }): string[] => {
                const rules: string[] = [];
                if (fd.required) rules.push('required()');
                for (const rule of fd.rules) {
                    // Parse rule: 'minLength: 3' → 'minLength(3)', 'email' → 'email()'
                    const colonIdx = rule.indexOf(':');
                    if (colonIdx !== -1) {
                        const fn = rule.slice(0, colonIdx).trim();
                        const arg = rule.slice(colonIdx + 1).trim();
                        rules.push(`${fn}(${arg})`);
                    } else {
                        rules.push(`${rule}()`);
                    }
                }
                return rules;
            };

            const validatorEntries: string[] = [];
            for (const fd of f.fields) {
                if (fd.isArray) continue;
                if (fd.objectFields) {
                    // Keyed by the DOTTED path the flattening will produce. Keyed by the bare
                    // sub-name it would sit on a field that does not exist — the same silence,
                    // one level down.
                    for (const sub of fd.objectFields) {
                        const rules = rulesOf(sub);
                        if (rules.length > 0) validatorEntries.push(`'${fd.name}.${sub.name}': [${rules.join(', ')}]`);
                    }
                    continue;
                }
                const rules = rulesOf(fd);
                if (rules.length > 0) {
                    validatorEntries.push(`${fd.name}: [${rules.join(', ')}]`);
                }
            }
            let formCode = `    const ${f.name} = createForm({ initialValues: { ${initEntries.join(', ')} }`;
            if (validatorEntries.length > 0) {
                formCode += `, validators: { ${validatorEntries.join(', ')} }`;
            }
            formCode += `${tail} });`;
            parts.push(formCode);
        }
    }

    // Callable names: props + derived + route params — need () appended in body/effect/lifecycle
    const signalNames = new Set(analysis.signals.map(s => s.name));
    const callableNames = new Set<string>();
    for (const p of analysis.props) callableNames.add(p.name);
    for (const d of analysis.deriveds) callableNames.add(d.name);
    // @params: typed route params are generated as computed() → need () reads
    if (analysis.route.params) {
        for (const rp of analysis.route.params) callableNames.add(rp.name);
    }

    // Helper: rewrite signals (__name / .set) and callables (name()) in one AST pass.
    function rewriteAll(code: string): string {
        return rewriteAst(code, signalNames, callableNames, filename, undefined, sink);
    }

    // Partition deriveds: any derived referenced by the EAGERLY-executing body must
    // be declared BEFORE the body (else `const x = derived(); ... function f(){ x() }`
    // is fine, but a top-level body statement reading it would TDZ).
    const derivedNames = new Set(analysis.deriveds.map(d => d.name));
    const allCallableInDerived = new Set([...derivedNames, ...propNames]);
    const bodyForDerived = analysis.body || '';
    // Deriveds reference EARLIER deriveds (source order = dependency order). computed() is lazy, so
    // a dependency need not be declared before its dependent, and the partition below is
    // belt-and-braces rather than load-bearing. Partition as a
    // SOURCE-ORDER PREFIX: emit every derived up to and including the LAST one referenced by the
    // body before the body. This keeps each before-body derived's derived-dependencies before it
    // too (filtering only by "name in body" would hoist `tag` but leave its dep `_decl` after the
    // body → TDZ "Cannot access _decl before initialization").
    let lastBeforeIdx = -1;
    analysis.deriveds.forEach((d, i) => {
        if (new RegExp(`\\b${d.name}\\b`).test(bodyForDerived)) lastBeforeIdx = i;
    });
    // A derived whose expression reads a TDZ-prone body-local (a `const`/`let` declared INSIDE
    // the body — e.g. `const docs = ...; const navItems = $derived(docs.map(...))`) cannot be
    // hoisted before the body: its dependency only exists after the body runs. The body's own
    // references to LATER deriveds (what set lastBeforeIdx) live in deferred closures —
    // `effect()`/`onMount`, guarded before they read — so they never TDZ even when their derived
    // is declared after the body. Since the before-body group is a contiguous source prefix,
    // clamp it to stop before the FIRST body-local-dependent derived.
    const bodyLocalTdzNames = collectBodyLocalTdzNames(analysis.body);
    const refsBodyLocalTdz = (expr: string): boolean => {
        for (const n of bodyLocalTdzNames) {
            if (new RegExp(`\\b${n}\\b`).test(expr)) return true;
        }
        return false;
    };
    let firstBodyLocalDerivedIdx = -1;
    for (let i = 0; i < analysis.deriveds.length; i++) {
        if (refsBodyLocalTdz(analysis.deriveds[i].expr)) { firstBodyLocalDerivedIdx = i; break; }
    }
    if (firstBodyLocalDerivedIdx !== -1) {
        lastBeforeIdx = Math.min(lastBeforeIdx, firstBodyLocalDerivedIdx - 1);
    }
    // Same clamp, one level of indirection out.
    //
    // A derived that reads a SIGNAL which is itself waiting for a body-local cannot be hoisted
    // either: that signal emits after the body, so the derived would call `__name()` above
    // `const __name = signal(...)`. computed() is lazy, so the TDZ would lie latent until the first
    // read, and its message would name `__name` — an internal the author never wrote. The clamp
    // costs nothing.
    //
    // One signal reading a body-local (`params`) can pull many signals after the body, and without
    // the clamp any derived reading one of them breaks the app.
    const afterBodySignalNames = signalsAfterBody.map(s => s.name);
    const refsAfterBodySignal = (expr: string): boolean =>
        afterBodySignalNames.some(n => new RegExp(`\\b${n}\\b`).test(expr));
    let firstAfterSignalDerivedIdx = -1;
    for (let i = 0; i < analysis.deriveds.length; i++) {
        if (refsAfterBodySignal(analysis.deriveds[i].expr)) { firstAfterSignalDerivedIdx = i; break; }
    }
    if (firstAfterSignalDerivedIdx !== -1) {
        lastBeforeIdx = Math.min(lastBeforeIdx, firstAfterSignalDerivedIdx - 1);
    }
    const derivedsBeforeBody = analysis.deriveds.slice(0, lastBeforeIdx + 1);
    const derivedsAfterBody = analysis.deriveds.slice(lastBeforeIdx + 1);

    // The late signals, then the deriveds past the prefix, each declared inside the body right after
    // the statement that declares what it reads. A derived that reads nothing
    // the body declares, and that the body reads, goes at its start: it is past the prefix only
    // because an earlier one waits. One the body does not read stays at its end, where it was.
    const bodyReads = (name: string): boolean => new RegExp(`\\b${name}\\b`).test(bodyForDerived);
    const lateDecls = [
        ...signalsAfterBody.map(s => ({ name: s.name, initialExpr: s.initialExpr, declare: () => declareSignal(s) })),
        ...derivedsAfterBody.map(d => ({
            name: d.name, initialExpr: d.expr, unplaced: bodyReads(d.name) ? 'start' as const : 'end' as const,
            declare: () => declareDerived(d),
        })),
    ];
    const lateOffsets = lateDecls.length > 0 && originBody ? lateSignalOffsets(originBody, lateDecls) : null;
    const setupBody = lateOffsets ? insertLateSignalMarkers(originBody, lateDecls, lateOffsets) : originBody;

    if (derivedsBeforeBody.length > 0) {
        parts.push(derivedsBeforeBody.map(declareDerived).join('\n'));
    }

    // Rewritten function bodies (count++ → __count.set(...), total → total())
    // Lines prefixed with /*@raw*/ are excluded from signal rewriting (@raw {} blocks)
    if (setupBody) {
        const RAW_MARKER = '/*@raw*/';
        let bodyCode: string;
        if (setupBody.includes(RAW_MARKER)) {
            // Rewrite the WHOLE body as one unit so multiline statements parse correctly, but
            // PROTECT the @raw regions from rewriting. Per-line rewriting broke multiline
            // statements (the AST rewriter can't parse a lone `} else {` fragment). The
            // /*@raw*/ markers are comments (trivia), so the body parses with them in place;
            // we compute each raw line's char range, skip edits inside it, then strip markers.
            // Fallback: if the body doesn't parse cleanly (e.g. @raw wraps non-TS), keep the
            // legacy per-line rewrite so non-raw single-line statements still get rewritten.
            if (parsesCleanly(setupBody)) {
                const protectedRanges: [number, number][] = [];
                let offset = 0;
                for (const line of setupBody.split('\n')) {
                    if (line.trimStart().startsWith(RAW_MARKER)) {
                        protectedRanges.push([offset, offset + line.length]);
                    }
                    offset += line.length + 1; // +1 for the '\n'
                }
                const rewritten = rewriteAst(setupBody, signalNames, callableNames, filename, protectedRanges, sink);
                bodyCode = indent(rewritten.split(RAW_MARKER).join(''), 4);
            } else {
                const rewrittenLines = setupBody.split('\n').map(line =>
                    line.trimStart().startsWith(RAW_MARKER) ? line.replace(RAW_MARKER, '') : rewriteAll(line),
                );
                bodyCode = indent(rewrittenLines.join('\n'), 4);
            }
        } else {
            bodyCode = indent(rewriteAll(setupBody), 4);
        }
        // Each late signal and derived where its marker stands.
        parts.push(lateOffsets
            ? replaceLateSignalMarkers(bodyCode, (i) => lateDecls[i].declare())
            : bodyCode);
    }

    // What the body could not place (it does not parse, or there is no body) — AFTER it: the late
    // signals, then the remaining deriveds.
    if (!lateOffsets) {
        if (signalsAfterBody.length > 0) parts.push(signalsAfterBody.map(declareSignal).join('\n'));
        if (derivedsAfterBody.length > 0) parts.push(derivedsAfterBody.map(declareDerived).join('\n'));
    }

    // $watch blocks — rewrite signal/prop reads in source and callback. The source is handed over
    // as something watch() can observe, element by element for a list: `emitWatchSource`.
    // A development build names each $effect and $watch after where it was written, `file.pdx:line`,
    // as it names a $signal: what the inspector's effects(), trace and subscribers report.
    const pdxFile = filename.replace(/\\/g, '/').split('/').pop() ?? '';
    const runeName = (line: number | null | undefined): string | null =>
        production || line == null ? null : jsString(`${pdxFile}:${line}`);
    analysis.watches.forEach((w, k) => {
        // The options are an expression too: `{ immediate: eager }` reads a prop.
        const name = runeName(analysis.runeLines?.watches[k]);
        const opts = w.options
            ? `, ${name ? `{ ...(${rewriteAll(w.options)}), name: ${name} }` : rewriteAll(w.options)}`
            : name ? `, { name: ${name} }` : '';
        const src = emitWatchSource(w.source, rewriteAll);
        const cb = rewriteAll(w.callback);
        parts.push(markCall(`    watch(${src}, ${cb}${opts});`, analysis.origins?.watches[k]));
    });

    // $effect blocks — rewrite signal/prop reads inside effect body
    analysis.effects.forEach((eff, k) => {
        const at = analysis.origins?.effects[k];
        const name = runeName(analysis.runeLines?.effects[k]);
        const opts = name ? `, { name: ${name} }` : '';
        if (scriptOnly) {
            // Plain module: use effect() directly (no ctx)
            parts.push(markCall(`    effect(${rewriteAll(eff)}${opts});`, at));
        } else {
            parts.push(markCall(`    ctx.track(${rewriteAll(eff)}${opts});`, at));
        }
    });

    // Lifecycle: onMount — invoke as one-shot callback, NOT reactive effect.
    analysis.lifecycle.onMount.forEach((body, k) => {
        const at = analysis.origins?.onMount[k];
        if (scriptOnly) {
            // Plain module: call immediately (no mount lifecycle)
            parts.push(markCall(`    (${rewriteAll(body)})();`, at));
        } else {
            parts.push(markCall(`    onMount(${rewriteAll(body)});`, at));
        }
    });

    // Lifecycle: onDestroy — return a cleanup function
    analysis.lifecycle.onDestroy.forEach((body, k) => {
        if (scriptOnly) {
            // Plain module: no destroy lifecycle — skip (modules don't unmount)
        } else {
            parts.push(markCall(`    ctx.track(() => () => { (${rewriteAll(body)})(); });`, analysis.origins?.onDestroy[k]));
        }
    });

    // @expose — expose declared names on the host element.
    // Signals live under the __name internal var, so map name → __name (like auto-return);
    // plain functions/consts keep their bare name.
    if (analysis.exposes.length > 0) {
        const exposeObj = analysis.exposes.map(n =>
            signalNames.has(n) ? `${n}: __${n}` : `${n}`,
        ).join(', ');
        parts.push(`    ctx.expose({ ${exposeObj} });`);
    }

    // @params — typed route params with coercion (inject routeParams signal, derive typed values)
    if (analysis.route.params && analysis.route.params.length > 0) {
        parts.push(`    const __routeParams = inject('routeParams', ctx.el) ?? (() => ({}));`);
        for (const p of analysis.route.params) {
            const coerce = p.type === 'number' ? `Number(__routeParams()?.${p.name} ?? 0)`
                : p.type === 'boolean' ? `__routeParams()?.${p.name} === 'true'`
                : `__routeParams()?.${p.name} ?? ''`;
            parts.push(`    const __${p.name} = computed(() => ${coerce});`);
        }
    }

    // @provide — declarative context provider (DOM-scoped on host element)
    for (const p of analysis.provides) {
        parts.push(`    provide(${jsQuote(p.key)}, ${rewriteAll(p.expr)}, ctx.el);`);
    }

    // keepAlive pages need onShow for resume lifecycle (title refresh, state reconciliation)
    if (analysis.route.keepAlive) {
        analysis.usedFeatures.add('onShow');
    }

    // @title — head management (static: useHead, dynamic: effect on document.title)
    if (analysis.head.title) {
        const titleValue = analysis.head.title.value;
        if (analysis.head.title.isDynamic) {
            parts.push(`    ctx.track(() => { document.title = ${rewriteAll(titleValue)}; });`);
        } else {
            parts.push(`    useHead({ title: ${jsString(titleValue)} });`);
        }
        // Keep-alive pages: refresh title on show (resume from freeze)
        if (analysis.route.keepAlive) {
            analysis.usedFeatures.add('onShow');
            if (analysis.head.title.isDynamic) {
                parts.push(`    onShow(() => { document.title = ${rewriteAll(titleValue)}; });`);
            } else {
                parts.push(`    onShow(() => { document.title = ${jsString(titleValue)}; });`);
            }
        }
    }

    // @meta — static meta tags via useHead
    if (analysis.head.meta.length > 0) {
        const metaEntries = analysis.head.meta.map(m => {
            const entries: string[] = [];
            if (m.name) entries.push(`name: ${jsString(m.name)}`);
            if (m.property) entries.push(`property: ${jsString(m.property)}`);
            entries.push(`content: ${jsString(m.content)}`);
            return `{ ${entries.join(', ')} }`;
        });
        parts.push(`    useHead({ meta: [${metaEntries.join(', ')}] });`);
    }

    // Scoped CSS — set data-pdx-HASH attribute on host element for descendant selector scoping.
    // ANY block being scoped is enough: a file may carry a plain block first and the scoped one
    // second, and reading only the first would leave that component's stylesheet matching nothing.
    const cssBlocks = descriptor ? styleBlocks(descriptor) : [];
    // Under `<template shadow>` the CSS goes into the root instead, unscoped: the root is already
    // the scope, and a head stylesheet cannot cross the boundary at all.
    const shadowStyles = descriptor ? generateShadowStyles(descriptor, filename, production) : '';
    if (shadowStyles) {
        parts.push(shadowStyles);
    } else if (cssBlocks.some(b => b.scoped)) {
        const scopeAttr = `data-pdx-${hash(filename)}`;
        parts.push(`    ctx.el.setAttribute(${jsQuote(scopeAttr)}, '');`);
    }

    // bind() CSS — generate effect that sets CSS custom properties on host element
    if (cssBlocks.length > 0) {
        const scopeHash = hash(filename);
        const bindings = extractCSSBindings(cssBlocks.map(b => b.content).join('\n'), `data-pdx-${scopeHash}`);
        if (bindings.length > 0) {
            const setProps = bindings.map(name =>
                `      ctx.el.style.setProperty('--pdx-${scopeHash}-${name}', String(ctx.${name}()));`
            ).join('\n');
            parts.push(`    ctx.track(() => {\n${setProps}\n    });`);
        }
    }

    // @search: generate typed searchParams computed from URLSearchParams
    if (analysis.route.searchParams && analysis.route.searchParams.length > 0) {
        // Simple form vs validation form
        const hasValidation = analysis.route.searchParams.some(p => p.type === 'number' && !p.optional);
        if (hasValidation) {
            // Complex form with per-field validation
            const fieldLines = analysis.route.searchParams.map(p => {
                if (p.type === 'number') {
                    const def = p.default ?? '0';
                    return `        const __v_${p.name} = Number(__sp.get(${jsQuote(p.name)}) ?? ${def});\n` +
                           `        if (isNaN(__v_${p.name})) console.warn('[pdx] Invalid search param: ${p.name} must be a number');`;
                }
                return null;
            }).filter(Boolean);
            const returnFields = analysis.route.searchParams.map(p => {
                if (p.type === 'number') return `${p.name}: isNaN(__v_${p.name}) ? ${p.default ?? '0'} : __v_${p.name}`;
                if (p.type === 'boolean') return `${p.name}: __sp.get(${jsQuote(p.name)}) === 'true'`;
                const def = p.default ? ` ?? ${jsString(p.default)}` : p.optional ? '' : " ?? ''";
                return `${p.name}: __sp.get(${jsQuote(p.name)})${def}`;
            });
            parts.push(`    const searchParams = computed(() => {\n      const __sp = new URLSearchParams(currentSearch());\n${fieldLines.join('\n')}\n      return { ${returnFields.join(', ')} };\n    });`);
        } else {
            // Simple form: no validation
            const returnFields = analysis.route.searchParams.map(p => {
                if (p.type === 'number') return `${p.name}: Number(__sp.get(${jsQuote(p.name)}) ?? ${p.default ?? '0'})`;
                if (p.type === 'boolean') return `${p.name}: __sp.get(${jsQuote(p.name)}) === 'true'`;
                const def = p.default ? ` ?? ${jsString(p.default)}` : p.optional ? '' : " ?? ''";
                return `${p.name}: __sp.get(${jsQuote(p.name)})${def}`;
            });
            parts.push(`    const searchParams = computed(() => {\n      const __sp = new URLSearchParams(currentSearch());\n      return { ${returnFields.join(', ')} };\n    });`);
        }
        // Add searchParams to exports so it's in auto-return
        if (!analysis.exports.some(e => e.name === 'searchParams')) {
            analysis.exports.push({ name: 'searchParams', kind: 'const' });
        }
    }

    // Auto-return (no manual return needed). The emitters go too: the template calls ctx.<name>.
    const returned = [...analysis.exports];
    for (const n of emitterNames) {
        if (!returned.some(e => e.name === n)) returned.push({ name: n, kind: 'function' });
    }
    if (usesEmit) returned.push({ name: '$emit', kind: 'function' });
    parts.push(generateAutoReturn(returned));

    return parts.join('\n');
}

// ─── Internal Helpers ──────────────────────────────────────────────

// Origin marks: a comment at the start of a generated line saying where the code after
// it was written in the .pdx. `compile()` reads them into the source map and removes them; they
// exist only when the analysis carries origins.

/** `code` with its first line marked as written at `origin`. */
function markFirst(code: string, origin: number | null | undefined): string {
    return origin == null ? code : code.replace(/^([ \t]*)/, `$1${originMark(origin)}`);
}

/**
 * `code` with each line that starts in code marked with its origin. A line that starts inside a
 * string, a template literal or a comment is left as it is: a mark there would be part of the
 * string. `skipRaw`: a line the rewriter must not touch starts with the @raw marker comment, and
 * the rewriter finds it by that start, so it stays unmarked.
 */
function markEach(code: string, origins: (number | null)[], skipRaw = false): string {
    const masked = maskNonCode(code).split('\n');
    return code.split('\n').map((line, k) => {
        const origin = origins[k];
        const first = line.search(/\S/);
        if (origin == null || first < 0 || masked[k]?.search(/\S/) !== first) return line;
        if (skipRaw && line.trimStart().startsWith('/*@raw*/')) return line;
        return line.replace(/^([ \t]*)/, `$1${originMark(origin)}`);
    }).join('\n');
}

/** A call body: each line marked when its origins still line up with it, else its first line. */
function markCall(code: string, origins: (number | null)[] | undefined): string {
    if (!origins) return code;
    return code.split('\n').length === origins.length ? markEach(code, origins) : markFirst(code, origins[0]);
}


/** Indent all lines of a code block by the given number of spaces. */
function indent(code: string, spaces: number): string {
    const pad = ' '.repeat(spaces);
    return code.split('\n').join('\n' + pad);
}

/**
 * Collect top-level const/let/var/function names declared in the setup body.
 * Used for TDZ-safe ordering: signals referencing these must emit after the body.
 */
function collectBodyLocalNames(body: string): Set<string> {
    const names = new Set<string>();
    if (!body) return names;
    const declRe = /\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(body)) !== null) names.add(m[1]);
    return names;
}

/**
 * Body-locals that are TDZ-prone: `const`/`let`/`var` only. `function` declarations are
 * hoisted, so referencing one before its textual position is safe. Used to decide which
 * deriveds genuinely depend on the body and therefore cannot be hoisted before it.
 */
function collectBodyLocalTdzNames(body: string): Set<string> {
    const names = new Set<string>();
    if (!body) return names;
    const declRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(body)) !== null) names.add(m[1]);
    return names;
}
