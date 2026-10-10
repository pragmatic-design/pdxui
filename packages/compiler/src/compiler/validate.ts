// Validation Pass — semantic checks on analyzed .pdx components.
// Runs after Script Analyzer + Template Parser, before Code Generator.
// Detects: non-reactive variables, unused exports, duplicate events,
// missing types, empty loops, accessibility hints.

import ts from 'typescript';
import type { ScriptAnalysis } from './script-analyzer';
import { findComponentTags, selfDefinedTags } from './resolve';
import { onlyNear } from './edit-distance';
import { checkUndeclaredRefs } from './validate-refs';
import { validateLegacy } from './validate-legacy';
import { checkEnumValues, type EnumLookup } from './validate-enums';
import type { TemplateNode, SourceLoc } from '../parser/template';
import { skipNonCode, findClosing } from './tokenizer';
import { openingTagTexts, routeParams } from '../text-scan';
import { escapeForRegExp } from './regexp-escape';

/**
 * Map a character offset inside a node's text to an absolute source {line, column}, given the
 * node's own start location. Newlines before the offset advance the line; the column resets on
 * each newline, else adds to the node's start column. SourceLoc counts columns from 0; a finding
 * counts them from 1, like every other position it reports.
 */
function offsetToLineColumn(text: string, offset: number, base: SourceLoc): { line: number; column: number } {
    let line = base.line;
    let column = base.column;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') { line++; column = 0; } else { column++; }
    }
    return { line, column: column + 1 };
}

/**
 * Is `name` referenced (read/write) anywhere in the setup body? Uses the TS AST so it counts
 * only REAL identifier references — excluding member names (`obj.name`) and property-assignment
 * keys (`{ name: … }`), and ignoring comments/strings by construction (they are not Identifiers).
 * The $signal/$derived declarations are already extracted from `body`, so any reference here is a
 * genuine use — one is enough. An unparseable body is treated as referenced (conservative: no warn).
 */
function isReferencedInBody(body: string, name: string): boolean {
    if (!body.includes(name)) return false;
    const sf = ts.createSourceFile('__pdx_check.ts', body, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TS);
    const diags = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
    if (diags?.length) return true;
    let found = false;
    const visit = (n: ts.Node): void => {
        if (found) return;
        if (ts.isIdentifier(n) && n.text === name) {
            const p = n.parent;
            const isMemberName = p && ts.isPropertyAccessExpression(p) && p.name === n;
            const isPropKey = p && ts.isPropertyAssignment(p) && p.name === n;
            if (!isMemberName && !isPropKey) { found = true; return; }
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return found;
}

/**
 * Every piece of REAL CODE the analyzer lifted OUT of `analysis.body`, as parseable statements.
 *
 * `body` is only what is left over. A reactive read inside another rune's initialiser, a lifecycle
 * block, a watch or a store is therefore absent from `body` and looks unread. Checking `body` alone,
 * each of these is reported as unused while being read:
 *
 *     const b = $derived(a + 1);     let b = $signal(a);      let s = $store({ x: a });
 *     onMount(() => use(a));         onDestroy(() => use(a));
 *     $watch(a, ...);                $watch(t, () => use(a));
 *
 * That is the check inverted: it tells the author to rename a live variable to `_name`, which
 * breaks the component. A warning that is wrong is worse than no warning — it teaches people to
 * stop reading them.
 *
 * The pieces are used rather than the raw script on purpose. The script still carries its
 * directives, and `@page '/x';` is a decorator followed by a string that does not parse as
 * TypeScript — so feeding the whole script to the parser makes every routed file "unparseable",
 * and the conservative branch would silence this check across most of the codebase: a variable
 * read nowhere would no longer be reported. Each piece below is an
 * expression or a block the analyzer already isolated, so each one parses on its own.
 *
 * The declaration under test is excluded by name, so a rune never counts as reading itself.
 */
function reactiveSurfaces(analysis: ScriptAnalysis, exclude: string): string[] {
    const out: string[] = [];
    const expr = (e: string | undefined): void => { if (e && e.trim()) out.push('(' + e + ');'); };
    const block = (b: string | undefined): void => { if (b && b.trim()) out.push('function __pdx() {' + b + '}'); };

    for (const sig of analysis.signals) if (sig.name !== exclude) expr(sig.initialExpr);
    for (const der of analysis.deriveds) if (der.name !== exclude) expr(der.expr);
    for (const sto of analysis.stores) if (sto.name !== exclude) expr(sto.initialExpr);
    for (const w of analysis.watches) { expr(w.source); expr(w.callback); expr(w.options); }
    for (const pr of analysis.provides) expr(pr.expr);
    for (const ef of analysis.effects) block(ef);
    for (const m of analysis.lifecycle.onMount) block(m);
    for (const d of analysis.lifecycle.onDestroy) block(d);
    for (const b of analysis.inlineBlocks ?? []) block(b);
    if (analysis.head.title && analysis.head.title.isDynamic) expr(analysis.head.title.value);
    return out;
}

/** True when `name` is read by any of those pieces. Same rules as `isReferencedInBody`. */
function isReadInReactiveSurfaces(analysis: ScriptAnalysis, name: string): boolean {
    return reactiveSurfaces(analysis, name).some(piece => isReferencedInBody(piece, name));
}

// ─── Types ─────────────────────────────────────────────────────────

export type DiagnosticSeverity = 'error' | 'warn' | 'info';

export interface ValidationWarning {
    /** Diagnostic code (e.g. 'PDX_NON_REACTIVE', 'PDX_PROP_NO_TYPE'). */
    code: string;
    /** Severity level. */
    severity: DiagnosticSeverity;
    /** Human-readable message. */
    message: string;
    /** Suggested fix. */
    hint?: string;
    /** Structured fix proposal for --fix mode. */
    fix?: FixProposal;
    /**
     * The name the finding's text should be, when exactly one is right: the declared prop for a
     * misspelt or miscased binding, the lowercase event name, the one known tag near a misspelt
     * one. `proposeFixes` turns it into edits; with no single answer it is absent, and so is the
     * fix.
     */
    suggestion?: string;
    /** 1-based source line, when the check can locate it. Enables `file:line:col` downstream. */
    line?: number;
    /** 1-based source column, when known. */
    column?: number;
    /** Where the code is explained: its anchor on the generated diagnostics page. */
    url?: string;
}

/** One text edit into the `.pdx` source: replace [start, end) with `newText`. An LSP TextEdit, in offsets. */
export interface FixEdit {
    start: number;
    end: number;
    newText: string;
}

/**
 * A fix, as edits into the `.pdx` source the finding came from. Built from the finding's
 * position by `proposeFixes`, so it rewrites the declaration the finding is about, not the first
 * text that looks like it. `pdx check --fix` and the editor's quick fix apply the same edits.
 */
export interface FixProposal {
    /** What applying it does, as a quick-fix title. */
    title: string;
    /** Non-overlapping edits; applied together. */
    edits: FixEdit[];
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Cross-check template expressions against script declarations.
 * Returns diagnostics with severity levels and fix proposals.
 * Only runs in new mode (@prop/$signal) — legacy mode has explicit return.
 */
/**
 * What the caller knows that the validator cannot work out on its own.
 *
 * `isKnownTag` answers whether a custom-element tag will actually be registered. A predicate
 * rather than a set because that is the shape both callers already have: `ComponentResolver`
 * exposes `resolve(tag)` and keeps its map private, and the LSP holds two separate indexes.
 * When it is absent the unresolved-component check does not run at all: a caller with no
 * resolver must not be told every component in the file is missing.
 */
export interface ValidateOptions {
    isKnownTag?: (tag: string) => boolean;
    /**
     * The tags a misspelt one may have meant — the resolver's registered tags, the editor's index.
     * With exactly one within 2 edits, PDX_UNRESOLVED_COMPONENT names it and carries the rename.
     * Absent, the finding names nothing.
     */
    knownTags?: () => Iterable<string>;
    /**
     * The allowed values of an enum prop — the resolver's `enumValues`. With it, a static or
     * literal value outside them is PDX_INVALID_ENUM_VALUE; without it, nothing is
     * checked.
     */
    enumValues?: EnumLookup;
    /**
     * Where the caller looked for components — the resolver's `searched`: its component packages,
     * then its project folders. PDX_UNRESOLVED_COMPONENT's hint names them, so a package that was
     * not found shows in the message.
     */
    searched?: () => readonly string[];
}

export function validate(
    analysis: ScriptAnalysis,
    ast: TemplateNode[],
    _filename: string,
    options?: ValidateOptions
): ValidationWarning[] {
    // The legacy mode has one check of its own: a template read its script does not hand over.
    if (analysis.mode !== 'new') return validateLegacy(analysis, ast);
    // @store files are store modules — no template usage checks apply
    if (analysis.globalStore) return [];

    const warnings: ValidationWarning[] = [];

    // ─── Check 0: setup-body syntax ────────────────────────────────
    // A genuine syntax error in <script setup> would otherwise pass straight through into the
    // generated module as broken code, with no diagnostic. Parse the assembled setup
    // body and surface the first syntax error as a PDX finding. The body's lines are not the file's:
    // positionWarnings() places it in the file.
    if (analysis.body && analysis.body.trim()) {
        const sf = ts.createSourceFile('__pdx_setup.ts', analysis.body, ts.ScriptTarget.Latest, /*setParentNodes*/ false, ts.ScriptKind.TS);
        const diags = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
        if (diags && diags.length > 0) {
            const d = diags[0];
            warnings.push({
                code: 'PDX_SCRIPT_SYNTAX_ERROR',
                severity: 'error',
                message: `Syntax error in <script setup>: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
                hint: `Fix the syntax error in the setup script before it reaches code generation.`,
            });
        }
    }

    // ─── Build name sets ───────────────────────────────────────────

    // Reactive names — safe to use in template, auto-update UI
    const reactiveNames = new Set<string>();
    for (const p of analysis.props) reactiveNames.add(p.name);
    for (const s of analysis.signals) reactiveNames.add(s.name);
    for (const d of analysis.deriveds) reactiveNames.add(d.name);
    for (const s of analysis.stores) reactiveNames.add(s.name);
    for (const f of analysis.forms) reactiveNames.add(f.name);
    for (const f of analysis.fetches) reactiveNames.add(f.name);
    for (const inj of analysis.injects) reactiveNames.add(inj.alias ?? inj.key);

    // Function names — ok in template (event handlers, helpers)
    const functionNames = new Set<string>();
    for (const e of analysis.exports) {
        if (e.kind === 'function') functionNames.add(e.name);
    }

    // All declared names (for undeclared detection)
    const allDeclaredNames = new Set<string>([
        ...reactiveNames, ...functionNames,
    ]);
    for (const e of analysis.exports) allDeclaredNames.add(e.name);

    // Known reactive API calls in body
    const reactiveApis = ['resource(', 'linkedSignal(', 'mutation(', 'createForm(', 'createBus('];
    const functionApis = ['.handleSubmit(', '.handleChange(', '.handleBlur('];
    // Composable hook pattern: use*() returns reactive state (e.g. useTasks(), useCart())
    const composablePattern = /\buse[A-Z]\w*\(/;

    // Non-reactive declarations.
    // NB: `let` only — a `const` is immutable and cannot be reassigned, so it never "changes" →
    // the "won't update when changed" warning does not apply (immutable display values: title/crumbs/cols/…).
    const nonReactiveNames = new Set<string>();
    for (const e of analysis.exports) {
        if (e.kind === 'let' && !reactiveNames.has(e.name)) {
            const bodyLine = analysis.body.split('\n').find(l => l.trim().startsWith(`let ${e.name}`));
            const usesReactiveApi = bodyLine && reactiveApis.some(api => bodyLine.includes(api));
            const usesFunctionApi = bodyLine && functionApis.some(api => bodyLine.includes(api));
            const usesComposable = bodyLine && composablePattern.test(bodyLine);
            if (!usesReactiveApi && !usesFunctionApi && !usesComposable) {
                nonReactiveNames.add(e.name);
            }
        }
    }

    // ─── Template identifier extraction ────────────────────────────

    const declaredNames = new Set([...analysis.exports.map(e => e.name), ...analysis.props.map(p => p.name)]);
    const templateIds = collectTemplateIdentifiers(ast, declaredNames);
    // A name read and declared nowhere.
    checkUndeclaredRefs(analysis, templateIds, warnings);

    // ─── Check 1: Non-reactive variables in template ───────────────

    for (const id of templateIds) {
        if (nonReactiveNames.has(id)) {
            // Its fix — `let x = 5;` → `let x = $signal(5);` — is built from the declaration's
            // position in the file, by proposeFixes.
            warnings.push({
                code: 'PDX_NON_REACTIVE',
                severity: 'warn',
                message: `Variable '${id}' is used in template but not declared as $signal(). It won't update the UI when changed.`,
                hint: `Did you mean: let ${id} = $signal(...); ?`,
            });
        }
    }

    // ─── Check 2: Duplicate event names ────────────────────────────

    const eventNames = new Set<string>();
    for (const ev of analysis.events) {
        if (eventNames.has(ev.name)) {
            warnings.push({
                code: 'PDX_DUP_EVENT',
                severity: 'error',
                message: `Duplicate @event declaration '${ev.name}'.`,
                hint: `Remove the duplicate @event ${ev.name};`,
            });
        }
        eventNames.add(ev.name);
        // A listener is written as an attribute (`@itemPicked="…"`), and HTML lowercases attribute
        // names: it is registered for `itempicked` while the child dispatches `itemPicked`, and
        // never runs.
        if (ev.name !== ev.name.toLowerCase()) {
            warnings.push({
                code: 'PDX_EVENT_NAME_CASE',
                severity: 'warn',
                message: `@event '${ev.name}' has an uppercase letter: a parent's @${ev.name}="…" listens for '${ev.name.toLowerCase()}' (HTML lowercases attribute names) and never hears it.`,
                // Not kebab-case: the name is also the emitter's JS identifier, and the analyzer
                // reads `@event` names as \w+.
                hint: `Use a lowercase name — a listener attribute cannot carry case: @event ${ev.name.toLowerCase()};`,
                suggestion: ev.name.toLowerCase(),
            });
        }
    }

    // ─── Check 3: Duplicate prop names ─────────────────────────────

    const propNames = new Set<string>();
    for (const p of analysis.props) {
        if (propNames.has(p.name)) {
            warnings.push({
                code: 'PDX_DUP_PROP',
                severity: 'error',
                message: `Duplicate @prop declaration '${p.name}'.`,
                hint: `Remove the duplicate @prop ${p.name};`,
            });
        }
        propNames.add(p.name);
    }

    // ─── Check 4: Unused declared variables ────────────────────────

    for (const e of analysis.exports) {
        if (e.name.startsWith('_')) continue; // underscore = intentionally unused
        if (!templateIds.has(e.name) && e.kind !== 'function') {
            // Only warn for signals/derived that are never in template.
            if (e.kind === 'signal' || e.kind === 'derived') {
                // Indirect use: read/written in a body function (idiomatic .pdx wrapper, e.g.
                // `function isOpen(){ return open; }`, or uncontrolled inputs read in handlers) → not dead.
                // AST-based: one real reference is enough, and names in comments/strings don't count.
                if (isReferencedInBody(analysis.body, e.name)) continue;
                // …and everywhere the analyzer moved OUT of the body: another rune's
                // initialiser, a lifecycle block, a watch, a store.
                if (isReadInReactiveSurfaces(analysis, e.name)) continue;
                warnings.push({
                    code: 'PDX_UNUSED_REACTIVE',
                    severity: 'info',
                    message: `Reactive variable '${e.name}' is declared but not used in the template.`,
                    hint: `If unused, prefix with _ to suppress: let _${e.name} = $signal(...);`,
                });
            }
        }
    }

    // ─── Check 4-bis: components the caller cannot resolve ─────────
    // The failure this guards is the first silent one CONTRIBUTING.md names: a <pdx-*>
    // tag with no matching export is not auto-imported, the custom element is never registered,
    // and the page renders an inert unknown element with ZERO console errors. A console.warn from
    // the plugin alone would be seen by no editor and no `pdx check`.
    //
    // Only runs when the caller supplies what it knows. Without `knownTags` this check is silent:
    // a caller with no resolver has no evidence, and reporting every component as missing would be
    // worse than reporting none.
    if (options?.isKnownTag) {
        // A tag the file's own script registers is known: a string literal passed first to
        // customElements.define / defineComponent / component. A name held in a variable
        // is not guessed.
        const selfDefined = selfDefinedTags([analysis.body, ...(analysis.inlineBlocks ?? []),
            ...analysis.lifecycle.onMount, ...analysis.lifecycle.onDestroy, ...analysis.effects].join('\n'));
        for (const tag of findComponentTags(ast).filter(t => !options.isKnownTag!(t) && !selfDefined.has(t))) {
            const meant = options.knownTags ? onlyNear(tag, options.knownTags(), 2) : undefined;
            warnings.push({
                code: 'PDX_UNRESOLVED_COMPONENT',
                severity: 'warn',
                message: `<${tag}> is not resolved — no component package exports it and no project component declares it. The custom element will not be registered.${meant ? ` Did you mean <${meant}>?` : ''}`,
                hint: `Add an export for it in the owning package's package.json, or import the module that defines it.`
                    + (options.searched ? ` Searched: ${options.searched().join(', ') || 'nothing'}.` : ''),
                ...(meant ? { suggestion: meant } : {}),
            });
        }
    }

    // ─── Check 4-ter: enum values the component does not declare ───
    if (options?.enumValues) checkEnumValues(ast, options.enumValues, warnings);

    // ─── Check 5: Empty @for bodies ────────────────────────────────

    checkEmptyLoops(ast, warnings);

    // ─── Check 6: @form without submit handler ─────────────────────

    const templateHtml = htmlOf(ast);
    for (const f of analysis.forms) {
        const hasSubmitHandler = analysis.body.includes(`.handleSubmit(`) ||
                                 analysis.body.includes(`${f.name}.handleSubmit`);
        // A form handed to `<pdx-form :form="…">` must NOT wire one: that component validates and
        // emits `pdx-submit` itself (`pdx-form.ts:99-119`), so a `handleSubmit` beside it would
        // validate twice.
        const handedToFormElement = new RegExp(
            `<pdx-form\\b[^>]*:form\\s*=\\s*["']\\s*${escapeForRegExp(f.name)}\\s*["']`,
        ).test(templateHtml);
        if (!hasSubmitHandler && !handedToFormElement) {
            warnings.push({
                code: 'PDX_FORM_NO_SUBMIT',
                severity: 'info',
                message: `Form '${f.name}' has no handleSubmit() call. Did you forget to wire form submission?`,
                hint: `Add: const handleSubmit = ${f.name}.handleSubmit(async (values) => { ... });`,
            });
        }
    }

    // ─── Check 7: @fetch without error handling in template ────────

    for (const f of analysis.fetches) {
        const hasErrorCheck = templateIds.has(f.name) && ast.some(node =>
            findInAST(node, n => n.type === 'if' && n.condition.includes('error'))
        );
        if (!hasErrorCheck && analysis.fetches.length > 0) {
            // Only info — not every fetch needs explicit error UI
            warnings.push({
                code: 'PDX_FETCH_NO_ERROR_UI',
                severity: 'info',
                message: `@fetch '${f.name}' has no error state handling in template.`,
                hint: `Consider adding: @if (${f.name}.state() === 'error') { <div>Error</div> }`,
            });
        }
    }

    // ─── Check 8: @await without @loading ──────────────────────────

    checkAwaitWithoutLoading(ast, warnings);

    // ─── Check 9: Circular $derived dependencies ─────────────────

    checkCircularDerived(analysis, warnings);

    // ─── Check 10: @expose references undeclared names ──────────

    for (const name of analysis.exposes) {
        if (!allDeclaredNames.has(name)) {
            warnings.push({
                code: 'PDX_EXPOSE_UNDECLARED',
                severity: 'error',
                message: `@expose references '${name}' which is not declared in this component.`,
                hint: `Declare it first: let ${name} = $signal(...); or function ${name}() { ... }`,
            });
        }
    }

    // ─── Check 11: @prop default type mismatch ──────────────────

    for (const p of analysis.props) {
        if (p.default !== undefined) {
            const mismatch = checkPropDefaultType(p.tsType, p.default);
            if (mismatch) {
                warnings.push({
                    code: 'PDX_PROP_TYPE_MISMATCH',
                    severity: 'warn',
                    message: `@prop '${p.name}' is typed as '${p.tsType}' but default value '${p.default}' looks like ${mismatch}.`,
                    hint: `Change the type to match the default (@prop ${p.name}: ${mismatch.replace(/^an? /, '')} = ${p.default}), or give a '${p.tsType}' default.`,
                });
            }
        }
    }

    // ─── Check 13: Raw ${...} interpolation in template (rule #7) ──
    // `:attr=` is the binding syntax; `${...}` inside attributes or text is a common mistake
    // (it is NOT reactive in the template). Warn so authors switch to {{ }} or :attr binding.
    checkRawInterpolation(ast, warnings);

    // ─── Check 12: @page path validation ────────────────────────

    if (analysis.route.page) {
        const pathIssues = validateRoutePath(analysis.route.page);
        for (const issue of pathIssues) {
            warnings.push(issue);
        }
    }

    return warnings;
}

// ─── AST Helpers ──────────────────────────────────────────────────

function checkEmptyLoops(ast: TemplateNode[], warnings: ValidationWarning[]): void {
    for (const node of ast) {
        if (node.type === 'for' && node.body.length === 0) {
            warnings.push({
                code: 'PDX_EMPTY_FOR',
                severity: 'warn',
                message: `Empty @for loop body for '${node.items}'.`,
                hint: `Add content inside the @for block or remove it.`,
                ...(node.loc ? { line: node.loc.line, column: node.loc.column + 1 } : {}),
            });
        }
        // Recurse
        if (node.type === 'if') {
            checkEmptyLoops(node.body, warnings);
            if (node.elseBody) checkEmptyLoops(node.elseBody, warnings);
        }
        if (node.type === 'for') checkEmptyLoops(node.body, warnings);
    }
}

/**
 * Every piece of raw markup in the template, concatenated.
 *
 * The parser keeps elements as text — `HtmlNode.content` — and only the PDX blocks (`@if`, `@for`,
 * `@defer`…) become nodes. So a question about an ELEMENT is asked of this string, and the walk has
 * to enter every kind of block or a `<pdx-form>` inside an `@if` would be invisible.
 */
function htmlOf(nodes: TemplateNode[]): string {
    let out = '';
    const walk = (list: TemplateNode[] | undefined): void => {
        for (const n of list ?? []) {
            if (n.type === 'html') { out += n.content; continue; }
            const branches = n as unknown as Record<string, TemplateNode[] | undefined>;
            for (const key of ['body', 'elseBody', 'loading', 'errorBody', 'placeholder', 'fallback', 'cases']) {
                const branch = branches[key];
                if (Array.isArray(branch)) walk(branch as TemplateNode[]);
            }
        }
    };
    walk(nodes);
    return out;
}

function findInAST(node: TemplateNode, predicate: (n: TemplateNode) => boolean): boolean {
    if (predicate(node)) return true;
    if (node.type === 'if') {
        return node.body.some(n => findInAST(n, predicate)) ||
               (node.elseBody?.some(n => findInAST(n, predicate)) ?? false);
    }
    if (node.type === 'for') return node.body.some(n => findInAST(n, predicate));
    if (node.type === 'await') {
        return node.body.some(n => findInAST(n, predicate)) ||
               (node.loading?.some(n => findInAST(n, predicate)) ?? false) ||
               (node.errorBody?.some(n => findInAST(n, predicate)) ?? false);
    }
    return false;
}

/** Warn if @await is used without @loading — the user probably wants a loading state. */
function checkAwaitWithoutLoading(ast: TemplateNode[], warnings: ValidationWarning[]): void {
    for (const node of ast) {
        if (node.type === 'await' && !node.loading) {
            warnings.push({
                code: 'PDX_AWAIT_NO_LOADING',
                severity: 'info',
                message: `@await without @loading block. Users will see nothing while waiting.`,
                hint: `Add @loading { <skeleton /> } after the @await block to show a placeholder.`,
                ...(node.loc ? { line: node.loc.line, column: node.loc.column + 1 } : {}),
            });
            // Recurse into body
            checkAwaitWithoutLoading(node.body, warnings);
            if (node.errorBody) checkAwaitWithoutLoading(node.errorBody, warnings);
        }
        // Recurse into sub-nodes
        if (node.type === 'if') {
            checkAwaitWithoutLoading(node.body, warnings);
            if (node.elseBody) checkAwaitWithoutLoading(node.elseBody, warnings);
        }
        if (node.type === 'for') checkAwaitWithoutLoading(node.body, warnings);
        if (node.type === 'await' && node.loading) {
            checkAwaitWithoutLoading(node.body, warnings);
            checkAwaitWithoutLoading(node.loading, warnings);
            if (node.errorBody) checkAwaitWithoutLoading(node.errorBody, warnings);
        }
    }
}

/**
 * The names an expression reads: its identifiers, walked on the TypeScript AST. A property name
 * (`currentParams().tag`, `obj?.tag`), an object key (`{ tag: 1 }`) and a string are not references.
 * A regex over the text counts all three, so `currentParams().tag` would "read" a derived named `tag`.
 */
function referencedNames(expr: string): Set<string> {
    const names = new Set<string>();
    const sf = ts.createSourceFile('derived.ts', `(${expr});`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node)) {
            const p = node.parent;
            const isName = (ts.isPropertyAccessExpression(p) && p.name === node)
                || (ts.isPropertyAssignment(p) && p.name === node)
                || (ts.isMethodDeclaration(p) && p.name === node);
            if (!isName) names.add(node.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return names;
}

/**
 * Detect circular $derived dependencies: a → b → a. Only the deriveds ON a cycle are reported, each
 * once, and the message names the cycle. A derived that can merely REACH a cycle is not reported as
 * being on it.
 */
function checkCircularDerived(analysis: ScriptAnalysis, warnings: ValidationWarning[]): void {
    const derivedNames = new Set(analysis.deriveds.map(d => d.name));
    const deps = new Map<string, string[]>();
    for (const d of analysis.deriveds) {
        deps.set(d.name, [...referencedNames(d.expr)].filter(n => derivedNames.has(n) && n !== d.name));
    }
    const state = new Map<string, 'visiting' | 'done'>();
    const path: string[] = [];
    const reported = new Set<string>();
    const visit = (name: string): void => {
        state.set(name, 'visiting');
        path.push(name);
        for (const dep of deps.get(name) ?? []) {
            if (state.get(dep) === 'visiting') {
                const cycle = [...path.slice(path.indexOf(dep)), dep];
                for (const member of cycle.slice(0, -1)) {
                    if (reported.has(member)) continue;
                    reported.add(member);
                    warnings.push({
                        code: 'PDX_CIRCULAR_DERIVED',
                        severity: 'error',
                        message: `Circular dependency detected: $derived '${member}' references itself through other deriveds: ${cycle.join(' → ')}.`,
                        hint: `Break the cycle by using a $signal instead of $derived for one of the variables.`,
                    });
                }
            } else if (!state.has(dep)) {
                visit(dep);
            }
        }
        path.pop();
        state.set(name, 'done');
    };
    for (const d of analysis.deriveds) if (!state.has(d.name)) visit(d.name);
}

/** Check if a @prop default value type-mismatches its declared type. */
function checkPropDefaultType(tsType: string, defaultVal: string): string | null {
    const t = tsType.trim().toLowerCase();
    const v = defaultVal.trim();
    // string type but default is a number literal
    if (t === 'string' && /^\d+(\.\d+)?$/.test(v)) return 'a number';
    // number type but default is a string literal
    if (t === 'number' && /^['"]/.test(v)) return 'a string';
    // boolean type but default is string/number
    if (t === 'boolean' && v !== 'true' && v !== 'false' && v !== 'undefined' && v !== 'null') return `'${v}'`;
    return null;
}

/** Validate @page route path syntax. */
function validateRoutePath(path: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    if (!path.startsWith('/')) {
        warnings.push({
            code: 'PDX_PAGE_INVALID_PATH',
            severity: 'error',
            message: `@page path '${path}' must start with '/'.`,
            hint: `Change to: @page '/${path}';`,
        });
    }
    // Check param constraints
    const validConstraints = new Set(['string', 'number', 'uuid', 'slug']);
    for (const { name, constraint } of routeParams(path)) {
        if (constraint !== undefined && !validConstraints.has(constraint)) {
            warnings.push({
                code: 'PDX_PAGE_INVALID_CONSTRAINT',
                severity: 'warn',
                message: `Param constraint '${constraint}' on ':${name}' is not a known type.`,
                hint: `Valid constraints: ${[...validConstraints].join(', ')}.`,
            });
        }
        if (constraint === '') {
            warnings.push({
                code: 'PDX_PAGE_EMPTY_CONSTRAINT',
                severity: 'error',
                message: `Empty param constraint on ':${name}()' — did you forget the type?`,
                hint: `Use: :${name}(number) or remove the parentheses.`,
            });
        }
    }
    return warnings;
}

/**
 * The values of bound attributes (`:x`, `::x`, `@x`) in a piece of markup, as [from, to) offsets
 * into it, and an error for each that holds a `${` outside a template literal.
 *
 * A bound value is already an expression: `:label="${x}"` has one meaning, `:label="x"`, and the
 * binding codegen writes it into the module as it is — JavaScript that does not parse, which kills
 * the build in rollup. A `${` inside backticks (`:class="\`btn-${size}\`"`) is a template
 * literal of the expression, and fine.
 */
function checkBoundValues(content: string, loc: SourceLoc | undefined, warnings: ValidationWarning[]): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    // Match: a bound attribute with a quoted value. Groups: [1]=name [2]=double-quoted [3]=single-quoted
    const attr = /(?<=[\s<])((?:::|:|@)[\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = attr.exec(content)) !== null) {
        const value = m[2] ?? m[3] ?? '';
        const valueStart = m.index + m[0].length - value.length - 1;
        ranges.push([valueStart, valueStart + value.length]);
        let backticks = 0;
        for (let i = 0; i < value.length - 1; i++) {
            if (value[i] === '`') backticks++;
            if (value[i] !== '$' || value[i + 1] !== '{' || backticks % 2 === 1 || value[i - 1] === '\\') continue;
            const close = value.indexOf('}', i);
            const inner = value.slice(i + 2, close < 0 ? undefined : close).trim();
            const pos = loc ? offsetToLineColumn(content, valueStart + i, loc) : undefined;
            warnings.push({
                code: 'PDX_RAW_INTERPOLATION_IN_BINDING',
                severity: 'error',
                message: `'${m[1]}' is bound, so its value is already an expression: '\${${inner}}' in it does not compile.`,
                hint: `Write ${m[1]}="${inner}".`,
                ...(pos ?? {}),
            });
            break;
        }
    }
    return ranges;
}

/**
 * Walk the AST and warn on raw `${...}` interpolation inside HTML node content — either in an
 * attribute value or in text. This is the documented PDX_RAW_INTERPOLATION diagnostic (rule #7):
 * `${}` is not reactive in templates; use {{ expr }} for text or `:attr="expr"` for attributes.
 */
function checkRawInterpolation(nodes: TemplateNode[], warnings: ValidationWarning[]): void {
    const seen = new Set<string>();
    const walk = (list: TemplateNode[]): void => {
        for (const node of list) {
            // An @raw block is text as written: a `${` in it is shown, not interpolated.
            if (node.type === 'html' && !node.raw) {
                const bound = checkBoundValues(node.content, node.loc, warnings);
                // Match ${ ... } occurrences (template-literal interpolation leaking into markup).
                // Negative lookbehind for `\` — an author's `\${` is escaped on purpose.
                const re = /(?<!\\)\$\{[^}]*\}/g;
                let m: RegExpExecArray | null;
                while ((m = re.exec(node.content)) !== null) {
                    // Inside a bound value it is an expression's business: checkBoundValues judged it.
                    const at = m.index;
                    if (bound.some(([from, to]) => at >= from && at < to)) continue;
                    const snippet = m[0];
                    if (seen.has(snippet)) continue;
                    seen.add(snippet);
                    // Resolve source position: node.loc points at the html node's start; add the
                    // newlines/columns consumed up to the match offset inside node.content.
                    const pos = node.loc ? offsetToLineColumn(node.content, m.index, node.loc) : undefined;
                    warnings.push({
                        code: 'PDX_RAW_INTERPOLATION',
                        severity: 'warn',
                        message: `Raw '${snippet}' in template is not reactive. Use {{ ... }} for text, or :attr="..." for attributes.`,
                        hint: `Replace '${snippet}' with {{ ${snippet.slice(2, -1).trim()} }} (text) or bind via :attr="${snippet.slice(2, -1).trim()}".`,
                        ...(pos ?? {}),
                    });
                }
            }
            // Recurse into block-directive bodies that carry HTML children.
            switch (node.type) {
                case 'if': walk(node.body); if (node.elseBody) walk(node.elseBody); break;
                case 'for': walk(node.body); if (node.emptyBody) walk(node.emptyBody); break;
                case 'switch': for (const c of node.cases) walk(c.body); if (node.defaultBody) walk(node.defaultBody); break;
                case 'require': walk(node.body); if (node.elseBody) walk(node.elseBody); break;
                case 'show': walk(node.body); break;
                case 'portal': walk(node.body); break;
                case 'defer': walk(node.body); if (node.placeholder) walk(node.placeholder); if (node.loading) walk(node.loading); if (node.error) walk(node.error); break;
                case 'try': walk(node.body); walk(node.catchBody); break;
                case 'await': walk(node.body); if (node.loading) walk(node.loading); if (node.errorBody) walk(node.errorBody); break;
                case 'slot-template': walk(node.body); break;
                case 'custom-directive': walk(node.body); break;
            }
        }
    };
    walk(nodes);
}

// ─── Template Identifier Extraction ────────────────────────────────

/**
 * Walk the template AST and collect all bare identifiers from expressions.
 * Excludes: loop variables, arrow params, globals, JS keywords, string contents.
 *
 * `declared` are the names the component's script declares. A GLOBAL is a name the template may
 * use WITHOUT the component declaring it; one the component does declare is the component's and
 * shadows it. The validators are in GLOBALS, so a variable named `email`, `url` or `min` read in
 * its own template would count as unused and never be checked for reactivity.
 */
export function collectTemplateIdentifiers(ast: TemplateNode[], declared: ReadonlySet<string> = new Set()): Set<string> {
    const ids = new Set<string>();
    const loopVars = new Set<string>();
    walkNodes(ast, ids, loopVars);
    for (const lv of loopVars) ids.delete(lv);
    for (const g of GLOBALS) if (!declared.has(g)) ids.delete(g);
    return ids;
}

function walkNodes(
    nodes: TemplateNode[],
    ids: Set<string>,
    loopVars: Set<string>
): void {
    for (const node of nodes) {
        switch (node.type) {
            case 'interpolation':
                extractIdentifiers(node.expr, ids);
                for (const p of node.pipes) extractIdentifiers(p, ids);
                break;
            case 'if':
                extractIdentifiers(node.condition, ids);
                walkNodes(node.body, ids, loopVars);
                if (node.elseBody) walkNodes(node.elseBody, ids, loopVars);
                break;
            case 'for':
                extractIdentifiers(node.items, ids);
                loopVars.add(node.item);
                // The index of `@for (items as item, i; …)` is the loop's too, and `@empty` is
                // template like the body.
                if (node.index) loopVars.add(node.index);
                walkNodes(node.body, ids, loopVars);
                if (node.emptyBody) walkNodes(node.emptyBody, ids, loopVars);
                break;
            case 'let':
                // `@let total = a + b;` reads `a` and `b`, and names `total` for the template.
                extractIdentifiers(node.expr, ids);
                loopVars.add(node.name);
                break;
            case 'custom-directive':
                extractIdentifiers(node.expr, ids);
                walkNodes(node.body, ids, loopVars);
                break;
            case 'switch':
                extractIdentifiers(node.expr, ids);
                for (const c of node.cases) walkNodes(c.body, ids, loopVars);
                if (node.defaultBody) walkNodes(node.defaultBody, ids, loopVars);
                break;
            case 'require':
                walkNodes(node.body, ids, loopVars);
                if (node.elseBody) walkNodes(node.elseBody, ids, loopVars);
                break;
            case 'show':
                extractIdentifiers(node.condition, ids);
                walkNodes(node.body, ids, loopVars);
                break;
            case 'portal':
                walkNodes(node.body, ids, loopVars);
                break;
            case 'defer':
                walkNodes(node.body, ids, loopVars);
                if (node.placeholder) walkNodes(node.placeholder, ids, loopVars);
                if (node.loading) walkNodes(node.loading, ids, loopVars);
                if (node.error) walkNodes(node.error, ids, loopVars);
                break;
            case 'await':
                extractIdentifiers(node.condition, ids);
                walkNodes(node.body, ids, loopVars);
                if (node.loading) walkNodes(node.loading, ids, loopVars);
                if (node.errorBody) {
                    if (node.errorVar) loopVars.add(node.errorVar);
                    loopVars.add(node.retryVar ?? 'retry');
                    walkNodes(node.errorBody, ids, loopVars);
                }
                break;
            case 'try':
                // Without this, every read inside @try { … } @catch { … } goes uncounted, and a
                // signal used only there is reported "declared but not used".
                walkNodes(node.body, ids, loopVars);
                loopVars.add(node.errorVar);
                loopVars.add(node.retryVar);
                walkNodes(node.catchBody, ids, loopVars);
                break;
            case 'html':
                extractHtmlBindingIds(node.content, ids);
                break;
            case 'slot-template':
                // The content a page hands to a CHILD is still the page's template, and the signals
                // it reads there are read. Without this case, `<slot name="empty" let:_>` would hide
                // every identifier inside it and the page would be told its own variables were dead.
                // `scopeVars` are the CHILD's — `let:row` names a value the child
                // supplies — so they are treated exactly as a loop variable is: seen, then removed.
                for (const v of node.scopeVars) loopVars.add(v);
                walkNodes(node.body, ids, loopVars);
                break;
        }
    }
}

function extractIdentifiers(expr: string, ids: Set<string>): void {
    let pos = 0;
    const localVars = new Set<string>();

    while (pos < expr.length) {
        const ch = expr[pos];

        // Skip strings, template literals, comments using shared tokenizer
        const skip = skipNonCode(expr, pos);
        if (skip !== null) { pos = skip; continue; }

        if (ch === '(' && expr.includes('=>', pos)) {
            const closeIdx = findClosing(expr, pos);
            if (closeIdx > pos && expr.slice(closeIdx + 1).trimStart().startsWith('=>')) {
                const params = expr.slice(pos + 1, closeIdx);
                for (const p of params.split(',')) {
                    const name = p.trim().replace(/[=:].*/, '').replace(/[{}[\]]/g, '').trim();
                    if (name && /^[a-zA-Z_$][\w$]*$/.test(name)) localVars.add(name);
                }
            }
        }

        if (/[a-zA-Z_$]/.test(ch)) {
            const start = pos;
            while (pos < expr.length && /[\w$]/.test(expr[pos])) pos++;
            const id = expr.slice(start, pos);

            const prevChar = start > 0 ? expr[start - 1] : '';
            const before = expr.slice(0, start).trimEnd().slice(-1);
            const after = expr.slice(pos).trimStart();
            // `e => …`: the parameter of an arrow function with no parentheses is the expression's
            // own name, like the parenthesised ones above.
            if (after.startsWith('=>')) { localVars.add(id); continue; }
            // `{ key: value }`: a key is not a read. A ternary's `a ? b : c` is — its `b` follows `?`.
            if ((before === '{' || before === ',') && after.startsWith(':') && !after.startsWith('::')) continue;
            // GLOBALS are not dropped here: `collectTemplateIdentifiers` drops the ones the
            // component does not declare, and only it knows which those are.
            if (prevChar !== '.' && !localVars.has(id)) {
                ids.add(id);
            }
            continue;
        }

        pos++;
    }
}

function extractHtmlBindingIds(html: string, ids: Set<string>): void {
    // Match: a binding attribute `:name="expr"` / `@name='expr'` — the name may carry `-` and `.`
    // (`:active-key`, `@click.prevent`). Groups: [1]=double-quoted expr [2]=single-quoted expr.
    // Without the `-`, every read in a hyphenated binding would be invisible.
    // After whitespace: `xmlns:xlink="http://…"` and `xlink:href="#x"` are namespaced attributes,
    // not bindings, and their values are not expressions.
    const bindingRegex = /(?<=\s)(?:::|[:@])[\w.-]*=(?:"([^"]*?)"|'([^']*?)')/g;
    // Only inside a real opening tag. Code shown on a page is escaped — `&lt;pdx-x :items="items"&gt;`
    // is text — and its `:items="items"` binds nothing.
    // Each `<tag …>` with its quoted values, which may hold `>` (`e => …`). Scanned, not matched (#70).
    for (const tag of openingTagTexts(html)) {
        let match;
        while ((match = bindingRegex.exec(tag)) !== null) {
            const expr = match[1] ?? match[2];
            if (expr) extractIdentifiers(expr, ids);
        }
    }
}

// findCloseParen and skipString removed — using findClosing/skipNonCode from tokenizer.ts

const GLOBALS = new Set([
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
    'if', 'else', 'for', 'while', 'return', 'const', 'let', 'var', 'function',
    'new', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of', 'this',
    'Math', 'Date', 'JSON', 'console', 'window', 'document', 'globalThis',
    'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'WeakMap', 'WeakSet',
    'Promise', 'Error', 'RegExp', 'Symbol', 'BigInt',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch',
    'signal', 'computed', 'effect', 'batch', 'ref', 'html', 'component',
    'when', 'each', 'match', 'pipe', 'show', 'portal', 'defer', 'dynamic',
    'resource', 'mutation', 'linkedSignal', 'createForm', 'createBus',
    'required', 'minLength', 'maxLength', 'email', 'pattern', 'url', 'min', 'max',
    '$t', '$n', '$d', '$r',
    'ctx',
]);
