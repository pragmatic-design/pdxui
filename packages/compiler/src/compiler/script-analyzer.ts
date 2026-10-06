// Script Analyzer — parses <script setup> with decorator+rune syntax.
// Extracts: @prop, @event, @slot, $signal, $derived, $effect, $emit, lifecycle hooks.
// Scans top-level declarations for auto-expose.
// Also detects malformed declarations and emits warnings.

import type { ValidationWarning } from './validate';
import type {
    PropInfo, EventInfo, SlotInfo, SignalDecl, DerivedDecl, ExportDecl,
    StoreDecl, WatchDecl, FetchDecl, FormDecl, RouteInfo,
    GlobalStoreDirective, HeadInfo, I18nInfo, ProvideDecl, InjectDecl, ScriptAnalysis,
} from './script-analyzer-types';
import {
    tsToRuntimeType, extractCallBody, splitWatchArgs, extractBlock,
    parseInlineFormSchema, parseFormOptions, parsePageOptions, parseSearchParams, normalizeStatementsWithOrigins,
    extractTypeAnnotation, parseFetchDecl, extractSearchBlock, parseHeadBlock,
    parseRouteBlock, parseRouteParams, parseObjectLiteralToJson, splitAtTopLevelCommas,
} from './script-analyzer-helpers';
import { maskNonCode, skipNonCode, findClosing } from './tokenizer';
import { importedLocalNames } from './import-names';
import { coreRuntimeNames } from './core-import-names';
import { destructuredNames } from './destructured-names';
import { DECORATOR_RUNES } from './runes';
import { liftStoreExports } from './store-exports';

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
 * with `Syntax error in <script setup>: Declaration expected.` — a TypeScript parser's opinion of a
 * line the author wrote as a framework declaration, naming neither the keyword nor what it expected.
 *
 * The shape is the hint. It lives in the one rune list (`runes.ts`), which the editor
 * reads too, so the analyzer and the editor cannot disagree on what a declaration is.
 */
const DECLARATION_SHAPES: Record<string, string> = Object.fromEntries(
    [...DECORATOR_RUNES.values()].map(r => [r.name, r.shape]),
);

// ─── Analyzer ──────────────────────────────────────────────────────

/**
 * Analyze a `<script setup>` block to extract structure (props, events, slots)
 * and reactive declarations (signals, derived, effects).
 *
 * Detects compilation mode:
 * - **new mode**: uses @prop / $signal decorators+runes
 * - **legacy mode**: uses defineProps / explicit return
 *
 * @param script - Raw content of the script block
 * @param filename - Source filename (for debug naming)
 * @param options.setup - The block is `<script setup>`: the new mode unless it carries the legacy
 *   mode's own markers (defineProps/defineEmits, a top-level `return {`) — it needs no rune to get
 *   there. A plain `<script>` needs a new-mode marker.
 * @returns Complete analysis used by codegen to produce the final JS module
 */
export function analyzeScript(script: string, _filename: string, options: { setup?: boolean; originBase?: number; lineBase?: number } = {}): ScriptAnalysis {
    // Normalize compact single-line scripts: split statements to separate lines
    // so that line-based regex matching works for agent-generated compact code.
    const { text: normalized, lineOrigins } = normalizeStatementsWithOrigins(script);
    const lines = normalized.split('\n');
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
    // Code-only view (strings/comments blanked) for mode detection — prevents a
    // @prop/$signal( inside a comment or string from flipping legacy → new mode.
    const codeLines = maskNonCode(normalized).split('\n');
    const props: PropInfo[] = [];
    const events: EventInfo[] = [];
    const slots: SlotInfo[] = [];
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
    const route: RouteInfo = {};
    let globalStore: GlobalStoreDirective | undefined;
    let customTag: string | undefined;
    let i18nInfo: I18nInfo | undefined;
    const head: HeadInfo = { meta: [] };
    const provides: ProvideDecl[] = [];
    const injects: InjectDecl[] = [];
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
    const inlineBlocks: string[] = []; // $inline {} blocks for render path
    const warnings: ValidationWarning[] = [];

    // Detect mode. The legacy mode is recognised by its OWN markers — defineProps/defineEmits, or a
    // `return {` at the top level, which only a legacy setup body may contain. A `<script setup>`
    // without them is the new mode, rune or not: otherwise a setup block with only imports, consts
    // and an onMount would fall into the legacy mode, silently — no auto-return, onMount not
    // imported. A plain `<script>` needs a new-mode marker (code-only view).
    const legacyMarkerAt = codeLines.findIndex((l, idx) =>
        /\bdefine(?:Props|Emits)\s*[<(]/.test(l) || (setupDepthAt[idx] === 0 && /^\s*return\s*\{/.test(l)));
    const hasLegacyMarkers = legacyMarkerAt !== -1;
    const isNewMode = (options.setup === true && !hasLegacyMarkers) || codeLines.some(l => {
        const t = l.trim();
        return t.startsWith('@prop ') || t.startsWith('@event ') || t.startsWith('@slot ') || t.startsWith('@expose ') ||
               t.startsWith('@page ') || t.startsWith('@guard ') || t.startsWith('@loader ') ||
               t.startsWith('@search ') || t.startsWith('@prefetch ') || t.startsWith('@layout ') ||
               t.startsWith('@fetch ') || t.startsWith('@form ') ||
               t.startsWith('@redirect ') || t.startsWith('@alias ') || t.startsWith('@outlet ') ||
               t.startsWith('@tag ') || t.startsWith('@route ') || t.startsWith('@route{') ||
               t.startsWith('@head ') || t.startsWith('@head{') || t.startsWith('@params ') || t.startsWith('@params{') ||
               t.startsWith('@provide ') || t.startsWith('@inject ') ||
               t.startsWith('@store ') || t.startsWith('@title ') || t.startsWith('@meta ') || t.startsWith('@scroll ') || t.startsWith('@snippet ') ||
               t.startsWith('@i18n ') || t.startsWith('@i18n{') ||
               t.includes('$signal(') || t.includes('$derived(') || t.includes('$effect(') ||
               t.includes('$store(') || t.includes('$watch(') || t.includes('linkedSignal(');
    });

    // `<script setup>` states an intent, checked here against the mode the file actually compiles
    // to. The two disagreements would otherwise be silent, and they fail in opposite directions:
    // with no rune the legacy mode wins and there is no new-mode setup at all, so anything
    // rune-shaped added later is inert; with a rune the new mode wins and the `defineProps` the
    // author wrote does nothing. Neither is an error — a legacy component is still valid, and making
    // `setup` FORCE the new mode would break every file that carries both. It is only not silent.
    if (options.setup === true && hasLegacyMarkers) {
        const markerLine = codeLines[legacyMarkerAt];
        const named = /\bdefineProps\s*[<(]/.test(markerLine) ? 'defineProps'
            : /\bdefineEmits\s*[<(]/.test(markerLine) ? 'defineEmits'
                : 'a top-level `return { … }`';
        warnings.push({
            code: 'PDX_LEGACY_IN_SETUP',
            severity: 'warn',
            message: isNewMode
                ? `<script setup> carries ${named}, a legacy marker, next to runes: the runes win and the file compiles in the NEW mode, so ${named} does nothing.`
                : `<script setup> carries ${named}, a legacy marker, and no rune: the file compiles in the LEGACY mode, so it has no new-mode setup and any rune added to it would be inert.`,
            hint: named === 'a top-level `return { … }`'
                ? 'Remove the top-level return: <script setup> returns what it declares. Keep it only if the file is deliberately legacy, and then write plain <script>.'
                : `Replace ${named} with @prop / @event declarations, or write plain <script> if the file is deliberately legacy.`,
        });
    }

    for (let i = 0; i < lines.length; i++) {
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

        if (!isNewMode) {
            pushBody(line, i);
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
            // Store snippet as a function that returns template html
            const snippetBody = snippetLines.join('\n');
            pushBody(`    function ${snippetName}(${params}) { return html\`${snippetBody}\`; }`, snippetAt);
            exports.push({ name: snippetName, kind: 'function' as const });
            usedFeatures.add('html');
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

        // ─── @mixin './path.pdx' as name — component composition ───
        const mixinMatch = trimmed.match(/^@mixin\s+'([^']+)'\s+as\s+(\w+)/);
        if (mixinMatch) {
            const [, path, alias] = mixinMatch;
            userImports.push(`import { setup as __mixin_${alias} } from '${path}';`);
            pushBody(`    const ${alias} = __mixin_${alias}(ctx);`, i);
            exports.push({ name: alias, kind: 'const' as const });
            continue;
        }

        // ─── @prop name: Type = default ───
        // Tokenizer-based: handles generics (Map<K,V>), unions, function types, template literals
        const propPrefix = trimmed.match(/^@prop\s+(\w+)\s*:/);
        if (propPrefix) {
            const name = propPrefix[1];
            const colonPos = propPrefix[0].length - 1; // position of `:` in trimmed
            const { type: tsType, rest } = extractTypeAnnotation(trimmed, colonPos);
            if (tsType) {
                if (isMalformedTsType(tsType)) {
                    warnings.push({
                        code: 'PDX_PROP_INVALID_TYPE',
                        severity: 'warn',
                        message: `@prop '${name}' has a malformed type annotation: '${tsType}'. The generated .d.ts may be invalid.`,
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
                });
                continue;
            }
        }

        // Detect malformed @prop — starts with @prop but missing type annotation
        if (trimmed.startsWith('@prop ') || trimmed === '@prop') {
            const nameOnly = trimmed.match(/^@prop\s+(\w+)/);
            const hint = nameOnly
                ? `Use: @prop ${nameOnly[1]}: string = 'default';`
                : `Use: @prop name: Type = default;`;
            warnings.push({
                code: 'PDX_PROP_NO_TYPE',
                severity: 'error' as const,
                message: `Invalid @prop declaration: "${trimmed}". Missing type annotation.`,
                hint,
            });
            continue; // Don't push to bodyLines — it's a recognized (but malformed) decorator
        }

        // ─── @event name: PayloadType ───
        // Tokenizer-based for complex types like { old: T, new: T }
        const eventPrefix = trimmed.match(/^@event\s+(\w+)\s*(?::\s*)?/);
        if (eventPrefix && trimmed.startsWith('@event ')) {
            const name = eventPrefix[1];
            const hasType = trimmed.indexOf(':') > trimmed.indexOf(name);
            if (hasType) {
                const colonPos = trimmed.indexOf(':', trimmed.indexOf(name) + name.length);
                const { type } = extractTypeAnnotation(trimmed, colonPos);
                events.push({ name, payloadType: type || 'void' });
            } else {
                events.push({ name, payloadType: 'void' });
            }
            continue;
        }

        // Detect malformed @event
        if (trimmed.startsWith('@event') && trimmed !== '@event') {
            warnings.push({
                code: 'PDX_MALFORMED_EVENT',
                severity: 'error' as const,
                message: `Invalid @event declaration: "${trimmed}".`,
                hint: `Use: @event eventName: PayloadType;`,
            });
            continue;
        }

        // ─── @slot name or @slot name: { ScopeType } ───
        // Tokenizer-based for scope types with generics: { item: Item<T> }
        if (trimmed.startsWith('@slot ')) {
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
            const fetchResult = parseFetchDecl(trimmed);
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

        // ─── @provide key = expression; — declarative context provider ───
        // Match: @provide theme = $signal({ mode: 'dark' });
        // Match: @provide authService = new AuthService();
        const provideMatch = trimmed.match(/^@provide\s+(\w+)\s*=\s*(.+?)\s*;?\s*$/);
        if (provideMatch) {
            provides.push({ key: provideMatch[1], expr: provideMatch[2] });
            usedFeatures.add('provide');
            continue;
        }

        // ─── @inject key; or @inject key as alias; — declarative context consumer ───
        // Match: @inject theme;
        // Match: @inject theme as appTheme;
        const injectMatch = trimmed.match(/^@inject\s+(\w+)(?:\s+as\s+(\w+))?\s*;?\s*$/);
        if (injectMatch) {
            injects.push({ key: injectMatch[1], alias: injectMatch[2] });
            usedFeatures.add('inject');
            // Auto-export the injected value
            const localName = injectMatch[2] ?? injectMatch[1];
            if (!localName.startsWith('_')) exports.push({ name: localName, kind: 'const' });
            continue;
        }

        // ─── @tag 'pdx-custom-name' — override file-derived CE tag ───
        const tagMatch = trimmed.match(/^@tag\s+['"]([^'"]+)['"]\s*;?\s*$/);
        if (tagMatch) {
            customTag = tagMatch[1];
            continue;
        }

        // ─── @route { ... } — aggregate block for complex routing ───
        // Replaces multiple single-line route runes with one structured block.
        // Cannot coexist with individual @page/@guard/@prefetch etc.
        if (trimmed.startsWith('@route') && trimmed.includes('{') && !trimmed.match(/^@route\s+['"]/)) {
            const block = extractBlock(lines, i);
            parseRouteBlock(block.content, route);
            i = block.endLine;
            continue;
        }

        // ─── Route directives: @page, @guard, @loader, @search, @prefetch, @transition, @layout ───
        // Match: @page '/path'; or @page "/path"; or @page '/path' { options };
        // Groups: [1]=path [2]=options block (optional, without braces)
        // Support: @page '/users'; OR @page '/users', '/people'; OR @page '/path' { options };
        const pageMatch = trimmed.match(/^@page\s+(.+?)\s*;?\s*$/);
        if (pageMatch) {
            const raw = pageMatch[1];
            // Extract options block if present: { keepAlive, preload }
            const optionsMatch = raw.match(/\{([^}]*)\}\s*$/);
            const pathsPart = optionsMatch ? raw.slice(0, raw.lastIndexOf('{')).trim() : raw;
            // Parse comma-separated paths: '/users', '/people'
            // Match properly quoted strings: "value with 'quotes'" or 'value with "quotes"'
            const paths = pathsPart.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g)?.map(p => p.slice(1, -1)) ?? [];
            if (paths.length > 0) {
                route.page = paths[0];
                if (paths.length > 1) {
                    route.aliases = [...(route.aliases ?? []), ...paths.slice(1)];
                }
            }
            if (optionsMatch) parsePageOptions(optionsMatch[1], route);
            continue;
        }

        // Match: @guard 'permission.name';
        const guardMatch = trimmed.match(/^@guard\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*;?\s*$/);
        if (guardMatch) { route.guard = guardMatch[1] ?? guardMatch[2]; continue; }

        // Match: @loader functionName;
        const loaderMatch = trimmed.match(/^@loader\s+(\w+)\s*;?\s*$/);
        if (loaderMatch) { route.loader = loaderMatch[1]; continue; }

        // @search { ... } — tokenizer-based brace matching for nested objects
        if (trimmed.startsWith('@search ') && trimmed.includes('{')) {
            const searchBlock = extractSearchBlock(trimmed);
            if (searchBlock) {
                route.search = searchBlock;
                route.searchParams = parseSearchParams(searchBlock);
                continue;
            }
        }

        // Match: @prefetch 'strategy';
        const prefetchMatch = trimmed.match(/^@prefetch\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*;?\s*$/);
        if (prefetchMatch) { route.prefetch = prefetchMatch[1] ?? prefetchMatch[2]; continue; }

        // Match: @transition 'name'; (page-level, not template-level)
        if (trimmed.match(/^@transition\s+['"]/) && !trimmed.includes('(')) {
            const transMatch = trimmed.match(/^@transition\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*;?\s*$/);
            if (transMatch) { route.transition = transMatch[1] ?? transMatch[2]; continue; }
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

        // Match: @alias '/alternative-path';
        const aliasMatch = trimmed.match(/^@alias\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*;?\s*$/);
        if (aliasMatch) {
            if (!route.aliases) route.aliases = [];
            route.aliases.push(aliasMatch[1] ?? aliasMatch[2]);
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
            const paramsBlock = extractSearchBlock(trimmed.replace('@params', '@search'));
            if (paramsBlock) {
                route.params = parseRouteParams(paramsBlock);
                continue;
            }
        }

        // Match: @meta { key: value, ... }; — route meta (block with braces, not HTML meta)
        // Parsed as JSON5-like (no new Function — avoids code execution at build time)
        if (trimmed.startsWith('@meta') && trimmed.includes('{') && !trimmed.includes('name:') && !trimmed.includes('property:')) {
            const metaBlock = trimmed.match(/^@meta\s+(\{[\s\S]+\})\s*;?\s*$/);
            if (metaBlock) {
                // Quote only KEYS — preserves `:` inside URLs/values (e.g. og:url).
                const parsed = parseObjectLiteralToJson(metaBlock[1]);
                if (parsed !== undefined) route.meta = parsed as Record<string, unknown>;
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
            globalStore = {
                name: globalStoreMatch[1],
                persist: globalStoreMatch[2] as 'local' | 'session' | undefined,
            };
            usedFeatures.add('createGlobalStore');
            continue;
        }

        // ─── @head { title: '...', meta: [...] } — structured head block ───
        // Disambiguates SEO/head tags from route metadata (@meta { ... })
        if (trimmed.startsWith('@head') && trimmed.includes('{')) {
            const block = extractBlock(lines, i);
            parseHeadBlock(block.content, head);
            i = block.endLine;
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
            // module's type erasure removes. Match: `$signal(` or `$signal<…>(`.
            if (/\$(?:signal|derived|store)\s*(?:<[^()]*>)?\s*\(/.test(codeView)) {
                // Strip the leading keyword, then split declarators at top-level commas.
                const afterKw = stmt.text.replace(/^\s*(let|const|var)\s+/, '');
                const declarators = splitAtTopLevelCommas(afterKw);
                let handledAny = false;
                for (const decl of declarators) {
                    const d = decl.trim();
                    // Match: `name = $signal(`, with an annotation (`name: number =`) and a type
                    // argument (`$signal<number>(`) allowed. Groups: [1]=name. The match ends at `(`.
                    const rune = (r: string) => d.match(new RegExp(`^(\\w+)\\s*(?::[^=]+)?=\\s*\\$${r}\\s*(?:<[^()]*>)?\\s*\\(`));
                    const sigM = rune('signal');
                    const derM = rune('derived');
                    const stoM = rune('store');
                    if (sigM) {
                        const name = sigM[1];
                        signals.push({ name, initialExpr: extractRuneArg(d, sigM[0].length - 1), origin: originOf(i) ?? undefined });
                        if (!name.startsWith('_')) exports.push({ name, kind: 'signal' });
                        usedFeatures.add('signal');
                        handledAny = true;
                    } else if (derM) {
                        const name = derM[1];
                        deriveds.push({ name, expr: extractRuneArg(d, derM[0].length - 1), origin: originOf(i) ?? undefined });
                        if (!name.startsWith('_')) exports.push({ name, kind: 'derived' });
                        usedFeatures.add('computed');
                        handledAny = true;
                    } else if (stoM) {
                        const name = stoM[1];
                        stores.push({ name, initialExpr: extractRuneArg(d, stoM[0].length - 1), origin: originOf(i) ?? undefined });
                        if (!name.startsWith('_')) exports.push({ name, kind: 'const' });
                        usedFeatures.add('store');
                        handledAny = true;
                    } else {
                        // A non-rune declarator on the same statement (e.g. `let a=$signal(0), x=2`).
                        // Keep it as a real binding using the ORIGINAL keyword — degrading `let x`
                        // to `const x` would break a later reassignment `x = …`.
                        const kw = runeDeclStart[1];
                        const nm = d.match(/^(\w+)/);
                        if (nm && !nm[1].startsWith('_')) {
                            exports.push({ name: nm[1], kind: (kw === 'let' ? 'let' : 'const') });
                        }
                        pushBody(`    ${kw} ${d};`, i);
                        handledAny = true;
                    }
                }
                if (handledAny) {
                    i = stmt.endLine;
                    continue;
                }
            }
        }

        // ─── $watch(source, callback) — may span multiple lines ───
        if (trimmed.startsWith('$watch(')) {
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
        if (trimmed.startsWith('$effect(')) {
            const body = extractCallBody(lines, i, '$effect');
            effects.push(body.content);
            effectOrigins.push(callOrigins(i, body.content));
            effectLines.push(pdxLineOf(i));
            i = body.endLine;
            usedFeatures.add('effect');
            continue;
        }

        // ─── $inline { ... } — code that runs in render path, not setup ───
        if (trimmed.startsWith('$inline') && trimmed.includes('{')) {
            let depth = 0;
            const inlineLines: string[] = [];
            for (const ch of trimmed) { if (ch === '{') depth++; if (ch === '}') depth--; }
            const first = trimmed.replace(/^\$inline\s*\{/, '').trim();
            if (first && depth > 0) inlineLines.push(first);
            while (depth > 0 && i + 1 < lines.length) {
                i++;
                const inlineLine = lines[i].trim();
                for (const ch of inlineLine) { if (ch === '{') depth++; if (ch === '}') depth--; }
                if (depth <= 0) {
                    const last = inlineLine.replace(/\}\s*$/, '');
                    if (last) inlineLines.push(last);
                } else {
                    inlineLines.push(lines[i]);
                }
            }
            inlineBlocks.push(inlineLines.join('\n'));
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
        const constMatch = trimmed.match(/^(const|let)\s+(\w+)\s*=/);
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

    // The loop above scans LINE BY LINE, and several of its branches swallow a whole block and
    // `continue` — a `function` declaration, `onMount(…)`, `$effect(…)`. So the body of a function
    // never reaches the detector there, and none of the core APIs called inside one would be
    // auto-imported; only top-level statements would.
    //
    // Scanning the collected text afterwards covers both, and it is the same detector rather than
    // a second copy that can drift. Strings are blanked first, so `const msg = "call pipe()"` is
    // prose and not a use — the line-by-line pass has no such guard, and needs none, because a
    // `const` line is swallowed too.
    detectCoreApis(maskNonCode([...bodyLines, ...effects, ...onMountBodies, ...onDestroyBodies, ...inlineBlocks].join('\n')), usedFeatures);

    dropLocallyDeclared(usedFeatures, lines, setupDepthAt);

    const analysis: ScriptAnalysis = {
        mode: isNewMode ? 'new' : 'legacy',
        props,
        events,
        slots,
        signals,
        deriveds,
        stores,
        watches,
        fetches,
        forms,
        exposes,
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
        inlineBlocks,
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

/**
 * Extract the balanced argument of a rune call given the index of its opening `(`.
 * Returns the trimmed content between the parens (string/comment-aware).
 */
function extractRuneArg(decl: string, openParenIdx: number): string {
    const close = findClosing(decl, openParenIdx);
    const end = close === -1 ? decl.length : close;
    return decl.slice(openParenIdx + 1, end).trim();
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
