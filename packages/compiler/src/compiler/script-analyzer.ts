// Script Analyzer — parses <script> with decorator+rune syntax.
// Extracts: @prop, @event, @slot, $signal, $derived, $effect, lifecycle hooks.
// Scans top-level declarations for auto-expose.
// Also detects malformed declarations and emits warnings.

import type { ValidationWarning } from './validate';
import type {
    PropInfo, EventInfo, SlotInfo, SignalDecl, DerivedDecl, ExportDecl,
    StoreDecl, WatchDecl, FetchDecl, FormDecl, FormFieldDecl, RouteInfo,
    GlobalStoreDirective, HeadInfo, I18nInfo, ProvideDecl, InjectDecl, ScriptAnalysis, StateDecl, HostAttr,
    ScriptSnippet, ActionInfo,
} from './script-analyzer-types';
import { parseHostBlock } from './host-block';
import { parseVariantsBlock, variantProps, variantHostAttrs, type VariantAxis } from './variants';
import { DEFAULT_TAG_PREFIX, RESERVED_TAG_PREFIX } from './tag-prefix';
import {
    tsToRuntimeType, extractCallBody, splitWatchArgs, extractBlock,
    parseInlineFormSchema, parseFormOptions, parsePageOptions, parseSearchParams, normalizeStatementsWithOrigins,
    extractTypeAnnotation, parseFetchDecl, fetchOptionKeys, FETCH_OPTION_KEYS, PREFETCH_POLICIES, extractSearchBlock,
    parseRouteParams, splitAtTopLevelCommas, invalidRouteFields, PAGE_OPTIONS,
    routeTitleOf,
} from './script-analyzer-helpers';
import { readLoaderOptions } from './loader-options';
import { maskNonCode, skipNonCode, findClosing } from './tokenizer';
import { importedLocalNames } from './import-names';
import { coreRuntimeNames } from './core-import-names';
import { destructuredNames } from './destructured-names';
import { RUNE_CALL, readDeclarators } from './rune-declarations';
import { misplacedRunes } from './validate-rune-position';
import { DECORATOR_RUNES } from './runes';
import { liftStoreExports } from './store-exports';
import { readActionDecl, actionOptionProblems, actionAgentOptions, compileAction, ACTION_OPTIONS, ACTION_CONCURRENCY } from './action-decl';
import { readDeclarationsOntoOneLine } from './declaration-reading';

// Re-export all types so existing imports from './script-analyzer' continue to work.
export * from './script-analyzer-types';

/**
 * Conservative check for an obviously-malformed TS type annotation (C4).
 * Flags only: empty, unbalanced <> [] {} (), or a dangling separator/opener at the
 * end. Deliberately NOT a full TS parser — must never false-positive on valid
 * generics, unions, or function types (handles `=>` and string literals).
 */
function isMalformedTsType(type: string): boolean {
    const t = type.trim();
    if (!t) return true;
    const open: Record<string, string> = { '<': '>', '[': ']', '{': '}', '(': ')' };
    const closers = new Set(['>', ']', '}', ')']);
    const stack: string[] = [];
    let inStr: string | null = null;
    for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (inStr) { if (ch === inStr && t[i - 1] !== '\\') inStr = null; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === '>' && t[i - 1] === '=') continue; // arrow `=>`, not a closer
        if (ch in open) stack.push(open[ch]);
        else if (closers.has(ch)) { if (stack.pop() !== ch) return true; }
    }
    if (stack.length > 0 || inStr) return true;
    // Dangling separator/opener at the end (e.g. `string |`, `Foo<`).
    return /[|&,<([{]\s*$/.test(t);
}

/**
 * Every declaration keyword this analyzer knows, with the shape it accepts.
 *
 * A line opening with one of these and matching no rule below is reported, not pushed into the setup
 * body as if it were code: `@` starts nothing valid in JavaScript, so the module would fail to parse
 * with `Syntax error in <script>: Declaration expected.` — a TypeScript parser's opinion of a
 * line the author wrote as a framework declaration, naming neither the keyword nor what it expected.
 *
 * The shape is the hint. It lives in the one rune list (`runes.ts`), which the editor
 * reads too, so the analyzer and the editor cannot disagree on what a declaration is.
 */
const DECLARATION_SHAPES: Record<string, string> = Object.fromEntries(
    [...DECORATOR_RUNES.values()].map(r => [r.name, r.shape]),
);

// Match: a route or head declaration the beta removed (#277) — `@route`, `@alias`, `@prefetch`,
// `@head`, the script's `@transition '…'`, and `@meta { … }` (route data; `@meta name: '…'` is the
// head form and stays).
const REMOVED_ROUTE_FORM = /^@(?:route|alias|prefetch|head)\b|^@transition\s+['"]|^@meta\s*\{/;

/**
 * PDX_ROUTE_FIELD_INVALID for each field of a `@params` / `@search` block its parser would skip.
 * The message quotes the field's name first, which is how position-warnings finds it; the hint is the
 * form the parser reads, when there is one.
 */
function routeFieldWarnings(block: string, kind: 'params' | 'search'): ValidationWarning[] {
    const types = kind === 'search' ? 'string, number or boolean' : 'a bare type name such as number or string';
    return invalidRouteFields(block, kind).map((f) => ({
        code: 'PDX_ROUTE_FIELD_INVALID',
        severity: 'error' as const,
        message: f.unquoted
            ? `@${kind} field '${f.name}' writes its type in quotes, which @${kind} does not read: the field is dropped. Write "${f.unquoted}".`
            : `@${kind} field ${f.name ? `'${f.name}'` : `"${f.text}"`} is not \`name: type\` with ${types}: the field is dropped.`,
        hint: f.unquoted ?? `@${kind} { ${kind === 'search' ? 'q?: string, page: number = 1' : 'id: number'} }`,
    }));
}

/**
 * The names a route's `@params` and `@search` hand to the template and the script, as exports of kind
 * `derived`: each param is a computed under its own name (#185), and `@search` declares `searchParams`,
 * a computed of the whole query (#204). Without the export the template's read was PDX_UNDECLARED_REF.
 */
function declareRouteNames(route: RouteInfo, exports: ExportDecl[]): void {
    const names = [...(route.params ?? []).map(p => p.name), ...(route.searchParams?.length ? ['searchParams'] : [])];
    for (const name of names) {
        if (!name.startsWith('_') && !exports.some(e => e.name === name)) exports.push({ name, kind: 'derived' });
    }
}

// ─── Analyzer ──────────────────────────────────────────────────────

/**
 * Analyze a `<script>` block to extract structure (props, events, slots)
 * and reactive declarations (signals, derived, effects).
 *
 * The script has one grammar (#158): every script is read for declarations and runes.
 *
 * @param script - Raw content of the script block
 * @param filename - Source filename (for debug naming)
 * @returns Complete analysis used by codegen to produce the final JS module
 */
export function analyzeScript(script: string, _filename: string, options: { originBase?: number; lineBase?: number } = {}): ScriptAnalysis {
    // Normalize compact single-line scripts: split statements to separate lines
    // so that line-based regex matching works for agent-generated compact code.
    const { text: compact, lineOrigins } = normalizeStatementsWithOrigins(script);
    // One reading rule (#524): a declaration that opens a block on its first line is read to the end
    // of that block, onto that line, before any rune's parser sees it.
    const { lines, consumed: readOntoAnother } = readDeclarationsOntoOneLine(compact.split('\n'));
    const normalized = lines.join('\n');
    // Where line i was written in the .pdx, when the caller wants a source map.
    const originBase = options.originBase;
    const originOf = (i: number): number | null =>
        originBase === undefined || lineOrigins[i] == null ? null : originBase + (lineOrigins[i] as number);
    // The .pdx line of line i, when the caller says on which line the script starts.
    const pdxLineOf = (i: number): number | null => {
        const at = lineOrigins[i];
        if (options.lineBase === undefined || at == null) return null;
        let line = options.lineBase;
        for (let k = 0; k < at; k++) if (script.charCodeAt(k) === 10) line++;
        return line;
    };
    const effectLines: (number | null)[] = [];
    const watchLines: (number | null)[] = [];
    // Brace depth at the START of each line (string/comment-aware). Used to auto-export ONLY
    // top-level (depth 0) const/let declarations — a `const` nested in an if/try/arrow block is
    // block-scoped and would throw ReferenceError if put in the auto-return. Multi-line
    // constructs (functions, runes) are balanced, so the global running depth stays consistent
    // even though the loop skips their inner lines.
    const setupDepthAt: number[] = [];
    {
        let d = 0;
        for (const l of lines) {
            setupDepthAt.push(d);
            for (let j = 0; j < l.length; j++) {
                const skip = skipNonCode(l, j);
                if (skip !== null) { j = skip - 1; continue; }
                if (l[j] === '{') d++;
                else if (l[j] === '}') d--;
            }
        }
    }
    // Code-only view (strings/comments blanked): a `@` inside a comment or string is not a declaration.
    const codeLines = maskNonCode(normalized).split('\n');
    const props: PropInfo[] = [];
    const events: EventInfo[] = [];
    const slots: SlotInfo[] = [];
    const snippets: ScriptSnippet[] = [];
    const actions: ActionInfo[] = [];
    const generics: string[] = [];
    const signals: SignalDecl[] = [];
    const deriveds: DerivedDecl[] = [];
    const effects: string[] = [];
    const emits: string[] = [];
    const onMountBodies: string[] = [];
    const onDestroyBodies: string[] = [];
    const exports: ExportDecl[] = [];
    const userImports: string[] = [];
    const coreImportNames: string[] = [];
    const importedNames: string[] = [];
    const usedFeatures = new Set<string>();
    const stores: StoreDecl[] = [];
    const watches: WatchDecl[] = [];
    const fetches: FetchDecl[] = [];
    const forms: FormDecl[] = [];
    const exposes: string[] = [];
    const states: StateDecl[] = [];
    let host: HostAttr[] | undefined;
    const variants: VariantAxis[] = [];
    const parts: string[] = [];
    const route: RouteInfo = {};
    let globalStore: GlobalStoreDirective | undefined;
    let customTag: string | undefined;
    let i18nInfo: I18nInfo | undefined;
    const head: HeadInfo = { meta: [] };
    const provides: ProvideDecl[] = [];
    const injects: InjectDecl[] = [];
    // Each @provide / @inject as written, with its token: checked against the imports after the loop.
    const contextLines: { token: string; text: string; rune: 'provide' | 'inject' }[] = [];
    const bodyLines: string[] = [];
    // One origin per LINE of the body, in order: a pushed entry may hold several lines.
    const bodyLineOrigins: (number | null)[] = [];
    /** Push an entry to the body; its lines come from line `first` on, one by one when `consecutive`. */
    const pushBody = (text: string, first: number, consecutive = false) => {
        bodyLines.push(text);
        text.split('\n').forEach((_l, k) => bodyLineOrigins.push(k === 0 ? originOf(first) : consecutive ? originOf(first + k) : null));
    };
    // The same, for the extracted call bodies: the first line is the call's, the next ones follow.
    const callOrigins = (first: number, content: string): (number | null)[] => {
        const end = first + content.split('\n').length;
        const full = lines.slice(first, end + 1).join('\n');
        const at = full.indexOf(content.split('\n')[1] ?? '\u0000');
        const second = at < 0 ? -1 : first + full.slice(0, at).split('\n').length - 1;
        return content.split('\n').map((_l, k) => k === 0 ? originOf(first) : second < 0 ? null : originOf(second + k - 1));
    };
    const effectOrigins: (number | null)[][] = [];
    const watchOrigins: (number | null)[][] = [];
    const mountOrigins: (number | null)[][] = [];
    const destroyOrigins: (number | null)[][] = [];
    const RAW_MARKER = '/*@raw*/'; // marker prepended to raw lines to skip rewriting
    const warnings: ValidationWarning[] = [];

    for (let i = 0; i < lines.length; i++) {
        // A line read onto its declaration's first line (#524): what it held is there now.
        if (readOntoAnother.has(i)) continue;
        const line = lines[i];
        const trimmed = line.trim();

        // i18n helpers: detect $t()/$n()/$d()/$r() on ALL lines (before continue statements)
        if (trimmed.includes('$t(')) usedFeatures.add('$t');
        if (trimmed.includes('$n(')) usedFeatures.add('$n');
        if (trimmed.includes('$d(')) usedFeatures.add('$d');
        if (trimmed.includes('$r(')) usedFeatures.add('$r');

        // ─── Imports ───
        if (trimmed.startsWith('import ') || trimmed === 'import') {
            // An import may span multiple lines (`import {\n a,\n b\n} from 'x';`). Accumulate
            // until the statement is complete, then flatten to a single line — downstream
            // consumers (and the `{…}` core-import extraction) expect one-line imports.
            let stmt = line;
            while (!isCompleteImport(stmt) && i + 1 < lines.length) {
                i++;
                stmt += '\n' + lines[i];
            }
            const flat = stmt.replace(/\s+/g, ' ').trim();
            importedNames.push(...importedLocalNames(flat));
            if (flat.includes('@pdxui/core')) {
                coreImportNames.push(...coreRuntimeNames(flat));
            } else {
                userImports.push(flat);
            }
            continue;
        }

        // A leading `@` that is inside a comment or string (masked view does NOT start with
        // `@`) is NOT a directive — e.g. `/* @page '/x' */`. Pass it through as body so the
        // commented-out directive is never processed.
        if (trimmed.startsWith('@') && !codeLines[i].trim().startsWith('@')) {
            pushBody(line, i);
            continue;
        }

        // ─── @raw { ... } — escape hatch, skip signal rewriting ───
        if (trimmed.startsWith('@raw') && trimmed.includes('{')) {
            let depth = 0;
            for (const ch of trimmed) { if (ch === '{') depth++; if (ch === '}') depth--; }
            const firstContent = trimmed.replace(/^@raw\s*\{/, '').trim();
            if (depth <= 0 && firstContent) {
                pushBody(`${RAW_MARKER}    ${firstContent.replace(/\}\s*$/, '')}`, i);
            } else {
                if (firstContent) pushBody(`${RAW_MARKER}    ${firstContent}`, i);
                while (depth > 0 && i + 1 < lines.length) {
                    i++;
                    const rawTrimmed = lines[i].trim();
                    for (const ch of rawTrimmed) { if (ch === '{') depth++; if (ch === '}') depth--; }
                    if (depth <= 0) {
                        const content = rawTrimmed.replace(/\}\s*$/, '');
                        if (content) pushBody(`${RAW_MARKER}    ${content}`, i);
                    } else {
                        pushBody(`${RAW_MARKER}${lines[i]}`, i);
                    }
                }
            }
            continue;
        }

        // ─── @snippet name(params) { template } — reusable template block ───
        const snippetMatch = trimmed.match(/^@snippet\s+(\w+)\s*\(([^)]*)\)/);
        if (snippetMatch) {
            const [, snippetName, params] = snippetMatch;
            const snippetAt = i;
            // Collect the block body (template HTML)
            let depth = 0;
            const snippetLines: string[] = [];
            // Find opening {
            for (const ch of trimmed) { if (ch === '{') depth++; if (ch === '}') depth--; }
            // On one line, `@snippet x(a) { <b>{{ a }}</b> }`: the body is between its braces.
            const open = trimmed.indexOf('{', snippetMatch[0].length);
            if (depth === 0 && open !== -1) snippetLines.push(trimmed.slice(open + 1, trimmed.lastIndexOf('}')).trim());
            while (depth > 0 && i + 1 < lines.length) {
                i++;
                const sl = lines[i].trim();
                for (const ch of sl) { if (ch === '{') depth++; if (ch === '}') depth--; }
                if (depth <= 0) {
                    const content = sl.replace(/\}\s*$/, '');
                    if (content) snippetLines.push(content);
                } else {
                    snippetLines.push(lines[i]);
                }
            }
            const snippetBody = snippetLines.join('\n');
            // A template body (#489, decision 9) is compiled with the component's template, where
            // `{{ }}`, bindings and blocks are read. A `${arg}` body is the alpha form, an html``
            // literal, which keeps working until `pdx migrate` turns it into `{{ arg }}` (#131).
            if (!snippetBody.includes('${')) {
                // Each parameter's name, without its type: `name: string` → `name`.
                const names = splitAtTopLevelCommas(params).map(p => p.split(':')[0].trim()).filter(Boolean);
                snippets.push({ name: snippetName, params: names, body: snippetBody, line: snippetAt });
                continue;
            }
            // The alpha form: a function that returns an html`` template
            pushBody(`    function ${snippetName}(${params}) { return html\`${snippetBody}\`; }`, snippetAt);
            exports.push({ name: snippetName, kind: 'function' as const });
            usedFeatures.add('html');
            continue;
        }

        // ─── @action name(param) [when expr] [with { … }] { body } — a declared write (#501) ───
        if (/^@action\b/.test(trimmed)) {
            const actionAt = i;
            const action = readActionDecl(lines, codeLines, i);
            i = action.lastLine;
            if (!action.decl) {
                warnings.push({
                    code: 'PDX_UNKNOWN_DECLARATION',
                    severity: 'error' as const,
                    message: `"${trimmed}" is not a form of @action. It was dropped — nothing is generated for it.`,
                    hint: 'Use: @action name(param: Type) when condition with { invalidate: [...] } { … } — `when` and `with` are optional, and so is a last `{ signal }` parameter.',
                });
                continue;
            }
            const problems = action.decl.options ? actionOptionProblems(action.decl.options) : [];
            if (problems.length > 0) {
                warnings.push({
                    code: 'PDX_ACTION_UNKNOWN_OPTION',
                    severity: 'error' as const,
                    message: `\`@action ${action.decl.name}\`: ${problems.join('; ')}.`,
                    hint: `The options are ${ACTION_OPTIONS.join(', ')}; \`concurrency\` is ${ACTION_CONCURRENCY.map((c) => `'${c}'`).join(' | ')}.`,
                });
            }
            actions.push({ name: action.decl.name, inputType: action.decl.inputType, ...actionAgentOptions(action.decl.options) });
            pushBody(`    ${compileAction(action.decl)}`, actionAt);
            if (!action.decl.name.startsWith('_')) exports.push({ name: action.decl.name, kind: 'const' });
            usedFeatures.add('mutation');
            continue;
        }

        // ─── @use 'tag-name' from 'package' — external Web Component interop ───
        const useMatch = trimmed.match(/^@use\s+'([^']+)'\s+from\s+'([^']+)'/);
        if (useMatch) {
            const [, _tagName, pkg] = useMatch;
            // Generate side-effect import for the WC package
            userImports.push(`import '${pkg}';`);
            // Extract optional type hints: @use 'tag' from 'pkg' { props: {...}, events: {...} };
            // For now, just register the import — type hints are future work
            continue;
        }

        // ─── @prop name: Type = default · @prop name?: Type · @model name: Type = default ───
        // Tokenizer-based: handles generics (Map<K,V>), unions, function types, template literals.
        // A model (#124) is a prop the component may write, marked as such. A `@prop` with no default
        // and no `?` is required (#130), TypeScript's rule.
        // Match: `@prop name:`, `@prop name?:` or `@model name:`. Groups: [1]=rune [2]=name [3]=`?`
        const propPrefix = trimmed.match(/^@(prop|model)\s+(\w+)\s*(\?)?\s*:/);
        if (propPrefix) {
            const rune = propPrefix[1];
            const name = propPrefix[2];
            const optional = propPrefix[3] === '?';
            const colonPos = propPrefix[0].length - 1; // position of `:` in trimmed
            const { type: tsType, rest } = extractTypeAnnotation(trimmed, colonPos);
            if (tsType) {
                if (isMalformedTsType(tsType)) {
                    warnings.push({
                        code: 'PDX_PROP_INVALID_TYPE',
                        severity: 'warn',
                        message: `@${rune} '${name}' has a malformed type annotation: '${tsType}'. The generated .d.ts may be invalid.`,
                        hint: `Check for unbalanced <> [] {} () or a trailing | & , in the type.`,
                    });
                }
                let defaultVal: string | undefined;
                if (rest.startsWith('=')) {
                    defaultVal = rest.slice(1).replace(/;?\s*$/, '').trim();
                }
                props.push({
                    name,
                    tsType,
                    runtimeType: tsToRuntimeType(tsType),
                    default: defaultVal,
                    ...(rune === 'model' ? { model: true } : {}),
                    ...(rune === 'prop' && !optional && defaultVal === undefined ? { required: true } : {}),
                });
                continue;
            }
        }

        // Detect malformed @prop / @model — starts with the rune but missing type annotation
        const untyped = trimmed.match(/^@(prop|model)(?=\s|$)/);
        if (untyped) {
            const rune = untyped[1];
            const nameOnly = trimmed.match(/^@(?:prop|model)\s+(\w+)/);
            const hint = nameOnly
                ? `Use: @${rune} ${nameOnly[1]}: string = 'default';`
                : `Use: @${rune} name: Type = default;`;
            warnings.push({
                code: 'PDX_PROP_NO_TYPE',
                severity: 'error' as const,
                message: `Invalid @${rune} declaration: "${trimmed}". Missing type annotation.`,
                hint,
            });
            continue; // Don't push to bodyLines — it's a recognized (but malformed) decorator
        }

        // ─── @event name: PayloadType  /  @event(bubbles) name: PayloadType ───
        // Tokenizer-based for complex types like { old: T, new: T }
        // Match: `@event` or `@event(bubbles)`, then the name, then `:`, `;` or the end — the whole
        // name, an identifier. Without the lookahead `@event pdx-change: number;` declared an event
        // named `pdx` (#202). Groups: [1]=`(bubbles)` when written [2]=name
        const eventPrefix = trimmed.match(/^@event(\(\s*bubbles\s*\))?\s+(\w+)\s*(?=:|;|$)(?::\s*)?/);
        if (eventPrefix) {
            const name = eventPrefix[2];
            const nameEnd = trimmed.indexOf(name, '@event'.length + (eventPrefix[1]?.length ?? 0)) + name.length;
            const colonPos = trimmed.indexOf(':', nameEnd);
            const payloadType = colonPos >= 0 ? (extractTypeAnnotation(trimmed, colonPos).type || 'void') : 'void';
            events.push(eventPrefix[1] ? { name, payloadType, bubbles: true } : { name, payloadType });
            continue;
        }

        // `@event(…)` with an option that is not `bubbles` (#138): a known keyword in an unknown shape.
        if (trimmed.startsWith('@event(')) {
            // Match: the name after the parenthesis, to say the form with it. Groups: [1]=name
            const named = /\)\s*(\w+)/.exec(trimmed)?.[1] ?? 'name';
            warnings.push({
                code: 'PDX_UNKNOWN_DECLARATION',
                severity: 'error' as const,
                message: `\`${trimmed}\` is not a form of @event: the only option is \`(bubbles)\`.`,
                hint: `Use: @event(bubbles) ${named}: PayloadType; — or @event ${named}: PayloadType; for an event that stays on the component.`,
            });
            continue;
        }

        // Detect malformed @event
        if (trimmed.startsWith('@event') && trimmed !== '@event') {
            warnings.push({
                code: 'PDX_MALFORMED_EVENT',
                severity: 'error' as const,
                message: `Invalid @event declaration: "${trimmed}".`,
                hint: /^@event\s+[\w-]+-/.test(trimmed)
                    ? 'The name is an identifier, and it is both the emitter and the event: @event change: number; '
                        + 'dispatches `change`, and the function `change(value)` is how the component sends it.'
                    : `Use: @event eventName: PayloadType;`,
            });
            continue;
        }

        // ─── @generic T extends { id: string }, K; — the component's type parameters (#490) ───
        // Types only: the editor infers each from the props that use it. Nothing is generated. A list
        // with an entry that does not start with a name matches nothing here, and is
        // PDX_UNKNOWN_DECLARATION below.
        // Match: `@generic` and the list, up to its `;`. Groups: [1]=the list as written
        const genericDecl = trimmed.match(/^@generic\s([^;]*)/);
        if (genericDecl) {
            const entries = splitAtTopLevelCommas(genericDecl[1].trim()).map(g => g.trim());
            if (entries.length > 0 && entries.every(g => /^[A-Za-z_$][\w$]*(?:\s|$)/.test(g))) {
                generics.push(...entries);
                continue;
            }
        }

        // ─── @slot name: (signature); — a typed snippet the parent provides (#489) ───
        // Match: `@slot row: (item: T, index: number);`, `@slot row?: ();`. Groups: [1]=name [2]=`?`
        // [3]=the signature. A signature whose parentheses do not close matches nothing here, nor the
        // object form below, and is PDX_UNKNOWN_DECLARATION with the form as its hint.
        const slotSignature = trimmed.match(/^@slot\s+(\w+)\s*(\?)?\s*:\s*(\(.*\))\s*;?$/);
        if (slotSignature && findClosing(slotSignature[3], 0) === slotSignature[3].length - 1) {
            slots.push({ name: slotSignature[1], signature: slotSignature[3], required: slotSignature[2] === undefined });
            continue;
        }

        // ─── @slot name or @slot name: { ScopeType } ───
        // Tokenizer-based for scope types with generics: { item: Item<T> }
        if (trimmed.startsWith('@slot ') && !/^@slot\s+\w+\s*\??\s*:\s*\(/.test(trimmed)) {
            const slotPrefix = trimmed.match(/^@slot\s+(\w+)\s*(?::\s*)?/);
            if (slotPrefix) {
                const slotName = slotPrefix[1];
                const hasType = trimmed.indexOf(':') > trimmed.indexOf(slotName);
                if (hasType) {
                    const colonPos = trimmed.indexOf(':', trimmed.indexOf(slotName) + slotName.length);
                    const { type } = extractTypeAnnotation(trimmed, colonPos);
                    slots.push({ name: slotName, scopeType: type || undefined });
                } else {
                    slots.push({ name: slotName });
                }
                continue;
            }
        }

        // ─── @form name: SchemaExpr { options } (external schema + options block) ───
        // Match: @form orderForm: OrderSchema { save: 'onSubmit'; source: orderDs; }
        const formExternalWithOpts = trimmed.match(/^@form\s+(\w+)\s*:\s*(\w+)\s*\{/);
        if (formExternalWithOpts) {
            const name = formExternalWithOpts[1];
            const schemaExpr = formExternalWithOpts[2];
            const block = extractBlock(lines, i);
            const opts = parseFormOptions(block.content);
            forms.push({ name, kind: 'external', schemaExpr, ...opts });
            if (!name.startsWith('_')) exports.push({ name, kind: 'const' });
            usedFeatures.add('createForm');
            i = block.endLine;
            continue;
        }

        // ─── @form name: SchemaExpr; (external schema, no options) ───
        // Match: @form user: UserSchema;
        const formExternalMatch = trimmed.match(/^@form\s+(\w+)\s*:\s*(\w+)\s*;?\s*$/);
        if (formExternalMatch && !trimmed.includes('{')) {
            forms.push({ name: formExternalMatch[1], kind: 'external', schemaExpr: formExternalMatch[2] });
            if (!formExternalMatch[1].startsWith('_')) exports.push({ name: formExternalMatch[1], kind: 'const' });
            usedFeatures.add('createForm');
            continue;
        }

        // ─── @form name: { ... } (inline schema, may span multiple lines) ───
        // Match start: @form contact: {
        const formInlineStart = trimmed.match(/^@form\s+(\w+)\s*:\s*\{/);
        if (formInlineStart) {
            const name = formInlineStart[1];
            const block = extractBlock(lines, i);
            const split = splitInlineFormBlock(block.content);
            const fields = parseInlineFormSchema(split.fields);
            // A rule inside an array field's object is parsed into `arrayFields` and read by nobody:
            // the form's validators are keyed by field name, and a row's path (`lines.0.product`)
            // does not exist until the row does. So the rule is lost between the parser and the
            // generated `createForm` — and losing it in silence is the defect, not losing it.
            // The mechanism that DOES enforce a row's rules is `<pdx-field-list>`,
            // which registers them as each row is added.
            for (const field of fields) {
                if (!field.isArray || !field.arrayFields) continue;
                const ruled = field.arrayFields.filter(sub => sub.required || sub.rules.length > 0);
                if (ruled.length === 0) continue;
                warnings.push({
                    code: 'PDX_FORM_ARRAY_RULES_IGNORED',
                    severity: 'warn' as const,
                    message: `@form ${name}: the rules on ${ruled.map(s => `"${field.name}[].${s.name}"`).join(', ')} `
                        + 'are not applied — a rule inside an array field is parsed and then dropped.',
                    hint: `Declare the rows with <pdx-field-list name="${field.name}" :form :item-fields="[{ name: '${ruled[0].name}', required: true }]" />, `
                        + 'which registers the validators as each row is added.',
                });
            }
            // A declaration the parser did not understand is reported, not dropped without a word:
            // in silence, `address: { street: string }` produces no field, the controls render, the
            // characters appear as they are typed, and nothing arrives — the binding's
            // `?.onChange(…)` skips a field that does not exist. Whatever the unsupported shape, it says so.
            for (const missing of unparsedFieldNames(split.fields, fields)) {
                warnings.push({
                    code: 'PDX_FORM_FIELD_UNPARSED',
                    severity: 'warn' as const,
                    message: `@form ${name}: "${missing}" produced no field — the declaration was not understood.`,
                    hint: 'A field is `name: type { rules }`, a list of values `name: string[]`, '
                        + 'an object `name: { sub: type }`, rows `name: [{ sub: type }]`. Nothing binds to a field that does not exist, '
                        + 'and the control will silently swallow what is typed into it.',
                });
            }
            forms.push({
                name, kind: 'inline', fields,
                ...(split.options ? parseFormOptions(split.options) : {}),
            });
            if (!name.startsWith('_')) exports.push({ name, kind: 'const' });
            usedFeatures.add('createForm');
            i = block.endLine;
            continue;
        }

        // ─── @fetch name: 'METHOD /url' as Type { options }; ───
        // Tokenizer-based: handles complex types like User<T>[], nested options blocks
        if (trimmed.startsWith('@fetch ')) {
            // The whole declaration, which may go on to the next lines: an options block opened on
            // this line and closed below it was cut here, and its lines reached the setup as code (#203).
            const decl = collectDeclarationStatement(lines, i);
            const fetchResult = parseFetchDecl(decl.text.trim());
            if (fetchResult) i = decl.endLine;
            if (fetchResult) {
                fetches.push({
                    name: fetchResult.name,
                    method: fetchResult.method,
                    url: fetchResult.url,
                    type: fetchResult.type,
                    options: fetchResult.options,
                    hasReactiveParams: fetchResult.url.includes('${'),
                });
                if (!fetchResult.name.startsWith('_')) exports.push({ name: fetchResult.name, kind: 'const' });
                usedFeatures.add('resource');
                // `@fetch` reads. A write written here compiled to a GET of the same URL, in silence.
                if (fetchResult.method !== 'GET') {
                    warnings.push({
                        code: 'PDX_FETCH_METHOD',
                        severity: 'error' as const,
                        message: `@fetch '${fetchResult.name}' declares ${fetchResult.method}: @fetch reads, and only GET is fetched.`,
                        hint: `A write is a mutation(): const save = mutation((dto) => client.post('${fetchResult.url}', dto)). For a read, write 'GET ${fetchResult.url}'.`,
                    });
                }
                if (fetchResult.typeAfterColon) {
                    warnings.push({
                        code: 'PDX_FETCH_TYPE_COLON',
                        severity: 'error' as const,
                        message: `@fetch '${fetchResult.name}' writes its type after ':', which @fetch does not read: the type is written with 'as'.`,
                        hint: `@fetch ${fetchResult.name}: '${fetchResult.method} ${fetchResult.url}' as ${fetchResult.type ?? 'Type'};`,
                    });
                }
                if (fetchResult.options) {
                    const unknown = fetchOptionKeys(fetchResult.options).filter((k) => !FETCH_OPTION_KEYS.includes(k));
                    if (unknown.length > 0) {
                        warnings.push({
                            code: 'PDX_FETCH_UNKNOWN_OPTION',
                            severity: 'error' as const,
                            message: `@fetch '${fetchResult.name}' passes ${unknown.map((k) => `\`${k}\``).join(', ')}, which resource() does not take: it would do nothing.`,
                            hint: `The options are: ${FETCH_OPTION_KEYS.join(', ')}.`,
                        });
                    }
                }
                continue;
            }
            // Recognized @fetch decorator but unparseable. Don't fall through
            // silently — that would drop the line and break the component with no
            // diagnostic. Emit an actionable error instead.
            warnings.push({
                code: 'PDX_FETCH_INVALID',
                severity: 'error' as const,
                message: `Invalid @fetch declaration: "${trimmed}". Missing or malformed 'METHOD /url'.`,
                hint: `Use: @fetch ${(trimmed.match(/^@fetch\s+(\w+)/)?.[1]) ?? 'name'}: 'GET /api/path' as Type;`,
            });
            continue;
        }

        // ─── @expose name1, name2, ... ───
        const exposeMatch = trimmed.match(/^@expose\s+(.+);?\s*$/);
        if (exposeMatch) {
            const names = exposeMatch[1].replace(/;$/, '').split(',').map(n => n.trim()).filter(Boolean);
            exposes.push(...names);
            continue;
        }

        // ─── @host { attributes } — the component's own element (#133) ───
        // Match: `@host {` or `@host{`, the block possibly spread over several lines.
        if (/^@host\s*\{/.test(trimmed)) {
            const block = extractBlock(lines, i);
            host = [...(host ?? []), ...parseHostBlock(block.content)];
            i = block.endLine;
            continue;
        }

        // ─── @variants { axis: { a, b } = a; … } — the component's variants (#153) ───
        // Each axis is a prop typed with its values, reflected on the host as an attribute.
        // Match: `@variants {` or `@variants{`, the block possibly spread over several lines.
        if (/^@variants\s*\{/.test(trimmed)) {
            const block = extractBlock(lines, i);
            const read = parseVariantsBlock(block.content);
            variants.push(...read.axes);
            props.push(...variantProps(read.axes));
            host = [...(host ?? []), ...variantHostAttrs(read.axes)];
            for (const error of read.errors) {
                warnings.push({
                    code: 'PDX_VARIANTS_MALFORMED',
                    severity: 'error',
                    message: `@variants: ${error}.`,
                    hint: 'Use: @variants { variant: { primary, ghost } = primary; }',
                });
            }
            i = block.endLine;
            continue;
        }

        // ─── @part name1, name2; — named, public parts of the component (#134) ───
        // Match: @part trigger, popup;   Groups: [1]=the names
        const partMatch = trimmed.match(/^@part\s+([\w\s,]+?)\s*;?\s*$/);
        if (partMatch) {
            parts.push(...partMatch[1].split(',').map(n => n.trim()).filter(Boolean));
            continue;
        }

        // ─── @state name = expression; — a visual state of the host (#132) ───
        // Match: @state expanded = open;
        // Groups: [1]=name [2]=expression
        const stateMatch = trimmed.match(/^@state\s+(\w+)\s*=\s*(.+?)\s*;?\s*$/);
        if (stateMatch) {
            states.push({ name: stateMatch[1], expr: stateMatch[2] });
            continue;
        }
        if (trimmed.startsWith('@state')) {
            warnings.push({
                code: 'PDX_MALFORMED_STATE',
                severity: 'error' as const,
                message: `Invalid @state declaration: "${trimmed}".`,
                hint: 'Use: @state name = booleanExpression;',
            });
            continue;
        }

        // ─── @provide Token = expression; — declarative context provider (#496) ───
        // Match: @provide Theme = theme;  @provide Auth = new AuthService();
        // Groups: [1]=the token [2]=the value. That the token is imported is checked after the loop.
        const provideMatch = trimmed.match(/^@provide\s+(\w+)\s*=\s*(.+?)\s*;?\s*$/);
        if (provideMatch) {
            provides.push({ token: provideMatch[1], expr: provideMatch[2] });
            contextLines.push({ token: provideMatch[1], text: trimmed, rune: 'provide' });
            usedFeatures.add('provide');
            continue;
        }

        // ─── @inject name from Token; / @inject name from Token = fallback; (#496) ───
        // Match: the name and the token. Groups: [1]=the name [2]=the token. The rest is read by
        // hand: an optional `= fallback` and the `;`.
        const injectHead = trimmed.match(/^@inject\s+(\w+)\s+from\s+(\w+)/);
        const injectRest = injectHead ? trimmed.slice(injectHead[0].length).trim().replace(/;$/, '').trim() : null;
        if (injectHead && injectRest !== null && (injectRest === '' || injectRest.startsWith('='))) {
            const fallback = injectRest.startsWith('=') ? injectRest.slice(1).trim() : undefined;
            if (fallback !== '') {
                injects.push({ name: injectHead[1], token: injectHead[2], ...(fallback ? { fallback } : {}) });
                contextLines.push({ token: injectHead[2], text: trimmed, rune: 'inject' });
                usedFeatures.add('inject');
                // Auto-export the injected value
                if (!injectHead[1].startsWith('_')) exports.push({ name: injectHead[1], kind: 'const' });
                continue;
            }
        }

        // ─── @inject key; / @inject key as alias; — the alpha's string key (#496) ───
        // Match: the alpha form. Groups: [1]=the key [2]=the alias
        const alphaInject = trimmed.match(/^@inject\s+(\w+)(?:\s+as\s+(\w+))?\s*;?\s*$/);
        if (alphaInject) {
            const name = alphaInject[2] ?? alphaInject[1];
            warnings.push({
                code: 'PDX_UNKNOWN_DECLARATION',
                severity: 'error' as const,
                message: `"${trimmed}" names no context token: @inject reads a value by a token, \`from\` it. It was dropped — nothing is generated for it.`,
                hint: `Use: @inject ${name} from Token; — with Token = context<T>('${alphaInject[1]}') declared in a module and imported.`,
            });
            continue;
        }

        // ─── @tag 'app-custom-name' — override file-derived CE tag ───
        const tagMatch = trimmed.match(/^@tag\s+['"]([^'"]+)['"]\s*;?\s*$/);
        if (tagMatch) {
            customTag = tagMatch[1];
            // `pdx-` is the @pdxui packages' (#136): a .pdx is an application's component.
            if (customTag.startsWith(RESERVED_TAG_PREFIX)) {
                warnings.push({
                    code: 'PDX_TAG_RESERVED',
                    severity: 'error',
                    message: `@tag '${customTag}' uses the 'pdx-' prefix, which the @pdxui packages own: an application's component would take, or collide with, a library tag.`,
                    hint: `Use your app's prefix: @tag '${DEFAULT_TAG_PREFIX}-${customTag.slice(RESERVED_TAG_PREFIX.length)}';`,
                });
            }
            continue;
        }

        // ─── Route and head forms the beta removed (#277) ───
        // `@route { … }`, `@alias`, `@prefetch`, the script's `@transition`, `@meta { … }` and
        // `@head { … }`: `@page` is the one home of every route field, and `@title` and `@meta` write the
        // head. PDX_REMOVED_FORM reports each, naming what replaces it (`language/route-fields.ts`).
        // The declaration is read to its end and dropped: left in the setup, it is code that does not
        // parse, reported against text the author did not write as code.
        if (REMOVED_ROUTE_FORM.test(trimmed)) {
            i = trimmed.includes('{') ? extractBlock(lines, i).endLine : collectDeclarationStatement(lines, i).endLine;
            continue;
        }

        // ─── Route directives: @page (paths and options), @guard, @loader, @search, @layout ───
        // Match: @page '/path'; or @page "/path"; or @page '/path' { options };
        // Groups: [1]=path [2]=options block (optional, without braces)
        // Support: @page '/users'; OR @page '/users', '/people'; OR @page '/path' { options };
        // The whole declaration: an options block may go on to the next lines, which were otherwise
        // left to the setup as code (#204).
        const pageDecl = trimmed.startsWith('@page') ? collectDeclarationStatement(lines, i) : null;
        const pageMatch = pageDecl ? pageDecl.text.replace(/\s*\n\s*/g, ' ').trim().match(/^@page\s+(.+?)\s*;?\s*$/) : null;
        if (pageMatch && pageDecl) i = pageDecl.endLine;
        if (pageMatch) {
            const raw = pageMatch[1];
            // The options block, if present: its first brace outside a string, read to the brace that
            // closes it — `meta: { … }` holds braces of its own (#277).
            const open = maskNonCode(raw).indexOf('{');
            const close = open >= 0 ? findClosing(raw, open) : -1;
            const options = close > open ? raw.slice(open + 1, close) : null;
            const pathsPart = options !== null ? raw.slice(0, open).trim() : raw;
            // Parse comma-separated paths: '/users', '/people'
            // Match properly quoted strings: "value with 'quotes'" or 'value with "quotes"'
            const paths = pathsPart.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g)?.map(p => p.slice(1, -1)) ?? [];
            if (paths.length > 0) {
                route.page = paths[0];
                if (paths.length > 1) {
                    route.aliases = [...(route.aliases ?? []), ...paths.slice(1)];
                }
            }
            if (options !== null) {
                for (const name of parsePageOptions(options, route)) {
                    warnings.push({
                        code: 'PDX_PAGE_UNKNOWN_OPTION',
                        severity: 'error' as const,
                        message: `\`${name}\` is not an option of @page: it would be ignored.`,
                        hint: `The options are ${PAGE_OPTIONS.join(', ')}. A guard, a loader or a layout is a declaration of its own: @guard 'name';`,
                    });
                }
            }
            continue;
        }

        // Match: @guard 'permission.name';
        const guardMatch = trimmed.match(/^@guard\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*;?\s*$/);
        if (guardMatch) { route.guard = guardMatch[1] ?? guardMatch[2]; continue; }

        // Match: @loader user: loadUser; — the named form (#506), with its options block (#148).
        // Groups: [1]=the name [2]=the function [3]=the options block, braces included
        const namedLoader = trimmed.match(/^@loader\s+(\w+)\s*:\s*(\w+)\s*(\{[^{}]*\})?\s*;?\s*$/);
        if (namedLoader) {
            route.loaderName = namedLoader[1];
            route.loader = namedLoader[2];
            if (namedLoader[3]) {
                const read = readLoaderOptions(namedLoader[3]);
                if (read.staleTime !== undefined) route.loaderStaleTime = read.staleTime;
                if (read.problem) {
                    warnings.push({
                        code: 'PDX_LOADER_UNKNOWN_OPTION',
                        severity: 'error' as const,
                        message: `\`@loader ${namedLoader[1]}\` ${read.problem}`,
                        hint: '`@loader user: loadUser { staleTime: 30_000 };` — staleTime is the one option, a number of milliseconds: a literal, or a product of literals such as 5 * 60_000.',
                    });
                }
            }
            continue;
        }
        // Match: @loader functionName; — the alpha's anonymous form, a removed form (#506) that still
        // registers the loader. Groups: [1]=the function
        const loaderMatch = trimmed.match(/^@loader\s+(\w+)\s*;?\s*$/);
        if (loaderMatch) { route.loader = loaderMatch[1]; continue; }

        // @search { ... } — tokenizer-based brace matching for nested objects, read up to its closing
        // brace across lines (#105)
        if (trimmed.startsWith('@search ') && trimmed.includes('{')) {
            const block = extractBlock(lines, i);
            const searchBlock = extractSearchBlock(block.content.trim());
            if (searchBlock) {
                route.search = searchBlock;
                route.searchParams = parseSearchParams(searchBlock);
                warnings.push(...routeFieldWarnings(searchBlock, 'search'));
                declareRouteNames(route, exports);
                i = block.endLine;
                continue;
            }
        }

        // Match: @layout 'name';
        const layoutMatch = trimmed.match(/^@layout\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*;?\s*$/);
        if (layoutMatch) { route.layout = layoutMatch[1] ?? layoutMatch[2]; continue; }

        // Match: @scroll 'behavior'; — page-level scroll override
        const scrollMatch = trimmed.match(/^@scroll\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*;?\s*$/);
        if (scrollMatch) { route.scroll = scrollMatch[1] ?? scrollMatch[2]; continue; }

        // Match: @redirect '/from' -> '/to'; OR @redirect '/target';
        const redirectMatch = trimmed.match(/^@redirect\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*(?:->\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'))\s*;?\s*$/) ??
            trimmed.match(/^@redirect\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*;?\s*$/);
        if (redirectMatch) {
            const from = redirectMatch[1] ?? redirectMatch[2];
            const to = redirectMatch[3] ?? redirectMatch[4];
            if (to) {
                if (!route.redirects) route.redirects = [];
                route.redirects.push({ from, to });
            } else {
                route.redirectTo = from;
            }
            continue;
        }

        // Match: @outlet 'name' -> 'pdx-component-tag';
        const outletMatch = trimmed.match(/^@outlet\s+(?:"(\w+)"|'(\w+)')\s*->\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*;?\s*$/);
        if (outletMatch) {
            if (!route.outlets) route.outlets = [];
            route.outlets.push({ name: outletMatch[1] ?? outletMatch[2], tag: outletMatch[3] ?? outletMatch[4] });
            continue;
        }

        // ─── @params { id: number, slug: string }; — typed route param schema ───
        // Match: @params { id: number }; — same syntax as @search
        if (trimmed.startsWith('@params') && trimmed.includes('{')) {
            const block = extractBlock(lines, i);
            const paramsBlock = extractSearchBlock(block.content.trim());
            if (paramsBlock) {
                route.params = parseRouteParams(paramsBlock);
                warnings.push(...routeFieldWarnings(paramsBlock, 'params'));
                // Each param is a name the template and the script read, a computed like a
                // $derived: without this it was emitted and reachable by nobody (#185).
                declareRouteNames(route, exports);
                i = block.endLine;
                continue;
            }
        }

        // ─── @i18n { locales: [...], default: '...', ... } — multi-line block ───
        // Match start: @i18n {
        if (trimmed.startsWith('@i18n') && (trimmed.includes('{') || (i + 1 < lines.length && lines[i + 1].trim().startsWith('{')))) {
            const block = extractBlock(lines, i);
            i18nInfo = parseI18nBlock(block.content);
            i = block.endLine;
            continue;
        }

        // ─── @store name; or @store name { persist: 'local' }; — global store module ───
        // Match: @store cart; OR @store cart { persist: 'local' };
        // Groups: [1]=name [2]=persist value (optional)
        const globalStoreMatch = trimmed.match(/^@store\s+(\w+)\s*(?:\{\s*persist\s*:\s*['"](\w+)['"]\s*\})?\s*;?\s*$/);
        if (globalStoreMatch) {
            // `persist` is one of the two storages: any other word was cast to them and kept in
            // sessionStorage, gone when the tab closed — whatever the author asked for (#278).
            const persist = globalStoreMatch[2];
            const storage = persist === 'local' || persist === 'session' ? persist : undefined;
            if (persist !== undefined && storage === undefined) {
                warnings.push({
                    code: 'PDX_UNKNOWN_DECLARATION',
                    severity: 'error' as const,
                    message: `Unrecognised @store declaration: "${trimmed}". '${persist}' is not a storage, and the store would not be kept where you meant.`,
                    hint: "`persist` is 'local' or 'session': @store name { persist: 'local' };",
                });
            }
            globalStore = { name: globalStoreMatch[1], persist: storage };
            usedFeatures.add('createGlobalStore');
            continue;
        }

        // ─── @title 'Static Title'; or @title expression; — head management ───
        // Match: @title 'My Page'; OR @title product.data()?.name;
        const titleMatch = trimmed.match(/^@title\s+(.+?)\s*;?\s*$/);
        if (titleMatch) {
            const val = titleMatch[1].trim();
            // Static ONLY if the whole value is one string literal — i.e. the closing quote
            // is the LAST char. `'A' + x` (concatenation) or `'A'.toUpperCase()` are dynamic.
            const q = val[0];
            const isStatic = (q === "'" || q === '"') &&
                skipNonCode(val, 0) === val.length;
            head.title = { value: isStatic ? val.slice(1, -1) : val, isDynamic: !isStatic };
            continue;
        }

        // ─── @meta name: 'content'; or @meta property og:title: 'content'; ───
        // Match: @meta description: 'Browse products';
        // Match: @meta property og:title: 'My Site';
        const metaPropMatch = trimmed.match(/^@meta\s+property\s+([\w:-]+)\s*:\s*['"](.+?)['"]\s*;?\s*$/);
        if (metaPropMatch) {
            head.meta.push({ property: metaPropMatch[1], content: metaPropMatch[2] });
            continue;
        }
        const metaNameMatch = trimmed.match(/^@meta\s+([\w-]+)\s*:\s*['"](.+?)['"]\s*;?\s*$/);
        if (metaNameMatch) {
            head.meta.push({ name: metaNameMatch[1], content: metaNameMatch[2] });
            continue;
        }

        // ─── let/const/var name = $signal/$derived/$store(...) — runes ───
        // Accepts any declaration keyword (not just `let`) and multiple declarators on one
        // statement: `let a = $signal(0), b = $signal(1);`. The declaration may span lines.
        const runeDeclStart = trimmed.match(/^(let|const|var)\s/);
        if (runeDeclStart) {
            const stmt = collectDeclarationStatement(lines, i);
            // Only treat as a rune statement if at least one declarator uses a rune.
            const codeView = maskNonCode(stmt.text);
            // A rune may carry a type argument, `$signal<number>(0)`, which the editor declares and the
            // module's type erasure removes — whatever it holds: `Record<string, string>`,
            // `(A & B)[]`, `() => void`. The statement is read by TypeScript's parser, which balances
            // every bracket, and the type argument is skipped whole (#275).
            if (RUNE_CALL.test(codeView)) {
                const read = readDeclarators(stmt.text);
                // A rune is only read as the whole initialiser of a named declarator. Anywhere else —
                // a statement that does not parse, `wrap($signal(1))`, a pattern — it would reach the
                // module as `$signal`, a ReferenceError at run time: an error here instead.
                // A rune call inside an initialiser that is not the rune itself, `wrap($signal(1))`, is
                // PDX_RUNE_POSITION at the call (#278). What is left here is a statement that does not
                // parse — `$signal<Record<string, number>(1)` is no call at all — or a pattern bound to
                // a rune.
                const misplaced = misplacedRunes(stmt.text).length > 0;
                const unread = !misplaced && (!read || read.declarators.some(d =>
                    d.kind ? d.name === null : RUNE_CALL.test(maskNonCode(d.text))));
                if (unread || misplaced || !read) {
                    if (unread) warnings.push({
                        code: 'PDX_UNKNOWN_DECLARATION',
                        severity: 'error' as const,
                        message: `Unrecognised rune declaration: "${trimmed}". It was dropped — nothing is generated for it.`,
                        hint: 'Use: let name = $signal<Type>(initial); — the rune is the whole initialiser, and its brackets are balanced.',
                    });
                    i = stmt.endLine;
                    continue;
                }
                for (const d of read.declarators) {
                    const name = d.name!;
                    if (d.kind === 'signal') {
                        signals.push({ name, initialExpr: d.arg, origin: originOf(i) ?? undefined });
                        if (!name.startsWith('_')) exports.push({ name, kind: 'signal' });
                        usedFeatures.add('signal');
                    } else if (d.kind === 'derived') {
                        deriveds.push({ name, expr: d.arg, origin: originOf(i) ?? undefined });
                        if (!name.startsWith('_')) exports.push({ name, kind: 'derived' });
                        usedFeatures.add('computed');
                    } else if (d.kind === 'store') {
                        stores.push({ name, initialExpr: d.arg, keyword: runeDeclStart[1] as 'let' | 'const' | 'var', origin: originOf(i) ?? undefined });
                        if (!name.startsWith('_')) exports.push({ name, kind: 'const' });
                        usedFeatures.add('store');
                    } else {
                        // A non-rune declarator on the same statement (e.g. `let a=$signal(0), x=2`).
                        // Keep it as a real binding using the ORIGINAL keyword — degrading `let x`
                        // to `const x` would break a later reassignment `x = …`.
                        const kw = runeDeclStart[1];
                        if (d.name && !d.name.startsWith('_')) {
                            exports.push({ name: d.name, kind: (kw === 'let' ? 'let' : 'const') });
                        }
                        pushBody(`    ${kw} ${d.text};`, i);
                    }
                }
                // Code after the statement on its last line stays code.
                if (read.rest) pushBody(`    ${read.rest}`, stmt.endLine);
                i = stmt.endLine;
                continue;
            }
        }

        // ─── $watch(source, callback) — may span multiple lines ───
        // A top-level statement only: one inside a block is left where it is written, and is
        // PDX_RUNE_POSITION — lifted out, it ran whatever the block's condition said (#278).
        if (trimmed.startsWith('$watch(') && setupDepthAt[i] === 0) {
            const body = extractCallBody(lines, i, '$watch');
            watchOrigins.push(callOrigins(i, body.content));
            watchLines.push(pdxLineOf(i));
            // Parse: source, callback [, options]
            // Simple approach: find first comma at depth 0 to split source from rest
            const parts = splitWatchArgs(body.content);
            watches.push({
                source: parts.source,
                callback: parts.callback,
                options: parts.options,
            });
            usedFeatures.add('watch');
            i = body.endLine;
            continue;
        }

        // ─── $effect(() => { ... }) — may span multiple lines ───
        // A top-level statement only, as `$watch` above (#278).
        if (trimmed.startsWith('$effect(') && setupDepthAt[i] === 0) {
            const body = extractCallBody(lines, i, '$effect');
            effects.push(body.content);
            effectOrigins.push(callOrigins(i, body.content));
            effectLines.push(pdxLineOf(i));
            i = body.endLine;
            usedFeatures.add('effect');
            continue;
        }

        // ─── $inline { ... } — not part of the language (#361) ───
        // It copied its body into the render, where the template could not reach what it declared
        // and its signals were not rewritten: a ReferenceError at render. The block is read to its
        // closing brace and dropped, so none of it reaches the module, and the compile says what to
        // write instead.
        if (codeLines[i].trim().startsWith('$inline') && trimmed.includes('{')) {
            let depth = 0;
            for (const ch of codeLines[i]) { if (ch === '{') depth++; if (ch === '}') depth--; }
            while (depth > 0 && i + 1 < lines.length) {
                i++;
                for (const ch of codeLines[i]) { if (ch === '{') depth++; if (ch === '}') depth--; }
            }
            warnings.push({
                code: 'PDX_UNKNOWN_DECLARATION',
                severity: 'error' as const,
                message: '`$inline { … }` is not part of the language: the block was dropped — nothing is generated for it.',
                hint: 'Declare what the template reads as a derived value: const sorted = $derived([...items].sort(…));',
            });
            continue;
        }

        // ─── onMount(() => { ... }) ───
        if (trimmed.startsWith('onMount(')) {
            const body = extractCallBody(lines, i, 'onMount');
            onMountBodies.push(body.content);
            mountOrigins.push(callOrigins(i, body.content));
            i = body.endLine;
            continue;
        }

        // ─── onDestroy(() => { ... }) ───
        if (trimmed.startsWith('onDestroy(')) {
            const body = extractCallBody(lines, i, 'onDestroy');
            onDestroyBodies.push(body.content);
            destroyOrigins.push(callOrigins(i, body.content));
            i = body.endLine;
            continue;
        }

        // ─── function declarations ───
        const funcMatch = trimmed.match(/^(?:async\s+)?function\s+(\w+)\s*\(/);
        if (funcMatch) {
            const name = funcMatch[1];
            if (!name.startsWith('_')) exports.push({ name, kind: 'function' });
            // Collect entire function body
            const funcBody = extractBlock(lines, i);
            pushBody(funcBody.content, i, true);
            i = funcBody.endLine;
            continue;
        }

        // ─── Auto-detect framework API usage in body for imports ───
        detectCoreApis(stripLineComment(trimmed), usedFeatures);

        // ─── const/let declarations ───
        // Match: `const NAME =` or `const NAME: Type =` — the name, then its initialiser or its type
        // annotation. Groups: [1]=keyword [2]=name. Without the `:` a typed declaration was never
        // returned: undefined in the template, and a throw on the inline path (#44).
        const constMatch = trimmed.match(/^(const|let)\s+(\w+)\s*[=:]/);
        if (constMatch) {
            const [, keyword, name] = constMatch;
            // Only top-level (depth 0) declarations are auto-exported — a nested const/let (inside
            // an if/try/arrow block) is block-scoped and must not leak into the auto-return.
            if (!name.startsWith('_') && setupDepthAt[i] === 0) {
                exports.push({ name, kind: keyword as 'const' | 'let' });
            }
            pushBody(line, i);
            continue;
        }

        // ─── const/let { a, b: c } = … / const/let [a, b] = … ───
        // A pattern binds names too, and the template reads them like any other: without this
        // branch they would reach the body and never the return, so a destructured handler would be
        // `undefined` in the template, in silence. The line itself still falls through
        // to the body below, like every line of a multi-line declaration.
        const patternDecl = trimmed.match(/^(const|let)\s*[{[]/);
        if (patternDecl && setupDepthAt[i] === 0) {
            const stmt = collectDeclarationStatement(lines, i);
            for (const name of destructuredNames(stmt.text)) {
                if (!name.startsWith('_')) exports.push({ name, kind: patternDecl[1] as 'const' | 'let' });
            }
        }

        // ─── A declaration no rule understood ───
        // Read from the masked view, so a `@form` inside a comment or a string is a mention and not
        // a declaration — the same rule the mode detection above uses.
        const unknownDecl = codeLines[i].trim().match(/^@([a-zA-Z]\w*)/);
        if (unknownDecl && unknownDecl[1] in DECLARATION_SHAPES) {
            const keyword = unknownDecl[1];
            warnings.push({
                code: 'PDX_UNKNOWN_DECLARATION',
                severity: 'error' as const,
                message: `Unrecognised @${keyword} declaration: "${trimmed}". It was dropped — nothing is generated for it.`,
                hint: `Use: ${DECLARATION_SHAPES[keyword]}`,
            });
            // Dropped, and NOT pushed into the body: left there it reaches the generated module as
            // text, which then does not parse, and the real error is reported against code the
            // developer never wrote.
            continue;
        }

        // ─── Everything else → body ───
        pushBody(line, i);
    }

    // A named `@loader user: loadUser;` (#506): `user` is the route's loader as a source, read from the
    // router's state of this page's pattern. First in the setup, so every line below can read it, and
    // after the loop, which is when the pattern of `@page` is known wherever it was written.
    if (route.loaderName) {
        bodyLines.unshift(`    const ${route.loaderName} = loaderSource(${JSON.stringify(route.page ?? '')});`);
        bodyLineOrigins.unshift(null);
        // Named after its own function, the name is exported already — and now reads the source.
        if (!route.loaderName.startsWith('_') && !exports.some((e) => e.name === route.loaderName)) {
            exports.push({ name: route.loaderName, kind: 'const' });
        }
    }

    // A context token is a module-level `context<T>()` the script imports (#496). Anything else — the
    // alpha's string key, or a token declared in the script, which would be a new token per component
    // (the script is the setup), shared with nobody — is refused and generates nothing.
    const imported = new Set(importedNames);
    for (const line of contextLines) {
        if (imported.has(line.token)) continue;
        const declaredHere = exports.some(e => e.name === line.token);
        warnings.push({
            code: 'PDX_UNKNOWN_DECLARATION',
            severity: 'error' as const,
            message: `"${line.text}": '${line.token}' is not an imported context token. It was dropped — nothing is generated for it.`,
            hint: line.rune === 'provide'
                ? `Use: @provide Token = …;, with Token = context<T>('${line.token}') imported${declaredHere ? ' — a token declared in the script is a new one for each component, so nothing else can reach it' : ''}.`
                : `Use: @inject name from Token;, with Token = context<T>('…') declared in a module and imported.`,
        });
        if (line.rune === 'provide') provides.splice(provides.findIndex(p => p.token === line.token), 1);
        else injects.splice(injects.findIndex(i => i.token === line.token), 1);
    }

    // Each @part is the ref of its element (#134): a signal holding it, null until the element is
    // rendered, which the script reads by the part's name — as a `:ref` written to a `$signal(null)`.
    // A name the script already declares is left to that declaration.
    for (const name of parts) {
        if (signals.some(s => s.name === name) || exports.some(e => e.name === name)) continue;
        signals.push({ name, initialExpr: 'null' });
        exports.push({ name, kind: 'signal' });
        // As a `$signal` does: a component whose only declaration is a part would call it unimported.
        usedFeatures.add('signal');
    }

    // The loop above scans LINE BY LINE, and several of its branches swallow a whole block and
    // `continue` — a `function` declaration, `onMount(…)`, `$effect(…)`. So the body of a function
    // never reaches the detector there, and none of the core APIs called inside one would be
    // auto-imported; only top-level statements would.
    //
    // Scanning the collected text afterwards covers both, and it is the same detector rather than
    // a second copy that can drift. Strings are blanked first, so `const msg = "call pipe()"` is
    // prose and not a use — the line-by-line pass has no such guard, and needs none, because a
    // `const` line is swallowed too.
    detectCoreApis(maskNonCode([...bodyLines, ...effects, ...onMountBodies, ...onDestroyBodies].join('\n')), usedFeatures);

    dropLocallyDeclared(usedFeatures, lines, setupDepthAt);

    // A prefetch policy the router does not have: it normalised it to `hover`, in silence.
    if (route.prefetch !== undefined && !PREFETCH_POLICIES.includes(route.prefetch)) {
        warnings.push({
            code: 'PDX_PREFETCH_POLICY',
            severity: 'error' as const,
            message: `@page's prefetch '${route.prefetch}' is not a policy the router has: it would behave as 'hover'.`,
            hint: `Use one of: ${PREFETCH_POLICIES.map((p) => `'${p}'`).join(', ')}.`,
        });
    }

    // A page's title as data the route tables can carry (#389): read without importing the page.
    if (route.page) Object.assign(route, routeTitleOf(head.title));

    const analysis: ScriptAnalysis = {
        props,
        events,
        slots,
        snippets,
        actions,
        generics,
        signals,
        deriveds,
        stores,
        watches,
        fetches,
        forms,
        exposes,
        states,
        ...(host ? { host } : {}),
        ...(variants.length ? { variants } : {}),
        parts,
        route,
        globalStore,
        customTag,
        i18n: i18nInfo,
        head,
        provides,
        injects,
        effects,
        emits,
        lifecycle: { onMount: onMountBodies, onDestroy: onDestroyBodies },
        exports,
        ...bodyWithOrigins(bodyLines.join('\n'), originBase === undefined ? undefined : bodyLineOrigins),
        ...(originBase === undefined ? {} : { origins: { effects: effectOrigins, watches: watchOrigins, onMount: mountOrigins, onDestroy: destroyOrigins } }),
        ...(options.lineBase === undefined ? {} : { runeLines: { effects: effectLines, watches: watchLines } }),
        userImports,
        coreImportNames,
        importedNames,
        usedFeatures,
        warnings,
    };
    // A @store module's exports are lifted out of the store's factory by the code generator; the one
    // that reads the store's own names cannot be, and is reported here, with the others.
    if (globalStore) warnings.push(...liftStoreExports(analysis, _filename).warnings);
    return analysis;
}

function detectCoreApis(code: string, usedFeatures: Set<string>): void {
    // ─── Auto-detect framework API usage in body for imports ───
    // Strip single-line comments to avoid false positives (e.g. "// use map() here")
    if (code.includes('linkedSignal(')) usedFeatures.add('linkedSignal');
    if (code.includes('mutation(')) usedFeatures.add('mutation');
    if (code.includes('invalidate(')) usedFeatures.add('invalidate');
    if (code.includes('resource(')) usedFeatures.add('resource');
    if (code.includes('createHttpClient(')) usedFeatures.add('createHttpClient');
    if (code.includes('getDefaultClient(')) usedFeatures.add('getDefaultClient');
    // Signal operators & utilities
    if (code.includes('untracked(')) usedFeatures.add('untracked');
    if (code.includes('useQuery(')) usedFeatures.add('useQuery');
    // The PRIMITIVES. `$effect(` at the start of a line is recorded further up and imported
    // from there; `effect(…)` called INSIDE a function — one effect per transfer, per row, per
    // subscription — is caught only here, and without it compiles to a module referencing an
    // undefined name. No diagnostic: the page mounts, and the function throws the first time it runs.
    //
    // `(?<![\w.])` twice over: not a property access (`runner.effect()`), and not the tail of
    // a longer name (`sideEffect(`, `stopwatch(`, `linkedSignal(`).
    // The LIFECYCLE hooks belong to the same list: only `onMount` and `onDestroy` have an import
    // through their own branch further up. Without them here, `onBeforeLeave(…)` in a setup
    // compiles to `onBeforeLeave is not defined`, and the page renders "Error in <pdx-intake>"
    // instead of itself.
    for (const prim of ['effect', 'computed', 'batch', 'watch', 'onCleanup', 'onDispose', 'collectDisposers',
        'onMount', 'onDestroy', 'onUpdated', 'onError', 'onShow', 'onHide', 'onPropsChange',
        'onBeforeLeave', 'onRouteChange', 'onVisible', 'onResize']) {
        if (new RegExp(`(?<![\\w.])${prim}\\(`).test(code)) usedFeatures.add(prim);
    }
    // Pipe + pipe operators (regex avoids matching .map()/.filter() on arrays)
    if (/(?<!\.)pipe\(/.test(code)) usedFeatures.add('pipe');
    if (/(?<!\.)debounce\(/.test(code)) usedFeatures.add('debounce');
    if (/(?<!\.)throttle\(/.test(code)) usedFeatures.add('throttle');
    // `(?<!\.)`, not `(?<!\w\.)`: a method call is a method call whatever precedes the dot, and
    // `rows().filter(r => …)` has a `)` there. The narrower lookbehind read that as the pipe
    // operator and imports `filter` into a module that never uses it.
    if (/(?<!\.)map\(/.test(code)) usedFeatures.add('map');
    if (/(?<!\.)filter\(/.test(code)) usedFeatures.add('filter');
    if (/(?<!\.)tap\(/.test(code)) usedFeatures.add('tap');
    if (/(?<!\.)catchError\(/.test(code)) usedFeatures.add('catchError');
    // Async signal operators
    if (code.includes('switchSignal(')) usedFeatures.add('switchSignal');
    if (code.includes('exhaustSignal(')) usedFeatures.add('exhaustSignal');
    if (code.includes('retrySignal(')) usedFeatures.add('retrySignal');
    if (code.includes('concatSignal(')) usedFeatures.add('concatSignal');
    // Utility operators
    if (code.includes('distinct(')) usedFeatures.add('distinct');
    if (code.includes('previous(')) usedFeatures.add('previous');
    if (code.includes('scan(')) usedFeatures.add('scan');
    if (code.includes('pairwise(')) usedFeatures.add('pairwise');
    if (code.includes('sample(')) usedFeatures.add('sample');
    if (code.includes('skipUntil(')) usedFeatures.add('skipUntil');
    if (code.includes('takeUntil(')) usedFeatures.add('takeUntil');
    // DOM→Signal bridge
    if (code.includes('fromEvent(')) usedFeatures.add('fromEvent');
    if (code.includes('fromEvents(')) usedFeatures.add('fromEvents');
    if (code.includes('fromIntersection(')) usedFeatures.add('fromIntersection');
    if (code.includes('fromResize(')) usedFeatures.add('fromResize');
    if (code.includes('fromMutation(')) usedFeatures.add('fromMutation');
    // Promise↔Signal bridge
    if (code.includes('fromPromise(')) usedFeatures.add('fromPromise');
    if (code.includes('fromCallback(')) usedFeatures.add('fromCallback');
    if (code.includes('toPromise(')) usedFeatures.add('toPromise');
    if (code.includes('toAsync(')) usedFeatures.add('toAsync');
    // Animation
    if (code.includes('tween(')) usedFeatures.add('tween');
    if (code.includes('tweenMulti(')) usedFeatures.add('tweenMulti');
    if (code.includes('easings.')) usedFeatures.add('easings');
}

/**
 * A name the setup DECLARES is the setup's own, whatever the framework also calls it.
 *
 * The auto-import list matches a call — `map(`, `filter`, `sample(`, `effect(` — and a developer's
 * own helper by one of those names is a call too. Emitting the import then produces two bindings
 * for one name in the generated module, which does not parse: the build fails, on a line the
 * author did not write, and only for the author who wrote a helper rather than using ours.
 *
 * Applied to EVERY auto-imported name: `map` and
 * `filter` are far likelier to be somebody's local function than `effect` is.
 *
 * Top-level declarations only. A parameter or a nested `const` of the same name merely shadows the
 * import inside its own scope, which is legal and is what the author asked for.
 */
function dropLocallyDeclared(usedFeatures: Set<string>, lines: string[], depthAt: number[]): void {
    if (usedFeatures.size === 0) return;
    for (let i = 0; i < lines.length; i++) {
        // Depth 0 only: a `const map = …` inside a function is block-scoped and shadows the import
        // in its own scope, which is legal and is what the author asked for. A TOP-LEVEL one is
        // the second binding that does not parse.
        if (depthAt[i] !== 0) continue;
        // Groups: [1]=the declared name.
        const decl = /^(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/.exec(lines[i].trim());
        if (decl && usedFeatures.has(decl[1])) usedFeatures.delete(decl[1]);
    }
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Is `text` a complete import statement? Complete when braces balance AND it ends with a module
 * specifier — either a bare side-effect import (`import 'x'`) or a `from '…'` clause. Used to
 * accumulate multi-line imports before flattening.
 */
function isCompleteImport(text: string): boolean {
    const opens = (text.match(/\{/g) ?? []).length;
    const closes = (text.match(/\}/g) ?? []).length;
    if (opens !== closes) return false;
    const t = text.trim();
    // Side-effect import: import 'x'; / import "x";
    if (/^import\s+['"][^'"]+['"]\s*;?\s*$/.test(t)) return true;
    // default / named / namespace import: ends with from '…'
    if (/from\s+['"][^'"]+['"]\s*;?\s*$/.test(t)) return true;
    return false;
}

/**
 * Collect a full `let/const/var ...;` declaration starting at `startLine`, possibly spanning
 * multiple lines. Ends at the top-level `;` (string/comment/bracket-aware) or at balanced
 * end-of-input. Returns the joined text and the last line index consumed.
 */
function collectDeclarationStatement(lines: string[], startLine: number): { text: string; endLine: number } {
    let depth = 0;
    const collected: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        collected.push(line);
        for (let j = 0; j < line.length; j++) {
            const skip = skipNonCode(line, j);
            if (skip !== null) { j = skip - 1; continue; }
            const ch = line[j];
            if (ch === '(' || ch === '[' || ch === '{') depth++;
            else if (ch === ')' || ch === ']' || ch === '}') depth--;
            else if (ch === ';' && depth === 0) {
                return { text: collected.join('\n'), endLine: i };
            }
        }
        // No `;` but brackets balanced — the line ends the declaration unless the next one goes on
        // with it. The first line too: a script written without semicolons ends its statements at
        // the line, and a complete first line must not run on into the next.
        if (depth <= 0 && (i > startLine || !continuesOnNextLine(line, lines[i + 1]))) {
            return { text: collected.join('\n'), endLine: i };
        }
    }
    return { text: collected.join('\n'), endLine: lines.length - 1 };
}

/**
 * Whether a declaration whose brackets are balanced at the end of `line` goes on into `next`: the
 * line ends in something that wants an operand (`=`, `+`, `,`, `=>`…), or the next one starts with
 * something that cannot begin a statement (`.`, `?.`, an operator). Otherwise the line ends it.
 */
function continuesOnNextLine(line: string, next: string | undefined): boolean {
    if (next === undefined) return false;
    const end = maskNonCode(line).trimEnd();
    // Match: a line ending in an operator, a separator or an opener that needs what follows.
    if (/[=+\-*/%&|^!<>?:,.([{]$/.test(end)) return true;
    // Match: a next line starting with member access, a ternary arm or a binary operator.
    return /^(?:\?\.|\.(?!\.\.)|\?|:|&&|\|\||\?\?|[+\-*/%&|^<>=,]|in\s|instanceof\s)/.test(next.trimStart());
}


/** Strip comments AND string contents from a line for safe feature detection.
 *  Returns only actual code — string bodies replaced with spaces, comments removed. */
function stripLineComment(line: string): string {
    let result = '';
    let inSingle = false, inDouble = false, inTemplate = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '\\') { result += '  '; i++; continue; }
        if (!inDouble && !inTemplate && ch === "'") {
            inSingle = !inSingle; result += ' '; continue;
        }
        if (!inSingle && !inTemplate && ch === '"') {
            inDouble = !inDouble; result += ' '; continue;
        }
        if (!inSingle && !inDouble && ch === '`') {
            inTemplate = !inTemplate; result += ' '; continue;
        }
        if (!inSingle && !inDouble && !inTemplate && ch === '/' && line[i + 1] === '/') {
            break; // strip rest of line (comment)
        }
        // Inside string → replace with space; outside → keep
        result += (inSingle || inDouble || inTemplate) ? ' ' : ch;
    }
    return result;
}

/**
 * Process @raw { ... } blocks ANYWHERE in body (including inside functions).
 * Replaces @raw { content } with /*@raw* / content (marker for signal rewriter to skip).
 * Works after body assembly so it handles @raw nested in function bodies.
 */
function processRawBlocks(body: string, origins?: (number | null)[]): { text: string; origins?: (number | null)[] } {
    const RAW_MARKER = '/*@raw*/';
    const lines = body.split('\n');
    const result: string[] = [];
    const out: (number | null)[] = [];
    const push = (text: string, k: number) => { result.push(text); out.push(origins?.[k] ?? null); };
    let inRaw = false;
    let rawDepth = 0;

    for (const [k, line] of lines.entries()) {
        const trimmed = line.trim();

        if (!inRaw && trimmed.startsWith('@raw') && trimmed.includes('{')) {
            inRaw = true;
            rawDepth = 0;
            for (const ch of trimmed) { if (ch === '{') rawDepth++; if (ch === '}') rawDepth--; }
            const content = trimmed.replace(/^@raw\s*\{/, '').trim();
            if (rawDepth <= 0) {
                // Single-line @raw
                const inner = content.replace(/\}\s*$/, '');
                if (inner) push(RAW_MARKER + inner, k);
                inRaw = false;
            } else if (content) {
                push(RAW_MARKER + content, k);
            }
            continue;
        }

        if (inRaw) {
            for (const ch of trimmed) { if (ch === '{') rawDepth++; if (ch === '}') rawDepth--; }
            if (rawDepth <= 0) {
                const content = trimmed.replace(/\}\s*$/, '');
                if (content) push(RAW_MARKER + content, k);
                inRaw = false;
            } else {
                push(RAW_MARKER + line, k);
            }
            continue;
        }

        push(line, k);
    }

    return { text: result.join('\n'), origins: origins ? out : undefined };
}

/**
 * The body as the code generator reads it — trimmed, its @raw blocks marked — and, when the caller
 * asked for them, one origin per line of it.
 */
function bodyWithOrigins(joined: string, origins?: (number | null)[]): { body: string; bodyOrigins?: (number | null)[] } {
    const trimmed = joined.trim();
    let lineOrigins = origins;
    if (lineOrigins) {
        // `trim` drops the blank lines before the first one and after the last one.
        const dropped = joined.slice(0, joined.length - joined.trimStart().length).split('\n').length - 1;
        lineOrigins = lineOrigins.slice(dropped, dropped + trimmed.split('\n').length);
    }
    const raw = processRawBlocks(trimmed, lineOrigins);
    return { body: raw.text, ...(lineOrigins ? { bodyOrigins: raw.origins } : {}) };
}

// ─── i18n Block Parser ──────────────────────────────────────────────

/**
 * Parse @i18n { ... } block content into I18nInfo.
 * Supports: locales (array), default (string), translations (path), detect, persist.
 */
function parseI18nBlock(content: string): I18nInfo {
    const info: I18nInfo = { locales: [], default: 'en', translationsPath: './translations' };

    // Extract locales: ['en', 'it', 'de']
    const localesMatch = content.match(/locales\s*:\s*\[([^\]]+)\]/);
    if (localesMatch) {
        info.locales = localesMatch[1].split(',')
            .map(s => s.trim().replace(/['"]/g, ''))
            .filter(Boolean);
    }

    // Extract default: 'en'
    const defaultMatch = content.match(/default\s*:\s*['"]([^'"]+)['"]/);
    if (defaultMatch) info.default = defaultMatch[1];

    // Extract translations: './translations'
    const transMatch = content.match(/translations\s*:\s*['"]([^'"]+)['"]/);
    if (transMatch) info.translationsPath = transMatch[1];

    // Extract detect: true/false
    const detectMatch = content.match(/detect\s*:\s*(true|false)/);
    if (detectMatch) info.detect = detectMatch[1] === 'true';

    // Extract persist: true/false/'session'/expression
    const persistMatch = content.match(/persist\s*:\s*(true|false|'session'|"session")/);
    if (persistMatch) {
        const val = persistMatch[1];
        if (val === 'true') info.persist = true;
        else if (val === 'false') info.persist = false;
        else info.persist = 'session';
    }

    return info;
}

/**
 * Split an inline `@form`'s block into its FIELDS and its optional options block.
 *
 * An external form writes its options in its only pair of braces —
 * `@form f: Schema { save: 'onSubmit' }` — because its braces are free. An inline form's braces
 * are its fields, so the options follow them: `@form f: { …fields… } { validate: rule }`. That is
 * the only way in for `createForm`'s cross-field `validate` rule.
 *
 * The split is done here rather than by `extractBlock`: `extractBlock` counts braces a LINE at a
 * time, so on `} {` the depth closes and reopens within one line and it reads straight past the end
 * of the fields into the options. Both blocks would come back as one, and `validate: rule` would be
 * parsed as a field.
 */
/**
 * The fields an inline `@form` declaration declares, read as `analyzeScript` reads them — the
 * fields block split from any options block, then parsed. The language server types the form
 * from this, so the editor and the compiler cannot read a declaration two ways.
 */
export function inlineFormFields(declaration: string): FormFieldDecl[] {
    return parseInlineFormSchema(splitInlineFormBlock(declaration).fields);
}

function splitInlineFormBlock(content: string): { fields: string; options: string | null } {
    let depth = 0;
    let started = false;
    for (let i = 0; i < content.length; i++) {
        const skip = skipNonCode(content, i);
        if (skip !== null) { i = skip - 1; continue; }
        if (content[i] === '{') { depth++; started = true; }
        else if (content[i] === '}') {
            depth--;
            if (started && depth === 0) {
                const rest = content.slice(i + 1).trim();
                return { fields: content.slice(0, i + 1), options: rest.startsWith('{') ? rest : null };
            }
        }
    }
    return { fields: content, options: null };
}

/**
 * The names an inline `@form` block declares that produced no field.
 *
 * Compares what the block SAYS against what the parser produced, by the leading `name:` of each
 * top-level declaration. Anything with no name at all is reported by its text, truncated — it is
 * still better than reporting nothing.
 */
function unparsedFieldNames(blockContent: string, parsed: FormDecl['fields']): string[] {
    const braceStart = blockContent.indexOf('{');
    const braceEnd = blockContent.lastIndexOf('}');
    if (braceStart === -1 || braceEnd === -1) return [];
    const got = new Set((parsed ?? []).map(f => f.name));
    const missing: string[] = [];
    for (const decl of splitAtTopLevelCommas(blockContent.slice(braceStart + 1, braceEnd))) {
        const text = decl.trim();
        if (!text) continue;
        const declared = text.match(/^(\w+)\s*\??\s*:/)?.[1];
        if (declared ? !got.has(declared) : true) missing.push(declared ?? text.slice(0, 40));
    }
    return missing;
}
