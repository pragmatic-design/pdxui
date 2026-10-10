// Template Parser — transforms .pdx template syntax into AST nodes.
//
// Syntax:
//   {{ expr }}           → interpolation
//   {{ expr | pipe }}    → piped interpolation
//   @if (cond) { ... }   → conditional block
//   @else { ... }        → else branch
//   @for (list as item; track key) { ... } → loop block
//   @switch (expr) { @case (val) { ... } @default { ... } } → switch block
//   @require ('perm') { ... } → permission-gated block
//   @transition('enter', 'exit') → transition hint (after @if/@for)
//   Everything else      → raw HTML
//
// ALL position advancement goes through advance() for accurate line/column tracking.

// ─── Source Location ───────────────────────────────────────────────

/** Source position for source map generation. */
export interface SourceLoc {
    line: number;    // 1-based
    column: number;  // 0-based
    /** Offset into the template content — a source map turns it into one into the .pdx. */
    offset?: number;
}

// ─── AST Types ─────────────────────────────────────────────────────

export type TemplateNode =
    | HtmlNode
    | InterpolationNode
    | IfNode
    | ForNode
    | SwitchNode
    | RequireNode
    | ShowNode
    | PortalNode
    | DeferNode
    | TryNode
    | AwaitNode
    | LetNode
    | SlotTemplateNode
    | CustomDirectiveNode;

/** Plugin-defined custom directive node. */
export interface CustomDirectiveNode {
    type: 'custom-directive';
    name: string;
    expr: string;
    body: TemplateNode[];
    loc?: SourceLoc;
}

export interface HtmlNode {
    type: 'html';
    content: string;
    loc?: SourceLoc;
    /**
     * Indices of `content` where an `@@` escape left one `@` for two characters of source: past
     * each, the source is one character further on.
     */
    shifts?: number[];
    /**
     * An `@raw { … }` block: text as written, which no pass reads for bindings, interpolations or
     * directives. Each render path only escapes it for where it puts it.
     */
    raw?: true;
}

export interface InterpolationNode {
    type: 'interpolation';
    expr: string;
    /** Offset of the expression in the template content. */
    exprOffset?: number;
    /** Pipe names with optional arguments. E.g. ['uppercase', "currency('EUR')", 'slice(0, 5)'] */
    pipes: string[];
    loc?: SourceLoc;
}

export interface IfNode {
    type: 'if';
    condition: string;
    /** Offset of the condition in the template content. */
    exprOffset?: number;
    body: TemplateNode[];
    elseBody?: TemplateNode[];
    transition?: TransitionConfig;
    loc?: SourceLoc;
}

export interface ForNode {
    type: 'for';
    items: string;
    /** Offset of the collection expression in the template content. */
    exprOffset?: number;
    item: string;
    /** Loop index variable name (optional, from: @for (items as item, i; track ...) */
    index?: string;
    track: string;
    body: TemplateNode[];
    /** Content shown when the array is empty. Syntax: @for (...) { } @empty { } */
    emptyBody?: TemplateNode[];
    transition?: TransitionConfig;
    loc?: SourceLoc;
}

export interface SwitchNode {
    type: 'switch';
    expr: string;
    cases: { value: string; body: TemplateNode[] }[];
    defaultBody?: TemplateNode[];
    loc?: SourceLoc;
}

export interface RequireNode {
    type: 'require';
    permission: string;
    body: TemplateNode[];
    elseBody?: TemplateNode[];
    loc?: SourceLoc;
}

export interface ShowNode {
    type: 'show';
    condition: string;
    body: TemplateNode[];
    loc?: SourceLoc;
}

export interface PortalNode {
    type: 'portal';
    target: string;
    body: TemplateNode[];
    loc?: SourceLoc;
}

export interface DeferNode {
    type: 'defer';
    trigger: string;
    body: TemplateNode[];
    placeholder?: TemplateNode[];
    loading?: TemplateNode[];
    error?: TemplateNode[];
    loc?: SourceLoc;
}

export interface TryNode {
    type: 'try';
    body: TemplateNode[];
    errorVar: string;
    /** The name the catch body calls to retry — the author's second name, or `retry`. */
    retryVar: string;
    catchBody: TemplateNode[];
    loc?: SourceLoc;
}

export interface AwaitNode {
    type: 'await';
    condition: string;        // signal/boolean expression
    body: TemplateNode[];     // content when ready
    loading?: TemplateNode[]; // placeholder while waiting
    errorBody?: TemplateNode[]; // fallback on error
    errorVar?: string;        // error variable name (from @error (err))
    retryVar?: string;        // retry function name (from @error (err, again)); `retry` when omitted
    minMs?: number;           // minimum loading display time (avoid flash)
    maxMs?: number;           // timeout for loading state
    loc?: SourceLoc;
}

/** Local template variable: @let name = expr; */
export interface LetNode {
    type: 'let';
    name: string;
    expr: string;
    loc?: SourceLoc;
}

/** Parent-side scoped slot template: @slot(name, { vars }) { body } */
export interface SlotTemplateNode {
    type: 'slot-template';
    /** Slot name (e.g. 'item', 'selected', 'empty') */
    name: string;
    /** Destructured scope variable names from the child (e.g. ['value', 'index']) */
    scopeVars: string[];
    /** Template body nodes */
    body: TemplateNode[];
    loc?: SourceLoc;
}

export interface TransitionConfig {
    enter?: string;
    exit?: string;
    stagger?: number;
    mode?: string;
    /** FLIP duration for a list item that moves to a new index, in ms, as the runtime reads it. */
    move?: string;
}

// ─── Parser ────────────────────────────────────────────────────────

/**
 * Parse a template string into an AST with source locations.
 * @param source - Template content (inside <template> block)
 * @param lineOffset - Starting line in the .pdx file (for source maps)
 * @param columnOffset - Column in the .pdx file where the content starts, 0-based. Not 0 when the
 *   content begins on the `<template>` line: without it every column of that line counts from the
 *   content, ten characters early, and a fix that reads the text at the position does not apply.
 *   The lines after it start at column 0 as they do in the file.
 */
export function parseTemplate(source: string, lineOffset = 1, directives?: Set<string>, columnOffset = 0): TemplateNode[] {
    const ctx: ParseContext = {
        source, pos: 0, base: 0, line: lineOffset, column: columnOffset,
        customDirectives: directives ?? new Set(),
    };
    return parseNodes(ctx);
}

/**
 * Where a template's content starts in its .pdx: the 1-based line and the 0-based column, the two
 * `parseTemplate` takes to count positions in the file. The column is not 0 when the content starts
 * on the `<template>` line. A template read from another file (`src=`) counts from its own
 * start. Every reader that reports a template position in the file parses with this — the compiler,
 * `pdx check`, the editor.
 */
export function templateStartInFile(source: string, template: { start: number; src: string | null }): { line: number; column: number } {
    if (template.src) return { line: 1, column: 0 };
    const lineStart = source.lastIndexOf('\n', template.start - 1) + 1;
    return { line: source.slice(0, template.start).split('\n').length, column: template.start - lineStart };
}

interface ParseContext {
    source: string;
    pos: number;
    /** Offset of `source[0]` in the template content: a block body is parsed as a source of its own. */
    base: number;
    line: number;     // 1-based
    column: number;   // 0-based
    /** Custom directive names recognized by this parse invocation. */
    customDirectives: Set<string>;
}

// ─── Core Traversal ────────────────────────────────────────────────

/** Advance position by N characters, tracking line/column on every character. */
function advance(ctx: ParseContext, count = 1): void {
    for (let i = 0; i < count && ctx.pos < ctx.source.length; i++) {
        if (ctx.source[ctx.pos] === '\n') {
            ctx.line++;
            ctx.column = 0;
        } else {
            ctx.column++;
        }
        ctx.pos++;
    }
}

/** Get current source location snapshot. */
function getLoc(ctx: ParseContext): SourceLoc {
    return { line: ctx.line, column: ctx.column, offset: ctx.base + ctx.pos };
}

/** Where the expression inside the next `( … )` starts: past the `(` and the blanks after it. */
function parenExprOffset(ctx: ParseContext): number | undefined {
    let p = ctx.source.indexOf('(', ctx.pos);
    if (p < 0) return undefined;
    p++;
    while (p < ctx.source.length && /\s/.test(ctx.source[p])) p++;
    return ctx.base + p;
}

/** Advance past whitespace. */
function skipWhitespace(ctx: ParseContext): void {
    while (ctx.pos < ctx.source.length && /\s/.test(ctx.source[ctx.pos])) {
        advance(ctx);
    }
}

/** Assert current character, throw with line info and context hint if wrong. */
function expect(ctx: ParseContext, char: string, hint?: string): void {
    if (ctx.source[ctx.pos] !== char) {
        const got = ctx.source[ctx.pos] ?? 'end of input';
        const base = `Expected '${char}' at line ${ctx.line}:${ctx.column}, got '${got}'`;
        throw new Error(hint ? `${base}.\n  Hint: ${hint}` : base);
    }
}

/** Check if source at current pos starts with str, without advancing. */
function lookAhead(ctx: ParseContext, str: string): boolean {
    return ctx.source.startsWith(str, ctx.pos);
}

// ─── Node Parsing ──────────────────────────────────────────────────

function parseNodes(ctx: ParseContext, stopAt?: string): TemplateNode[] {
    const nodes: TemplateNode[] = [];
    let htmlBuf = '';
    let htmlLoc: SourceLoc | undefined;
    let htmlShifts: number[] = [];

    function flushHtml() {
        if (htmlBuf) {
            nodes.push({ type: 'html', content: htmlBuf, loc: htmlLoc, ...(htmlShifts.length ? { shifts: htmlShifts } : {}) });
            htmlBuf = '';
            htmlLoc = undefined;
            htmlShifts = [];
        }
    }

    while (ctx.pos < ctx.source.length) {
        if (stopAt && lookAhead(ctx, stopAt)) break;

        // An HTML comment is opaque: whatever it contains is prose ABOUT the template, not
        // template. Parsed as content it split into text + interpolation + text, and a
        // comment mentioning `{{ count }}` or `@if` came back out as live template code.
        // Buffered whole, so nothing inside it is ever a node.
        if (lookAhead(ctx, '<!--')) {
            if (!htmlLoc) htmlLoc = getLoc(ctx);
            const close = ctx.source.indexOf('-->', ctx.pos + 4);
            // Unterminated: the author never closed it, so the rest of the template is prose.
            const end = close === -1 ? ctx.source.length : close + 3;
            htmlBuf += ctx.source.slice(ctx.pos, end);
            advance(ctx, end - ctx.pos);
            continue;
        }

        if (lookAhead(ctx, '{{')) {
            flushHtml();
            nodes.push(parseInterpolation(ctx));
            continue;
        }

        if (ctx.source[ctx.pos] === '@') {
            // @@ escape: emit literal @ without trying to parse as directive
            if (ctx.source[ctx.pos + 1] === '@') {
                if (!htmlLoc) htmlLoc = getLoc(ctx);
                htmlBuf += '@';
                htmlShifts.push(htmlBuf.length);
                advance(ctx, 2); // skip @@
                continue;
            }
            const directive = peekDirective(ctx);
            if (directive) {
                flushHtml();
                const node = parseDirective(ctx, directive);
                if (node) nodes.push(node);
                continue;
            }
            // Unknown directive-shaped token: `@word` followed by `(` or `{` that is a CLOSE typo
            // of a real directive (`@fro (...)` → @for, `@iff {...}` → @if) is almost certainly a
            // mistake — flag it with a suggestion instead of rendering it as text. Tokens
            // with no near match (CSS at-rules like `@media (...)`, arbitrary `@foo {...}`) are
            // left as-is, so genuine literal `@`-text keeps working. Event bindings use `=`.
            const unknown = matchUnknownDirective(ctx);
            if (unknown) {
                const suggestion = closestDirective(unknown);
                if (suggestion) {
                    throw new Error(
                        `Unknown directive @${unknown} at line ${ctx.line}. Did you mean @${suggestion}?` +
                        `\n  Hint: Valid directives are @if, @for, @switch, @try, @defer, @await, @show, @portal.`
                    );
                }
            }
        }

        // <slot name="..." let:var> — parent-side scoped slot (HTML-native syntax)
        if (lookAhead(ctx, '<slot ') || lookAhead(ctx, '<slot>')) {
            const slotNode = tryParseParentSlotTag(ctx);
            if (slotNode) {
                flushHtml();
                nodes.push(slotNode);
                continue;
            }
        }

        if (!htmlLoc) htmlLoc = getLoc(ctx);
        htmlBuf += ctx.source[ctx.pos];
        advance(ctx);
    }

    flushHtml();
    return nodes;
}

// ─── Interpolation {{ expr | pipe }} ───────────────────────────────

function parseInterpolation(ctx: ParseContext): InterpolationNode {
    const loc = getLoc(ctx);
    advance(ctx, 2); // skip {{
    skipWhitespace(ctx);
    const exprOffset = ctx.base + ctx.pos;

    // Find the closing }} ignoring `}}` that appears inside strings or nested object braces.
    const endIdx = findInterpolationEnd(ctx.source, ctx.pos);
    if (endIdx === -1) {
        throw new Error(
            `Unclosed interpolation at line ${ctx.line}.\n` +
            `  Hint: Add '}}' to close the expression. Syntax: {{ expression }}`
        );
    }

    const raw = ctx.source.slice(ctx.pos, endIdx).trim();
    advanceTo(ctx, endIdx + 2); // past }}

    // Split on the pipe operator `|` at expression depth 0, ignoring `|` inside strings,
    // parens/brackets/braces, and the `||` logical-OR / `|=` assignment operators.
    const pipeParts = splitPipes(raw);
    return { type: 'interpolation', expr: pipeParts[0], exprOffset, pipes: pipeParts.slice(1).filter(p => p !== ''), loc };
}

/**
 * Find the closing `}}` of an interpolation starting at `start`, brace/string-aware.
 * Tracks `{ }` nesting (so {{ {a:1} }} works) and skips string literals.
 */
function findInterpolationEnd(source: string, start: number): number {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
            if (ch === '\\') { i++; continue; }
            if (ch === stringChar) inString = false;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; continue; }
        if (ch === '}' && source[i + 1] === '}' && depth === 0) return i;
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
    }
    return -1;
}

/**
 * Split an interpolation body on top-level `|` pipe separators.
 * Ignores `|` inside strings and ()/[]/{}, and never splits on `||` or `|=`.
 */
function splitPipes(raw: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let start = 0;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (inString) {
            if (ch === '\\') { i++; continue; }
            if (ch === stringChar) inString = false;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
        if (ch === ')' || ch === ']' || ch === '}') { depth--; continue; }
        if (ch === '|' && depth === 0) {
            if (raw[i + 1] === '|') { i++; continue; }
            if (raw[i - 1] === '|') continue;
            if (raw[i + 1] === '=') continue;
            parts.push(raw.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(raw.slice(start).trim());
    return parts;
}

// ─── Directive Detection ───────────────────────────────────────────

const DIRECTIVES = ['if', 'for', 'switch', 'require', 'show', 'portal', 'defer', 'try', 'await',
    'let', 'slot', 'raw', 'else', 'catch', 'case', 'default', 'placeholder', 'loading', 'error', 'empty'] as const;

// No module-level mutable state — custom directives passed via parseTemplate() parameter.
function peekDirective(ctx: ParseContext): string | null {
    // Check custom directives first (from parse context, not global)
    for (const d of ctx.customDirectives) {
        const full = `@${d}`;
        if (lookAhead(ctx, full)) {
            const nextChar = ctx.source[ctx.pos + full.length];
            if (!nextChar || /[\s({\n]/.test(nextChar)) return d;
        }
    }
    for (const d of DIRECTIVES) {
        const full = `@${d}`;
        if (lookAhead(ctx, full)) {
            const nextChar = ctx.source[ctx.pos + full.length];
            if (!nextChar || /[\s({\n]/.test(nextChar)) return d;
        }
    }
    return null;
}

// Valid directive-shaped keywords that peekDirective does NOT return (handled in other contexts:
// @transition/@mode follow a block; the rest are block sub-clauses) — never flag these.
const KNOWN_DIRECTIVE_WORDS = new Set<string>([...DIRECTIVES, 'transition', 'mode']);

/**
 * If `@word` (word = letters/digits/-) followed by `(` or `{` sits at the cursor and `word` is
 * not a known directive/custom directive, return `word`; else null. The `(`/`{` requirement
 * excludes event bindings (`@click=`) and stray `@` text.
 */
function matchUnknownDirective(ctx: ParseContext): string | null {
    const m = /^@([a-zA-Z][\w-]*)\s*[({]/.exec(ctx.source.slice(ctx.pos));
    if (!m) return null;
    const word = m[1];
    if (KNOWN_DIRECTIVE_WORDS.has(word) || ctx.customDirectives.has(word)) return null;
    return word;
}

// Directives worth suggesting — the block directives an author actually types (excludes
// sub-clauses like @case/@else/@empty that only appear inside another block).
const SUGGESTABLE_DIRECTIVES = ['if', 'for', 'switch', 'require', 'show', 'portal', 'defer', 'try', 'await', 'slot'];

/** Nearest suggestable directive to `word` by Levenshtein distance (≤ 2), or null. A tight
 *  threshold keeps CSS at-rules and arbitrary `@word` text from being falsely flagged. */
function closestDirective(word: string): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const d of SUGGESTABLE_DIRECTIVES) {
        const dist = levenshtein(word, d);
        if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return bestDist <= 2 ? best : null;
}

/** Classic Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[a.length][b.length];
}

function parseDirective(ctx: ParseContext, directive: string): TemplateNode | null {
    const loc = getLoc(ctx);
    advance(ctx, directive.length + 1); // skip @directive
    skipWhitespace(ctx);

    switch (directive) {
        case 'if': return parseIf(ctx, loc);
        case 'for': return parseFor(ctx, loc);
        case 'switch': return parseSwitch(ctx, loc);
        case 'require': return parseRequire(ctx, loc);
        case 'show': return parseShow(ctx, loc);
        case 'portal': return parsePortal(ctx, loc);
        case 'defer': return parseDefer(ctx, loc);
        case 'await': return parseAwait(ctx, loc);
        case 'try': return parseTry(ctx, loc);
        case 'let': return parseLet(ctx, loc);
        case 'slot': return parseSlotTemplate(ctx, loc);
        case 'raw': return parseRaw(ctx, loc);
        case 'else':
            throw new Error(
                `Unexpected @else at line ${ctx.line} — no matching @if found.\n` +
                `  Hint: @else must appear immediately after an @if { ... } block.`
            );
        case 'catch':
            throw new Error(
                `Unexpected @catch at line ${ctx.line} — no matching @try found.\n` +
                `  Hint: @catch must appear immediately after a @try { ... } block.`
            );
        case 'case':
        case 'default':
            throw new Error(
                `Unexpected @${directive} at line ${ctx.line} — not inside a @switch block.\n` +
                `  Hint: @${directive} must appear inside @switch (expr) { @case (...) { ... } }.`
            );
        case 'placeholder':
        case 'loading':
        case 'error':
            throw new Error(
                `Unexpected @${directive} at line ${ctx.line} — not after a @defer or @await block.\n` +
                `  Hint: @${directive} must appear after @defer (trigger) { ... } or @await (condition) { ... }.`
            );
        default:
            // Check custom plugin directives
            if (ctx.customDirectives.has(directive)) {
                const expr = parseParenthesized(ctx);
                skipWhitespace(ctx);
                const body = parseBlock(ctx);
                return { type: 'custom-directive', name: directive, expr, body, loc };
            }
            throw new Error(
                `Unknown directive @${directive} at line ${ctx.line}.\n` +
                `  Hint: Valid directives are @if, @for, @switch, @try, @defer, @await, @show, @portal, @transition.`
            );
    }
}

// ─── @if ───────────────────────────────────────────────────────────

function parseIf(ctx: ParseContext, loc: SourceLoc): IfNode {
    const exprOffset = parenExprOffset(ctx);
    const condition = parseParenthesized(ctx);
    skipWhitespace(ctx);
    const transition = tryParseTransition(ctx);
    skipWhitespace(ctx);
    const body = parseBlock(ctx);

    skipWhitespace(ctx);
    let elseBody: TemplateNode[] | undefined;
    if (lookAhead(ctx, '@else')) {
        advance(ctx, 5); // skip @else
        skipWhitespace(ctx);

        if (lookAhead(ctx, '@if')) {
            const elseLoc = getLoc(ctx);
            advance(ctx, 3); // skip @if
            skipWhitespace(ctx);
            elseBody = [parseIf(ctx, elseLoc)];
        } else if (/^if\s*\(/.test(ctx.source.slice(ctx.pos))) {
            const elseLoc = getLoc(ctx);
            advance(ctx, 2); // skip "if"
            skipWhitespace(ctx);
            elseBody = [parseIf(ctx, elseLoc)];
        } else {
            elseBody = parseBlock(ctx);
        }
    }

    return { type: 'if', condition, exprOffset, body, elseBody, transition, loc };
}

// ─── @for ──────────────────────────────────────────────────────────

/**
 * Parse a @for header: `items as item[, index]; track expr`, supporting nested object/array
 * destructuring in the item binding. Returns null if the structure is invalid.
 */
function parseForHeader(raw: string): { items: string; item: string; indexVar?: string; track: string } | null {
    // Split into the loop part and the `track` part at the top-level `;`.
    const semi = findStatementEnd(raw, 0);
    if (semi === -1) return null;
    const loopPart = raw.slice(0, semi).trim();
    const trackPart = raw.slice(semi + 1).trim();
    const trackMatch = trackPart.match(/^track\s+(.+)$/s);
    if (!trackMatch) return null;
    const track = trackMatch[1].trim();
    if (!track) return null;

    // Find the top-level ` as ` separating the collection from the binding.
    const asIdx = findTopLevelKeyword(loopPart, 'as');
    if (asIdx === -1) return null;
    const items = loopPart.slice(0, asIdx).trim();
    let bindingPart = loopPart.slice(asIdx + 2).trim(); // skip 'as'

    // Optional `, index` after the binding — the comma at top level AFTER any balanced
    // destructuring pattern. Split at the top-level comma that follows the binding.
    let indexVar: string | undefined;
    const topComma = findTopLevelComma(bindingPart);
    if (topComma !== -1) {
        const after = bindingPart.slice(topComma + 1).trim();
        if (/^\w+$/.test(after)) {
            indexVar = after;
            bindingPart = bindingPart.slice(0, topComma).trim();
        }
    }
    const item = bindingPart.trim();
    if (!items || !item) return null;
    return { items, item, indexVar, track };
}

/** Index of a standalone keyword (` kw `) at top level (string/bracket-aware), or -1. */
function findTopLevelKeyword(s: string, kw: string): number {
    let depth = 0, inString = false, stringChar = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (ch === '\\') { i++; continue; }
            if (ch === stringChar) inString = false;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
        if (ch === ')' || ch === ']' || ch === '}') { depth--; continue; }
        if (depth === 0 && s.startsWith(kw, i) &&
            /\s/.test(s[i - 1] ?? ' ') && /\s/.test(s[i + kw.length] ?? ' ')) {
            return i;
        }
    }
    return -1;
}

/** Index of the first top-level comma (string/bracket-aware), or -1. */
function findTopLevelComma(s: string): number {
    let depth = 0, inString = false, stringChar = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (ch === '\\') { i++; continue; }
            if (ch === stringChar) inString = false;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
        if (ch === ')' || ch === ']' || ch === '}') { depth--; continue; }
        if (ch === ',' && depth === 0) return i;
    }
    return -1;
}

function parseFor(ctx: ParseContext, loc: SourceLoc): ForNode {
    const exprOffset = parenExprOffset(ctx);
    const raw = parseParenthesized(ctx);
    skipWhitespace(ctx);
    const transition = tryParseTransition(ctx);
    skipWhitespace(ctx);

    // Supports (with nested destructuring like `{ id, user: { name } }`):
    //   @for (items as item; track key)
    //   @for (items as item, i; track key)            ← with index
    //   @for (entries as { id, name }; track id)      ← destructuring
    //   @for (entries as { id, user: { name } }, i; track id) ← nested destructuring + index
    const parsed = parseForHeader(raw);
    if (!parsed) {
        throw new Error(
            `Invalid @for syntax: "${raw}" at line ${ctx.line}.\n` +
            `  Expected: @for (items as item; track item.id) { ... }\n` +
            `  With index: @for (items as item, i; track item.id) { ... }\n` +
            `  Destructuring: @for (entries as { key, value }; track key) { ... }\n` +
            `  The 'as' keyword separates the collection from the loop variable.\n` +
            `  The 'track' keyword specifies the unique key for each item.`
        );
    }

    const { items, item, indexVar, track } = parsed;
    const body = parseBlock(ctx);

    // Optional @empty block — shown when the array is empty
    let emptyBody: TemplateNode[] | undefined;
    skipWhitespace(ctx);
    if (lookAhead(ctx, '@empty')) {
        advance(ctx, 6); // skip @empty
        skipWhitespace(ctx);
        emptyBody = parseBlock(ctx);
    }

    return { type: 'for', items: items.trim(), exprOffset, item, index: indexVar, track: track.trim(), body, emptyBody, transition, loc };
}

// ─── @switch ───────────────────────────────────────────────────────

function parseSwitch(ctx: ParseContext, loc: SourceLoc): SwitchNode {
    const expr = parseParenthesized(ctx);
    skipWhitespace(ctx);
    expect(ctx, '{', '@switch body must start with {. Syntax: @switch (expr) { @case (...) { ... } }');
    advance(ctx); // skip {

    const cases: { value: string; body: TemplateNode[] }[] = [];
    let defaultBody: TemplateNode[] | undefined;

    while (ctx.pos < ctx.source.length) {
        skipWhitespace(ctx);
        if (ctx.source[ctx.pos] === '}') {
            advance(ctx); // skip }
            break;
        }

        if (lookAhead(ctx, '@case')) {
            advance(ctx, 5); // skip @case
            skipWhitespace(ctx);
            const value = parseParenthesized(ctx);
            skipWhitespace(ctx);
            const body = parseBlock(ctx);
            cases.push({ value: value.replace(/^['"]|['"]$/g, ''), body });
        } else if (lookAhead(ctx, '@default')) {
            advance(ctx, 8); // skip @default
            skipWhitespace(ctx);
            defaultBody = parseBlock(ctx);
        } else {
            throw new Error(
                `Expected @case or @default inside @switch at line ${ctx.line}.\n` +
                `  Hint: @switch body can only contain @case (value) { ... } and @default { ... }.`
            );
        }
    }

    return { type: 'switch', expr, cases, defaultBody, loc };
}

// ─── @require ──────────────────────────────────────────────────────

function parseRequire(ctx: ParseContext, loc: SourceLoc): RequireNode {
    const raw = parseParenthesized(ctx);
    skipWhitespace(ctx);
    const permission = raw.replace(/^['"]|['"]$/g, '');
    const body = parseBlock(ctx);

    skipWhitespace(ctx);
    let elseBody: TemplateNode[] | undefined;
    if (lookAhead(ctx, '@else')) {
        advance(ctx, 5); // skip @else
        skipWhitespace(ctx);
        elseBody = parseBlock(ctx);
    }

    return { type: 'require', permission, body, elseBody, loc };
}

// ─── @show ─────────────────────────────────────────────────────────

function parseShow(ctx: ParseContext, loc: SourceLoc): ShowNode {
    const condition = parseParenthesized(ctx);
    skipWhitespace(ctx);
    const body = parseBlock(ctx);
    return { type: 'show', condition, body, loc };
}

// ─── @portal ───────────────────────────────────────────────────────

function parsePortal(ctx: ParseContext, loc: SourceLoc): PortalNode {
    const raw = parseParenthesized(ctx);
    skipWhitespace(ctx);
    const target = raw.replace(/^['"]|['"]$/g, '');
    const body = parseBlock(ctx);
    return { type: 'portal', target, body, loc };
}

// ─── @defer ────────────────────────────────────────────────────────

/**
 * Parse @defer with trigger and optional @placeholder/@loading/@error children.
 * Syntax: @defer (trigger) { content } @placeholder { ... } @loading { ... } @error { ... }
 */
function parseDefer(ctx: ParseContext, loc: SourceLoc): DeferNode {
    const trigger = parseParenthesized(ctx);
    skipWhitespace(ctx);
    const body = parseBlock(ctx);

    let placeholder: TemplateNode[] | undefined;
    let loading: TemplateNode[] | undefined;
    let error: TemplateNode[] | undefined;

    // Parse optional sub-blocks
    while (ctx.pos < ctx.source.length) {
        skipWhitespace(ctx);
        if (lookAhead(ctx, '@placeholder')) {
            advance(ctx, 12); // skip @placeholder
            skipWhitespace(ctx);
            placeholder = parseBlock(ctx);
        } else if (lookAhead(ctx, '@loading')) {
            advance(ctx, 8); // skip @loading
            skipWhitespace(ctx);
            loading = parseBlock(ctx);
        } else if (lookAhead(ctx, '@error')) {
            advance(ctx, 6); // skip @error
            skipWhitespace(ctx);
            error = parseBlock(ctx);
        } else {
            break;
        }
    }

    return { type: 'defer', trigger, body, placeholder, loading, error, loc };
}

// ─── @await ───────────────────────────────────────────────────────

/**
 * Parse @await — universal async boundary directive.
 * Syntax: @await (condition) { content } @loading { ... } @error (err) { ... }
 * Extended: @await (condition) { minMs: 200, maxMs: 5000 } { content } @loading { ... }
 * Condition is a boolean signal expression — body shows when true, @loading when false.
 */
function parseAwait(ctx: ParseContext, loc: SourceLoc): AwaitNode {
    const condition = parseParenthesized(ctx);
    skipWhitespace(ctx);

    // Optional timing options: { minMs: 200, maxMs: 5000 }
    let minMs: number | undefined;
    let maxMs: number | undefined;
    // Peek: if next block looks like options (contains minMs/maxMs), parse it
    const savedPos = ctx.pos;
    const savedLine = ctx.line;
    const savedCol = ctx.column;
    if (ctx.source[ctx.pos] === '{') {
        const blockStart = ctx.pos + 1;
        const blockEnd = findClosingBrace(ctx.source, blockStart);
        if (blockEnd > blockStart) {
            const preview = ctx.source.slice(blockStart, blockEnd).trim();
            if (preview.includes('minMs') || preview.includes('maxMs')) {
                // Parse as options, not body
                advanceTo(ctx, blockEnd + 1);
                for (const part of preview.split(',')) {
                    const m = part.trim().match(/^(minMs|maxMs)\s*:\s*(\d+)$/);
                    if (m) {
                        if (m[1] === 'minMs') minMs = Number(m[2]);
                        else maxMs = Number(m[2]);
                    }
                }
                skipWhitespace(ctx);
            } else {
                // Not options — restore position, parse as body below
                ctx.pos = savedPos;
                ctx.line = savedLine;
                ctx.column = savedCol;
            }
        }
    }

    const body = parseBlock(ctx);

    let loading: TemplateNode[] | undefined;
    let errorBody: TemplateNode[] | undefined;
    let errorVar: string | undefined;
    let retryVar: string | undefined;

    // Parse optional @loading / @error sub-blocks
    while (ctx.pos < ctx.source.length) {
        skipWhitespace(ctx);
        if (lookAhead(ctx, '@loading')) {
            advance(ctx, 8); // skip @loading
            skipWhitespace(ctx);
            loading = parseBlock(ctx);
        } else if (lookAhead(ctx, '@error')) {
            advance(ctx, 6); // skip @error
            skipWhitespace(ctx);
            // Optional error variable, and optional retry name: @error (err) / @error (err, again)
            if (ctx.source[ctx.pos] === '(') {
                ({ errorVar, retryVar } = parseBoundaryParams(parseParenthesized(ctx), '@error', ctx));
                skipWhitespace(ctx);
            }
            errorBody = parseBlock(ctx);
        } else {
            break;
        }
    }

    return { type: 'await', condition, body, loading, errorBody, errorVar, retryVar, minMs, maxMs, loc };
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * `(err)` or `(err, again)` → the error's name and the retry function's name.
 *
 * The boundary calls the fallback with `(error, retry)`, positionally. Kept as one opaque string with
 * each generator appending its own `, retry`, `@catch (err, retry)` — the literal example of the
 * error-boundary recipe — would emit `(err, retry, retry)`: a duplicate parameter, a SyntaxError in an
 * ES module, and an app that does not load at all. So the author's second name IS the retry function, and anything the boundary cannot honour is refused here rather
 * than surfacing as a blank page.
 */
function parseBoundaryParams(raw: string, directive: string, ctx: ParseContext): { errorVar: string; retryVar: string } {
    const names = raw.split(',').map((s) => s.trim());
    if (names.length > 2) {
        throw new Error(
            `${directive} (${raw.trim()}) at line ${ctx.line} takes at most two names.\n` +
            `  Hint: ${directive} (err) or ${directive} (err, retry) — the error, then the function that retries.`
        );
    }
    for (const n of names) {
        if (!IDENTIFIER.test(n)) {
            throw new Error(
                `${directive} (${raw.trim()}) at line ${ctx.line}: "${n}" is not a valid name.\n` +
                `  Hint: ${directive} (err) or ${directive} (err, retry).`
            );
        }
    }
    if (names.length === 2 && names[0] === names[1]) {
        throw new Error(
            `${directive} (${raw.trim()}) at line ${ctx.line} uses the same name twice.\n` +
            `  Hint: the first name is the error, the second the retry function — ${directive} (err, retry).`
        );
    }
    return { errorVar: names[0], retryVar: names[1] ?? 'retry' };
}

// ─── @try / @catch ────────────────────────────────────────────────

/** Parse @try { ... } @catch (error) { ... } — error boundary directive. */
function parseTry(ctx: ParseContext, loc: SourceLoc): TryNode {
    skipWhitespace(ctx);
    const body = parseBlock(ctx);

    skipWhitespace(ctx);
    if (!lookAhead(ctx, '@catch')) {
        throw new Error(
            `Expected @catch after @try at line ${ctx.line}.\n` +
            `  Hint: @try { ... } must be followed by @catch (errorVar) { ... }.`
        );
    }
    advance(ctx, 6); // skip @catch
    skipWhitespace(ctx);

    const { errorVar, retryVar } = parseBoundaryParams(parseParenthesized(ctx), '@catch', ctx);
    skipWhitespace(ctx);
    const catchBody = parseBlock(ctx);

    return { type: 'try', body, errorVar, retryVar, catchBody, loc };
}

// ─── @slot (parent-side scoped slot template) ─────────────────────

/**
 * Parse @slot(name, { var1, var2 }) { body } — parent-side scoped slot.
 * Syntax: @slot(name) { ... } for scopeless, @slot(name, { a, b }) { ... } for scoped.
 */
function parseSlotTemplate(ctx: ParseContext, loc: SourceLoc): SlotTemplateNode {
    const raw = parseParenthesized(ctx);
    // Parse: "name" or "name, { var1, var2 }"
    const commaIdx = raw.indexOf(',');
    let name: string;
    let scopeVars: string[] = [];

    if (commaIdx === -1) {
        name = raw.trim();
    } else {
        name = raw.slice(0, commaIdx).trim();
        const scopeStr = raw.slice(commaIdx + 1).trim();
        // Extract variable names from destructuring: { value, index }
        const match = scopeStr.match(/^\{([^}]*)\}$/);
        if (match) {
            scopeVars = match[1].split(',').map(v => v.trim()).filter(Boolean);
        } else {
            // Single variable: @slot(name, item)
            scopeVars = [scopeStr];
        }
    }

    skipWhitespace(ctx);
    const body = parseBlock(ctx);
    return { type: 'slot-template', name, scopeVars, body, loc };
}

// ─── @let name = expr; ────────────────────────────────────────────

/**
 * Parse @let — local template variable declaration.
 * Syntax: @let total = items.length * price;
 * The variable is available in subsequent template nodes.
 */
function parseLet(ctx: ParseContext, loc: SourceLoc): LetNode {
    skipWhitespace(ctx);
    // Parse: name = expr;  — the terminating `;` must be at top level (string/brace-aware),
    // so a `;` inside a string literal (e.g. @let s = 'a;b';) does not end the statement early.
    const rest = ctx.source.slice(ctx.pos);
    const nameMatch = rest.match(/^(\w+)\s*=\s*/);
    const semiIdx = nameMatch ? findStatementEnd(rest, nameMatch[0].length) : -1;
    if (!nameMatch || semiIdx === -1) {
        throw new Error(
            `Invalid @let syntax at line ${ctx.line}.\n` +
            `  Expected: @let name = expression;\n` +
            `  Example: @let total = items.length * price;`
        );
    }
    const expr = rest.slice(nameMatch[0].length, semiIdx).trim();
    advanceTo(ctx, ctx.pos + semiIdx + 1); // include the `;`
    return { type: 'let', name: nameMatch[1], expr, loc };
}

// ─── @raw { ... } (literal content, no processing) ───────────────

/**
 * Parse @raw { ... } — emit content as literal HTML text.
 * No {{ }}, @directive, or template processing inside the block.
 * Use for code examples, documentation blocks, or escaping template syntax.
 */
function parseRaw(ctx: ParseContext, loc: SourceLoc): HtmlNode {
    expect(ctx, '{', '@raw must be followed by { ... }');
    advance(ctx); // skip {

    const blockStart = ctx.pos;
    const end = findClosingBrace(ctx.source, blockStart);
    if (end === -1) {
        throw new Error(
            `Unclosed @raw block at line ${loc.line}.\n` +
            `  Hint: Add a matching '}' to close the @raw block.`
        );
    }

    const content = ctx.source.slice(blockStart, end);
    advanceTo(ctx, end + 1); // past closing }

    // The text as written, marked raw. Escaping it here for the html`` literal — backticks and `${`,
    // not the backslash — was escaped a second time downstream: the page showed `a\`b` (#71). Each
    // render path escapes it for where it puts it, and `raw` keeps every other pass away from it.
    return { type: 'html', content, loc, raw: true };
}

// ─── <slot let:> (parent-side, HTML-native syntax) ────────────────

/**
 * Try to parse `<slot name="item" let:label let:raw>...</slot>` as a parent-side slot.
 * Returns SlotTemplateNode if `let:` attributes found, null otherwise (falls through to raw HTML).
 * Does NOT advance ctx if returning null — the caller accumulates the char as HTML.
 */
function tryParseParentSlotTag(ctx: ParseContext): SlotTemplateNode | null {
    // Peek ahead to find the full opening tag without advancing
    const tagEndIdx = findTagEndInSource(ctx.source, ctx.pos);
    if (tagEndIdx === -1) return null;

    const tagStr = ctx.source.slice(ctx.pos, tagEndIdx + 1);
    // Only parent-side if it has let: attributes
    if (!tagStr.includes('let:')) return null;

    const loc = getLoc(ctx);
    // Advance past the opening tag
    advanceTo(ctx, tagEndIdx + 1);

    // Extract slot name
    const nameMatch = tagStr.match(/name\s*=\s*(?:"([^"]*?)"|'([^']*?)')/);
    const name = nameMatch ? (nameMatch[1] ?? nameMatch[2]) : 'default';

    // Extract let: variables: let:label let:raw → ['label', 'raw']
    const scopeVars: string[] = [];
    const letRegex = /\blet:([\w]+)/g;
    let m;
    while ((m = letRegex.exec(tagStr)) !== null) {
        scopeVars.push(m[1]);
    }

    // Self-closing: <slot name="item" let:label />
    const isSelfClosing = tagStr.trimEnd().endsWith('/>');
    if (isSelfClosing) {
        return { type: 'slot-template', name, scopeVars, body: [], loc };
    }

    // Parse inner content until </slot>
    const body = parseNodes(ctx, '</slot>');

    // Consume </slot>
    if (lookAhead(ctx, '</slot>')) {
        advanceTo(ctx, ctx.pos + 7); // </slot>
    }

    return { type: 'slot-template', name, scopeVars, body, loc };
}

/**
 * Find the index of the top-level `;` starting from `from`, skipping string literals and
 * ()/[]/{} nesting. Returns the `;` index, or -1 if none at top level.
 */
function findStatementEnd(s: string, from: number): number {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    for (let i = from; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (ch === '\\') { i++; continue; }
            if (ch === stringChar) inString = false;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === ';' && depth === 0) return i;
    }
    return -1;
}

/** Find the closing > of a tag in source, skipping quoted attributes. */
function findTagEndInSource(source: string, start: number): number {
    let inQuote = false;
    let quoteChar = '';
    for (let i = start + 1; i < source.length; i++) {
        if (inQuote) {
            if (source[i] === quoteChar) inQuote = false;
            continue;
        }
        if (source[i] === '"' || source[i] === "'") { inQuote = true; quoteChar = source[i]; continue; }
        if (source[i] === '>') return i;
    }
    return -1;
}

// ─── @transition ───────────────────────────────────────────────────

/** `flipAnimate`'s own default, named here so the emitted value is explicit. */
const MOVE_DURATION_MS = '300';

function tryParseTransition(ctx: ParseContext): TransitionConfig | undefined {
    // `@move` stands alone, unlike `@stagger` and `@mode` — a list that should animate its reorder
    // and NOT animate arrivals is an ordinary thing to want, and requiring a `@transition` to reach
    // it would force an enter animation nobody asked for.
    if (!lookAhead(ctx, '@transition')) {
        const move = tryParseMove(ctx);
        return move ? { move } : undefined;
    }
    advance(ctx, 11); // skip @transition
    skipWhitespace(ctx);

    const raw = parseParenthesized(ctx);
    const parts = raw.split(',').map(p => p.trim().replace(/^['"]|['"]$/g, ''));

    const config: TransitionConfig = {
        enter: parts[0] || undefined,
        exit: parts[1] || parts[0] || undefined,
    };

    // Optional @stagger(n) — delay increment per list item
    skipWhitespace(ctx);
    if (lookAhead(ctx, '@stagger')) {
        advance(ctx, 8); // skip @stagger
        skipWhitespace(ctx);
        const staggerVal = parseParenthesized(ctx);
        config.stagger = parseFloat(staggerVal) || 0;
    }

    // Optional @mode('out-in') — transition sequencing
    skipWhitespace(ctx);
    if (lookAhead(ctx, '@mode')) {
        advance(ctx, 5); // skip @mode
        skipWhitespace(ctx);
        const modeVal = parseParenthesized(ctx);
        config.mode = modeVal.replace(/^['"]|['"]$/g, '');
    }

    const move = tryParseMove(ctx);
    if (move) config.move = move;

    return config;
}

/** `@move(200)` / `@move()` → the FLIP duration, as the digits the runtime parses out. */
function tryParseMove(ctx: ParseContext): string | undefined {
    skipWhitespace(ctx);
    if (!lookAhead(ctx, '@move')) return undefined;
    advance(ctx, 5); // skip @move
    skipWhitespace(ctx);
    const raw = parseParenthesized(ctx).replace(/^['"]|['"]$/g, '').trim();
    const ms = parseFloat(raw);
    return Number.isFinite(ms) && ms > 0 ? String(ms) : MOVE_DURATION_MS;
}

// ─── Parenthesized Expression ──────────────────────────────────────

/** Parse content between ( and ), tracking depth. Returns inner content trimmed. */
function parseParenthesized(ctx: ParseContext): string {
    expect(ctx, '(', 'Directive expression must be wrapped in parentheses: @directive (expression) { ... }');
    advance(ctx); // skip (

    let depth = 1;
    const start = ctx.pos;
    // String-aware: a `)` inside a string literal (e.g. @if (name.includes(')'))) must NOT
    // close the directive expression.
    let inString = false;
    let stringChar = '';

    while (ctx.pos < ctx.source.length && depth > 0) {
        const ch = ctx.source[ctx.pos];
        if (inString) {
            if (ch === '\\') { advance(ctx, 2); continue; }
            if (ch === stringChar) inString = false;
            advance(ctx);
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; advance(ctx); continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) break; }
        advance(ctx);
    }

    const content = ctx.source.slice(start, ctx.pos).trim();
    advance(ctx); // skip )
    return content;
}

// ─── Block { ... } ────────────────────────────────────────────────

/**
 * Parse a { ... } block. Finds matching } respecting string literals,
 * then recursively parses the inner content.
 */
function parseBlock(ctx: ParseContext): TemplateNode[] {
    skipWhitespace(ctx);
    expect(ctx, '{', 'Block body must start with {. Check for unbalanced braces above this line.');
    advance(ctx); // skip {

    const blockStartLoc = getLoc(ctx);
    const blockStart = ctx.pos;
    const end = findClosingBrace(ctx.source, blockStart);
    if (end === -1) {
        throw new Error(
            `Unclosed block at line ${blockStartLoc.line}.\n` +
            `  Hint: Add a matching '}' to close the block. Check for unbalanced braces in string literals.`
        );
    }

    const blockContent = ctx.source.slice(blockStart, end);
    advanceTo(ctx, end + 1); // past closing }

    // Recursively parse block content, preserving line offset
    const innerCtx: ParseContext = {
        source: blockContent,
        pos: 0,
        base: ctx.base + blockStart,
        line: blockStartLoc.line,
        column: blockStartLoc.column,
        customDirectives: ctx.customDirectives,
    };
    return parseNodes(innerCtx);
}

/**
 * Find closing } matching depth. Respects string literals with proper escape handling.
 * Does NOT modify ctx — pure position lookup.
 */
function findClosingBrace(source: string, start: number): number {
    let depth = 1;
    let inString = false;
    let stringChar = '';
    let inExpression = false; // inside {{ }}

    for (let i = start; i < source.length; i++) {
        const ch = source[i];

        if (inString) {
            if (ch === '\\') { i++; continue; } // skip escaped char
            if (ch === stringChar) inString = false;
            continue;
        }

        // Track {{ }} expressions — quotes inside are JS string delimiters
        if (ch === '{' && source[i + 1] === '{') {
            inExpression = true;
        }
        if (ch === '}' && source[i + 1] === '}' && inExpression) {
            inExpression = false;
        }

        // Only treat quotes as string delimiters in safe contexts:
        // - After = (HTML attribute value)
        // - Inside {{ }} expressions (JS context)
        // Free-standing quotes in HTML text (like "you'd") are NOT string openers.
        if (ch === '"' || ch === "'" || ch === '`') {
            const prev = i > 0 ? source[i - 1] : '';
            if (prev === '=' || inExpression) {
                inString = true;
                stringChar = ch;
                continue;
            }
        }

        if (ch === '{') depth++;
        if (ch === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
}

// ─── Position Helpers ──────────────────────────────────────────────

/** Advance ctx to a target position, tracking every character for accurate line/column. */
function advanceTo(ctx: ParseContext, targetPos: number): void {
    while (ctx.pos < targetPos && ctx.pos < ctx.source.length) {
        advance(ctx);
    }
}
