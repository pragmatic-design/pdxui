// Script Analyzer — Helper functions for parsing script blocks.
// Extracted from script-analyzer.ts for modularity.

import type { FormFieldDecl, HeadInfo, RouteInfo, RouteParamDecl, SearchParamDecl } from './script-analyzer-types';
import { skipNonCode, findClosing, endsWithExpressionKeyword } from './tokenizer';

// ─── Tokenizer-Based Type Extraction ─────────────────────────────

/**
 * Extract a TypeScript type annotation from a declaration line.
 * Starts after the `:` and reads until `=` or `;` or end-of-string at bracket depth 0.
 * Handles generics (Map<string, Item[]>), unions, intersections, function types.
 *
 * @param line - The trimmed declaration line (e.g. "name: Map<string, Item[]> = new Map()")
 * @param colonPos - Position of the `:` separator in `line`
 * @returns { type, rest } where `type` is the extracted type, `rest` is everything after (default value etc.)
 */
export function extractTypeAnnotation(line: string, colonPos: number): { type: string; rest: string } {
    const afterColon = colonPos + 1;
    // Scan for `=` (not `=>`) or `;` at bracket depth 0 — these terminate the type.
    // Tracks < > for generics. `=>` is treated as arrow (not generic closer).
    let endPos = -1;
    let depth = 0;
    for (let i = afterColon; i < line.length; i++) {
        const skip = skipNonCode(line, i);
        if (skip !== null) { i = skip - 1; continue; }
        const ch = line[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === '<') depth++;
        else if (ch === '>' && depth > 0 && line[i - 1] !== '=') depth--; // skip `=>`
        else if (ch === '=' && depth === 0) {
            // `=>` is part of function type, not assignment
            if (i + 1 < line.length && line[i + 1] === '>') { i++; continue; }
            endPos = i;
            break;
        } else if (ch === ';' && depth === 0) {
            endPos = i;
            break;
        }
    }
    if (endPos === -1) {
        return { type: line.slice(afterColon).trim().replace(/;$/, ''), rest: '' };
    }
    const type = line.slice(afterColon, endPos).trim();
    const rest = line.slice(endPos).trim();
    return { type, rest };
}

/**
 * Extract a brace-delimited block from a string starting at a given position.
 * Uses findClosing for proper depth tracking across strings/comments.
 *
 * @param text - The full text
 * @param bracePos - Position of the opening `{`
 * @returns The content between braces (inclusive of braces), or null if no match.
 */
export function extractBraceBlock(text: string, bracePos: number): string | null {
    if (text[bracePos] !== '{') return null;
    const closePos = findClosing(text, bracePos);
    if (closePos === -1) return null;
    return text.slice(bracePos, closePos + 1);
}

/**
 * Parse a @fetch declaration using tokenizer-based extraction.
 * Handles: @fetch name: 'METHOD /url' as TypeAnnotation { options };
 *
 * @returns Parsed parts or null if not a valid @fetch line.
 */
export function parseFetchDecl(trimmed: string): {
    name: string; method: string; url: string;
    type?: string; options?: string;
    /** The type was written `: Type`, which is not the syntax: read anyway, so the error can name it. */
    typeAfterColon?: boolean;
} | null {
    // Match: @fetch name :
    const prefixMatch = trimmed.match(/^@fetch\s+(\w+)\s*:\s*/);
    if (!prefixMatch) return null;

    const name = prefixMatch[1];
    let pos = prefixMatch[0].length;

    // Extract quoted string: 'METHOD /url' or "METHOD /url" or `METHOD /url`
    const quoteChar = trimmed[pos];
    if (quoteChar !== "'" && quoteChar !== '"' && quoteChar !== '`') return null;
    const quoteEnd = trimmed.indexOf(quoteChar, pos + 1);
    if (quoteEnd === -1) return null;
    const urlSpec = trimmed.slice(pos + 1, quoteEnd);

    // Split METHOD and URL from the spec
    const spaceIdx = urlSpec.indexOf(' ');
    if (spaceIdx === -1) return null;
    const method = urlSpec.slice(0, spaceIdx).toUpperCase();
    const url = urlSpec.slice(spaceIdx + 1).trim();

    pos = quoteEnd + 1;
    let rest = trimmed.slice(pos).trim();

    // Optional: as TypeAnnotation — or `: Type`, the form TypeScript would suggest, which is read the
    // same way so that neither the type nor the options after it are dropped (the caller reports it).
    // Can't use findAtDepthZero for `{` since it's also a depth opener.
    // Scan manually: type ends at `{` or `;` at bracket depth 0.
    let type: string | undefined;
    const typeAfterColon = rest.startsWith(':');
    if (rest.startsWith('as ') || typeAfterColon) {
        rest = rest.slice(typeAfterColon ? 1 : 3).trimStart();
        let typeEnd = -1;
        let depth = 0;
        for (let i = 0; i < rest.length; i++) {
            const skip = skipNonCode(rest, i);
            if (skip !== null) { i = skip - 1; continue; }
            const ch = rest[i];
            if (ch === '(' || ch === '[') depth++;
            else if (ch === ')' || ch === ']') depth--;
            else if (ch === '<') depth++;
            else if (ch === '>' && depth > 0) depth--;
            // `{` or `;` at depth 0 terminates the type annotation
            else if ((ch === '{' || ch === ';') && depth === 0) {
                typeEnd = i;
                break;
            }
        }
        if (typeEnd === -1) {
            type = rest.replace(/;?\s*$/, '').trim();
            rest = '';
        } else {
            type = rest.slice(0, typeEnd).trim();
            rest = rest.slice(typeEnd).trim();
        }
    }

    // Optional: { options } block
    let options: string | undefined;
    if (rest.startsWith('{')) {
        const block = extractBraceBlock(rest, 0);
        if (block) options = block;
    }

    return { name, method, url, type: type || undefined, options, typeAfterColon: typeAfterColon || undefined };
}

/**
 * The prefetch policies the router has (`PREFETCH_POLICIES` in router/src/prefetch.ts). Written
 * here because the compiler imports no runtime package; `tests/prefetch-policy.test.ts` reads the
 * router's list and fails when the two differ.
 */
export const PREFETCH_POLICIES: readonly string[] = ['hover', 'eager', 'viewport', 'never'];

/**
 * The options `resource()` takes, as `ResourceOptions` in core declares them. The compiler does not
 * import core, so the list is written here; `tests/fetch-strict.test.ts` reads the interface and
 * fails when the two differ.
 */
export const FETCH_OPTION_KEYS: readonly string[] = [
    'key', 'staleTime', 'retry', 'tags', 'enabled', 'transform', 'onSuccess', 'onError', 'cache', 'stale',
];

/**
 * The top-level keys of an `@fetch` options block — `{ staleTime: 1, cache: { ttl: 5 } }` gives
 * `staleTime` and `cache` — including a shorthand (`{ staleTime }`). A spread names no key and is
 * skipped: what it carries cannot be known here.
 */
export function fetchOptionKeys(block: string): string[] {
    return objectKeys(block).keys;
}

/**
 * The top-level keys of an object literal `{ … }`, written as `key: value` or as a shorthand, and
 * whether it spreads another object in — whose keys cannot be listed from the text.
 */
export function objectKeys(block: string): { keys: string[]; spread: boolean } {
    const keys: string[] = [];
    let spread = false;
    let depth = 0;
    let expectKey = false;
    for (let i = 0; i < block.length; i++) {
        const skip = skipNonCode(block, i);
        if (skip !== null) { i = skip - 1; continue; }
        const ch = block[i];
        if (ch === '{' || ch === '(' || ch === '[') {
            depth++;
            if (depth === 1) expectKey = true;
            continue;
        }
        if (ch === '}' || ch === ')' || ch === ']') { depth--; continue; }
        if (depth !== 1) continue;
        if (ch === ',') { expectKey = true; continue; }
        if (expectKey && /[A-Za-z_$]/.test(ch)) {
            // Match: an identifier at the start of a member — `staleTime` in `staleTime: 1` or `{ staleTime }`.
            const m = /^[A-Za-z_$][\w$]*/.exec(block.slice(i))!;
            keys.push(m[0]);
            i += m[0].length - 1;
            expectKey = false;
        } else if (expectKey && ch === '.') {
            expectKey = false;
            spread = true;
        }
    }
    return { keys, spread };
}

/**
 * Extract @search block content using depth-aware brace matching.
 * Handles nested braces: @search { filter: { status: string } };
 */
export function extractSearchBlock(trimmed: string): string | null {
    const bracePos = trimmed.indexOf('{');
    if (bracePos === -1) return null;
    const block = extractBraceBlock(trimmed, bracePos);
    return block;
}

// ─── Helpers ───────────────────────────────────────────────────────

/** Map a TypeScript type annotation to its runtime constructor name.
 *  'string' → 'String', 'number' → 'Number', 'Item[]' → 'Array', 'Foo' → 'Object' */
export function tsToRuntimeType(tsType: string): string {
    const base = tsType.replace(/\[\]$/, '');
    if (tsType.endsWith('[]')) return 'Array';
    switch (base.toLowerCase()) {
        case 'string': return 'String';
        case 'number': return 'Number';
        case 'boolean': return 'Boolean';
        default: return 'Object';
    }
}

/**
 * Extract the body of a function call that may span multiple lines.
 * Tracks parenthesis depth to find the matching closing paren.
 * Returns the content between the outer parens and the last line consumed.
 *
 * Example: extractCallBody(lines, 5, 'onMount') on:
 *   line 5: onMount(() => {
 *   line 6:   console.log('ready');
 *   line 7: });
 * Returns: { content: "() => {\n  console.log('ready');\n}", endLine: 7 }
 */
export function extractCallBody(lines: string[], startLine: number, _fnName: string): { content: string; endLine: number } {
    let depth = 0;
    let started = false;
    const collected: string[] = [];

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        for (let j = 0; j < line.length; j++) {
            const skip = skipNonCode(line, j);
            if (skip !== null) { j = skip - 1; continue; }
            if (line[j] === '(') { depth++; started = true; }
            if (line[j] === ')') depth--;
        }
        collected.push(line);
        if (started && depth === 0) {
            const full = collected.join('\n');
            const openIdx = full.indexOf('(');
            // Find the BALANCED closing paren (string/comment-aware), not lastIndexOf —
            // which breaks on `b = $signal(1)` where a later declarator owns the last `)`.
            const closeIdx = findClosing(full, openIdx);
            const end = closeIdx === -1 ? full.lastIndexOf(')') : closeIdx;
            const inner = full.slice(openIdx + 1, end).trim();
            return { content: inner, endLine: i };
        }
    }
    return { content: collected.join('\n'), endLine: lines.length - 1 };
}

/** Split $watch arguments: source, callback [, options] at top-level commas. */
export function splitWatchArgs(content: string): { source: string; callback: string; options?: string } {
    let depth = 0;
    const commaPositions: number[] = [];
    for (let i = 0; i < content.length; i++) {
        const skip = skipNonCode(content, i);
        if (skip !== null) { i = skip - 1; continue; }
        const ch = content[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        if (ch === ')' || ch === ']' || ch === '}') depth--;
        if (ch === ',' && depth === 0) commaPositions.push(i);
    }
    if (commaPositions.length === 0) return { source: content, callback: '' };
    const source = content.slice(0, commaPositions[0]).trim();
    if (commaPositions.length === 1) {
        return { source, callback: content.slice(commaPositions[0] + 1).trim() };
    }
    const callback = content.slice(commaPositions[0] + 1, commaPositions[1]).trim();
    const options = content.slice(commaPositions[1] + 1).trim();
    return { source, callback, options: options || undefined };
}

/** Extract a block (function body etc) tracking brace depth. */
export function extractBlock(lines: string[], startLine: number): { content: string; endLine: number } {
    let depth = 0;
    let started = false;
    const collected: string[] = [];

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        for (let j = 0; j < line.length; j++) {
            const skip = skipNonCode(line, j);
            if (skip !== null) { j = skip - 1; continue; }
            if (line[j] === '{') { depth++; started = true; }
            if (line[j] === '}') depth--;
        }
        collected.push(line);
        if (started && depth === 0) {
            return { content: collected.join('\n'), endLine: i };
        }
    }
    return { content: collected.join('\n'), endLine: lines.length - 1 };
}

/**
 * Parse inline form schema from @form block content.
 * Input: '@form contact: {\n  name: string { required, minLength: 3 },\n  email: string { required, email },\n}'
 * Extracts field declarations with types and validation rules.
 */
export function parseInlineFormSchema(blockContent: string): FormFieldDecl[] {
    const fields: FormFieldDecl[] = [];
    // Extract content between outer braces
    const braceStart = blockContent.indexOf('{');
    const braceEnd = blockContent.lastIndexOf('}');
    if (braceStart === -1 || braceEnd === -1) return fields;
    const inner = blockContent.slice(braceStart + 1, braceEnd).trim();

    // Split by commas at depth 0 (respecting nested braces/brackets)
    const fieldDecls = splitAtTopLevelCommas(inner);

    for (const decl of fieldDecls) {
        const trimmed = decl.trim();
        if (!trimmed) continue;

        // Match: name?: type { rules } OR name: type { rules } OR items: [{ ... }]
        // Array field: items: [{ product: string { required }, quantity: number }]
        const arrayMatch = trimmed.match(/^(\w+)\s*(\?)?\s*:\s*\[\s*\{/);
        if (arrayMatch) {
            const name = arrayMatch[1];
            const optional = !!arrayMatch[2];
            // Extract the inner object schema from [{ ... }]
            const bracketStart = trimmed.indexOf('[');
            const bracketEnd = trimmed.lastIndexOf(']');
            const innerSchema = trimmed.slice(bracketStart, bracketEnd + 1);
            // Recursively parse the inner object
            // For simplicity, parse sub-fields from the inner object
            const subInner = innerSchema.slice(2, -2).trim(); // strip [{ and }]
            const subDecls = splitAtTopLevelCommas(subInner);
            const arrayFields: FormFieldDecl[] = [];
            for (const sub of subDecls) {
                const parsed = parseFieldDecl(sub.trim());
                if (parsed) arrayFields.push(parsed);
            }
            fields.push({ name, type: 'array', required: !optional, isArray: true, rules: [], arrayFields });
            continue;
        }

        // Nested object: `address: { street: string, city: string }`. Its brace opens where a
        // type would be, so `parseFieldDecl` matches nothing and the declaration would be dropped
        // in silence — no field, no diagnostic, and controls that swallow everything typed into
        // them. Tested AFTER the array branch: `[{ … }]` opens a bracket.
        const objectMatch = trimmed.match(/^(\w+)\s*(\?)?\s*:\s*\{/);
        if (objectMatch) {
            const name = objectMatch[1];
            const inner = trimmed.slice(trimmed.indexOf('{') + 1, trimmed.lastIndexOf('}')).trim();
            const objectFields: FormFieldDecl[] = [];
            for (const sub of splitAtTopLevelCommas(inner)) {
                const parsed = parseFieldDecl(sub.trim());
                if (parsed) objectFields.push(parsed);
            }
            if (objectFields.length > 0) {
                fields.push({
                    name, type: 'object', required: !objectMatch[2],
                    isArray: false, rules: [], objectFields,
                });
                continue;
            }
        }

        const parsed = parseFieldDecl(trimmed);
        if (parsed) fields.push(parsed);
    }

    return fields;
}

/** Parse a single field declaration: 'name: string { required, minLength: 3 }' */
export function parseFieldDecl(decl: string): FormFieldDecl | null {
    // Match: name?: type { rules } or name: type (no rules). The type may end in `[]`: a field whose
    // value is a list (`skills: string[]`), bound to a tag input or a checkbox group — a scalar
    // field holding an array, not the rows of `[{ … }]`.
    // Groups: [1]=name [2]=? [3]=type [4]=rules
    const match = decl.match(/^(\w+)\s*(\?)?\s*:\s*([\w|'"]+(?:\[\])?)\s*(?:\{([^}]*)\})?\s*$/);
    if (!match) return null;

    const [, name, optional, type, rulesStr] = match;
    const rules: string[] = [];
    // required is only true if: explicitly declared in rules block OR ? is absent AND rules block exists
    let isRequired = false;

    if (rulesStr) {
        const ruleItems = rulesStr.split(',').map(r => r.trim()).filter(Boolean);
        for (const rule of ruleItems) {
            if (rule === 'required') { isRequired = true; continue; }
            rules.push(rule);
        }
    }

    // Optional marker ? always means not required, regardless of rules
    if (optional) isRequired = false;

    return { name, type: type.trim(), required: isRequired, isArray: false, rules };
}

/** Split a string by commas at depth 0 (respecting braces, brackets, parens). */
export function splitAtTopLevelCommas(content: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let start = 0;

    for (let i = 0; i < content.length; i++) {
        const skip = skipNonCode(content, i);
        if (skip !== null) { i = skip - 1; continue; }
        const ch = content[i];
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        if (ch === '}' || ch === ']' || ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            result.push(content.slice(start, i));
            start = i + 1;
        }
    }
    if (start < content.length) result.push(content.slice(start));
    return result;
}

/**
 * Parse @page options block: 'keepAlive', 'keepAlive: 300000', 'preload', 'prefetch: "hover"'.
 * Comma-separated key or key: value pairs. Updates the RouteInfo in place.
 */
export function parsePageOptions(optionsStr: string, route: RouteInfo): void {
    const parts = optionsStr.split(',').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) {
            // Boolean flag: keepAlive, preload
            const key = part.trim();
            if (key === 'keepAlive') route.keepAlive = true;
            else if (key === 'preload') route.preload = true;
        } else {
            // Key-value: keepAlive: 300000, prefetch: 'hover'
            const key = part.slice(0, colonIdx).trim();
            const rawVal = part.slice(colonIdx + 1).trim();
            // Strip quotes for string values
            const val = rawVal.replace(/^['"]|['"]$/g, '');
            if (key === 'keepAlive') {
                route.keepAlive = Number(val);
            } else if (key === 'preload') {
                route.preload = val === 'true';
            } else if (key === 'prefetch') {
                route.prefetch = val;
            } else if (key === 'label') {
                // What this route is called in a breadcrumb. Two shapes, told apart by
                // the quotes the author wrote:
                //
                //   label: 'Tickets'        a string, and `label: 'Ticket :id'` reaches a param
                //   label: ticketLabel      the NAME of a function the page declares
                //
                // The second is what lets a crumb name the RECORD — `T-1042 · Printer jam` — which
                // a string cannot do: only the app can look the ticket up. It is hoisted and
                // registered by reference, exactly as @loader is, because a label runs while the
                // breadcrumb builds and cannot reach anything inside `setup(ctx)`.
                //
                // A third shape: `label: $t('customers.title')`, a dictionary KEY. A
                // function label lives in the page's module and is published only when the module
                // loads, so an ancestor a deep link never loads loses its crumb; a string is a literal.
                // A key is data every route table can carry, and the router translates it.
                //
                // Match: $t( 'key' ) or $t( "key" ) — the key alone; the route's params are passed
                // for it. Groups: [1]=quote [2]=key
                const keyCall = rawVal.match(/^\$t\(\s*(['"])([^'"]+)\1\s*\)$/);
                if (keyCall) { route.labelKey = keyCall[2]; continue; }
                // Match: a JavaScript identifier and nothing else. Anything with a space, a dot or
                // a call in it stays a string, so `label: My Page` keeps working as written.
                if (rawVal === val && /^[A-Za-z_$][\w$]*$/.test(val)) route.labelFn = val;
                else route.label = val;
            }
        }
    }
}

/**
 * Parse @search block into structured SearchParamDecl[].
 * Input: '{ page: number = 1, sort: string = "name", filter?: string }'
 * Output: [{ name: 'page', type: 'number', default: '1', optional: false }, ...]
 */
export function parseSearchParams(raw: string): SearchParamDecl[] {
    const inner = raw.replace(/^\{|\}$/g, '').trim();
    if (!inner) return [];

    const params: SearchParamDecl[] = [];
    for (const part of inner.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const optional = trimmed.includes('?');
        // Match: name?: type = default OR name: type = default OR name: type
        const m = trimmed.match(/^(\w+)\??\s*:\s*(string|number|boolean)(?:\s*=\s*(.+))?$/);
        if (m) {
            params.push({
                name: m[1],
                type: m[2] as 'string' | 'number' | 'boolean',
                default: m[3]?.replace(/^['"]|['"]$/g, '').trim(),
                optional,
            });
        }
    }
    return params;
}

/**
 * Normalize compact scripts by splitting semicolon-separated statements onto separate lines.
 * Preserves semicolons inside strings, parentheses, and brace blocks.
 */
export function normalizeStatements(script: string): string {
    return normalizeStatementsWithOrigins(script).text;
}

/**
 * `normalizeStatements`, and for each line of its output the offset in `script` of the line's first
 * non-blank character — null for a blank line. The lines move (a `;` starts a new one), the text
 * on them does not, so this is what a source map needs to find a line again.
 */
export function normalizeStatementsWithOrigins(script: string): { text: string; lineOrigins: (number | null)[] } {
    let result = '';
    // For each character of `result`, the index in `script` it was copied from; -1 for the
    // newline inserted after a `;`.
    const from: number[] = [];
    const emit = (text: string, start: number) => {
        result += text;
        for (let k = 0; k < text.length; k++) from.push(start < 0 ? -1 : start + k);
    };
    let depth = 0;
    let inString = false;
    let stringChar = '';
    // Track the last significant (non-whitespace) code char so we can decide whether
    // a `/` opens a regex literal (after operators/`(`/`,`/`=` etc.) or is division.
    let lastSignificant = '';

    for (let i = 0; i < script.length; i++) {
        const ch = script[i];

        if (inString) {
            emit(ch, i);
            if (ch === '\\') { i++; emit(script[i] ?? '', i); continue; }
            if (ch === stringChar) inString = false;
            continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
            inString = true;
            stringChar = ch;
            emit(ch, i);
            lastSignificant = ch;
            continue;
        }

        // A comment is prose, not code: neither its `;` nor its brackets mean anything here.
        // Copy it verbatim and jump past it — `lastSignificant` stays untouched, since a comment
        // does not change whether the next `/` is a regex or a division. Without this, a comment
        // would be cut at its first semicolon and its tail emitted as code, so a `;` written in a
        // comment would make the module fail to compile and the page go blank.
        if (ch === '/' && (script[i + 1] === '/' || script[i + 1] === '*')) {
            const end = skipNonCode(script, i);
            if (end !== null && end > i) {
                emit(script.slice(i, end), i);
                i = end - 1;
                continue;
            }
        }

        // Regex literal: `/` opens a regex when the previous significant token is not a
        // value/identifier/closer (where `/` would be division). Copy the literal verbatim so
        // an inner `;` (e.g. `const re = /a;b/;`) does not split the statement.
        if (ch === '/' && script[i + 1] !== '/' && script[i + 1] !== '*'
            && (regexAllowedAfter(lastSignificant) || afterExpressionKeyword(script, i))) {
            const end = skipRegexLiteral(script, i);
            if (end > i) {
                emit(script.slice(i, end), i);
                i = end - 1;
                lastSignificant = '/';
                continue;
            }
        }

        if (ch === '(' || ch === '[' || ch === '{') depth++;
        if (ch === ')' || ch === ']' || ch === '}') depth--;

        if (ch === ';' && depth === 0) {
            emit(';', i);
            emit('\n', -1);
            while (i + 1 < script.length && /[ \t]/.test(script[i + 1])) i++;
            lastSignificant = ';';
        } else {
            emit(ch, i);
            if (!/\s/.test(ch)) lastSignificant = ch;
        }
    }

    // Each line's origin: where its first non-blank character came from.
    const lineOrigins: (number | null)[] = [];
    let lineStart = 0;
    for (let k = 0; k <= result.length; k++) {
        if (k < result.length && result[k] !== '\n') continue;
        let first = lineStart;
        while (first < k && /\s/.test(result[first])) first++;
        lineOrigins.push(first < k && from[first] >= 0 ? from[first] : null);
        lineStart = k + 1;
    }
    return { text: result, lineOrigins };
}

/** A `/` starts a regex (not division) when the previous significant char is empty,
 *  an operator, an opener, a separator, or a keyword boundary — never after a value. */
function regexAllowedAfter(prev: string): boolean {
    if (prev === '') return true;
    // After a value/identifier-end/closer, `/` is division — and after another `/` it is part of
    // a comment (`//`) or division, never a regex start. Excluding `/` also prevents a false
    // regex match on the second slash of a `//` line comment.
    if (/[\w$)\]/]/.test(prev)) return false;
    return true;
}

/** Is the `/` at `pos` right after an expression keyword (`return /x/`)? `lastSignificant` sees only
 *  the keyword's last letter, which reads as a value. */
function afterExpressionKeyword(script: string, pos: number): boolean {
    let i = pos - 1;
    while (i >= 0 && /\s/.test(script[i])) i--;
    return i >= 0 && /[\w$]/.test(script[i]) && endsWithExpressionKeyword(script, i);
}

/** Skip a regex literal starting at `start` (the `/`). Returns index AFTER the closing `/`
 *  plus any flags, or `start` if it isn't a well-formed regex on this line. */
function skipRegexLiteral(s: string, start: number): number {
    let inClass = false;
    for (let i = start + 1; i < s.length; i++) {
        const c = s[i];
        if (c === '\\') { i++; continue; }
        if (c === '\n') return start; // unterminated → not a regex
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
            // consume flags
            let j = i + 1;
            while (j < s.length && /[a-z]/i.test(s[j])) j++;
            return j;
        }
    }
    return start;
}

/**
 * Parse an @head { ... } block into HeadInfo.
 * Supports: title (static string), meta (array of { name/property, content }).
 *
 * Example:
 *   @head {
 *     title: 'My Page';
 *     meta: [
 *       { name: 'description', content: 'Browse products' },
 *       { property: 'og:title', content: 'My Site' },
 *     ];
 *   }
 */
export function parseHeadBlock(blockContent: string, head: HeadInfo): void {
    const braceStart = blockContent.indexOf('{');
    const braceEnd = blockContent.lastIndexOf('}');
    if (braceStart === -1 || braceEnd === -1) return;
    const inner = blockContent.slice(braceStart + 1, braceEnd).trim();

    // Parse title: 'value';
    const titleMatch = inner.match(/title\s*:\s*(['"])(.+?)\1/);
    if (titleMatch) {
        head.title = { value: titleMatch[2], isDynamic: false };
    }

    // Parse meta: [ { name/property: '...', content: '...' }, ... ]
    const metaArrayMatch = inner.match(/meta\s*:\s*\[([\s\S]*)\]/);
    if (metaArrayMatch) {
        const objRegex = /\{([^}]+)\}/g;
        let objMatch: RegExpExecArray | null;
        while ((objMatch = objRegex.exec(metaArrayMatch[1])) !== null) {
            const objContent = objMatch[1];
            const nameMatch = objContent.match(/name\s*:\s*['"]([^'"]+)['"]/);
            const propMatch = objContent.match(/property\s*:\s*['"]([^'"]+)['"]/);
            const contentMatch = objContent.match(/content\s*:\s*['"]([^'"]+)['"]/);
            if (contentMatch && (nameMatch || propMatch)) {
                const entry: { name?: string; property?: string; content: string } = {
                    content: contentMatch[1],
                };
                if (nameMatch) entry.name = nameMatch[1];
                if (propMatch) entry.property = propMatch[1];
                head.meta.push(entry);
            }
        }
    }
}

/**
 * Parse an @route { ... } aggregate block into RouteInfo.
 * Maps keys to the same properties as individual route runes.
 *
 * Supported keys: path, guard, loader, prefetch, transition, layout, scroll,
 * keepAlive, preload, search (as { ... } object), meta (as { ... } object).
 *
 * Example:
 *   @route {
 *     path: '/users/:id';
 *     guard: 'admin.users';
 *     prefetch: 'hover';
 *     layout: 'dashboard';
 *     scroll: 'preserve';
 *     transition: 'slide-right';
 *     search: { id: number };
 *   }
 */
export function parseRouteBlock(blockContent: string, route: RouteInfo): void {
    const braceStart = blockContent.indexOf('{');
    const braceEnd = blockContent.lastIndexOf('}');
    if (braceStart === -1 || braceEnd === -1) return;
    const inner = blockContent.slice(braceStart + 1, braceEnd);

    // Helper: extract a quoted string value for a key
    const str = (key: string): string | undefined => {
        const m = inner.match(new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`));
        return m?.[1];
    };

    // path → route.page
    const path = str('path');
    if (path) route.page = path;

    // Simple string properties
    const guard = str('guard');
    if (guard) route.guard = guard;

    const loader = inner.match(/loader\s*:\s*(\w+)/);
    if (loader) route.loader = loader[1];

    const prefetch = str('prefetch');
    if (prefetch) route.prefetch = prefetch;

    const transition = str('transition');
    if (transition) route.transition = transition;

    const layout = str('layout');
    if (layout) route.layout = layout;

    const scroll = str('scroll');
    if (scroll) route.scroll = scroll;

    // Boolean/number properties
    if (/keepAlive\s*:\s*true/.test(inner)) route.keepAlive = true;
    if (/preload\s*:\s*true/.test(inner)) route.preload = true;
    const keepAliveNum = inner.match(/keepAlive\s*:\s*(\d+)/);
    if (keepAliveNum) route.keepAlive = parseInt(keepAliveNum[1], 10);

    // search: { ... } — extract raw block for parseSearchParams
    const searchMatch = inner.match(/search\s*:\s*(\{[^}]+\})/);
    if (searchMatch) {
        route.search = searchMatch[1];
        route.searchParams = parseSearchParams(searchMatch[1]);
    }

    // params: { ... } — typed route params
    const paramsMatch = inner.match(/params\s*:\s*(\{[^}]+\})/);
    if (paramsMatch) {
        route.params = parseRouteParams(paramsMatch[1]);
    }

    // meta: { ... } — route metadata
    const metaMatch = inner.match(/meta\s*:\s*(\{[^}]+\})/);
    if (metaMatch) {
        const parsed = parseObjectLiteralToJson(metaMatch[1]);
        if (parsed && typeof parsed === 'object') route.meta = parsed as Record<string, unknown>;
    }
}

/**
 * Convert a JS object-literal string to a parsed JSON value.
 * Quotes ONLY identifier keys (in key position, not inside strings/values) so that
 * `:` inside URLs/values (e.g. `url: 'https://x'`) is preserved. Returns undefined on parse failure.
 */
const SIMPLE_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

/** The value of a single-quoted JavaScript string literal's body: its escapes read, as the language reads them. */
function decodeSingleQuoted(body: string): string {
    let out = '';
    for (let i = 0; i < body.length; i++) {
        if (body[i] !== '\\') { out += body[i]; continue; }
        const ch = body[++i];
        if (ch === undefined) break;
        if (ch in SIMPLE_ESCAPES && !(ch === '0' && /\d/.test(body[i + 1] ?? ''))) {
            out += SIMPLE_ESCAPES[ch];
        } else if (ch === 'x') {
            out += String.fromCharCode(parseInt(body.slice(i + 1, i + 3), 16));
            i += 2;
        } else if (ch === 'u' && body[i + 1] === '{') {
            const close = body.indexOf('}', i + 2);
            out += String.fromCodePoint(parseInt(body.slice(i + 2, close), 16));
            i = close;
        } else if (ch === 'u') {
            out += String.fromCharCode(parseInt(body.slice(i + 1, i + 5), 16));
            i += 4;
        } else if (ch === '\r' || ch === '\n') {
            // A line continuation adds nothing; `\r\n` is one.
            if (ch === '\r' && body[i + 1] === '\n') i++;
        } else {
            out += ch; // `\'`, `\"`, `\\` and every other identity escape
        }
    }
    return out;
}

export function parseObjectLiteralToJson(src: string): unknown {
    let out = '';
    for (let i = 0; i < src.length; i++) {
        // Copy strings verbatim (and re-emit single-quoted as double for JSON).
        const skip = skipNonCode(src, i);
        if (skip !== null && skip > i) {
            const tok = src.slice(i, skip);
            if (tok[0] === "'") {
                // single-quoted → JSON: read the string as JavaScript reads it, then write it as JSON.
                // Swapping the quotes by hand turned `\"` into `\\"`, which ends the JSON string (#71).
                out += JSON.stringify(decodeSingleQuoted(tok.slice(1, -1)));
            } else {
                out += tok;
            }
            i = skip - 1;
            continue;
        }
        const ch = src[i];
        // Identifier in key position: <ident> followed (after ws) by `:`.
        if (/[A-Za-z_$]/.test(ch)) {
            let j = i;
            while (j < src.length && /[\w$]/.test(src[j])) j++;
            let k = j;
            while (k < src.length && /\s/.test(src[k])) k++;
            if (src[k] === ':') {
                out += `"${src.slice(i, j)}"`;
                i = j - 1;
                continue;
            }
            out += src.slice(i, j);
            i = j - 1;
            continue;
        }
        out += ch;
    }
    // Strip trailing commas before } or ].
    out = out.replace(/,\s*([}\]])/g, '$1');
    try {
        return JSON.parse(out);
    } catch {
        return undefined;
    }
}

/**
 * Parse a route params block into typed param declarations.
 * Input: '{ id: number, slug: string }'
 * Output: [{ name: 'id', type: 'number' }, { name: 'slug', type: 'string' }]
 */
export function parseRouteParams(block: string): RouteParamDecl[] {
    const params: RouteParamDecl[] = [];
    const inner = block.replace(/^\{/, '').replace(/\}$/, '').trim();
    // Match: name: type — simple key-value pairs
    const paramRegex = /(\w+)\s*:\s*(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = paramRegex.exec(inner)) !== null) {
        params.push({ name: m[1], type: m[2] });
    }
    return params;
}

/**
 * Parse @form options block.
 * Input: '@form orderForm: OrderSchema {\n  save: "onSubmit";\n  source: orderDs;\n  parent: parentForm;\n  warnUnsaved: true;\n}'
 * Extracts: saveMode, source, parent, warnUnsaved, fieldConfig, validate.
 */
export function parseFormOptions(blockContent: string): {
    saveMode?: string;
    source?: string;
    parent?: string;
    warnUnsaved?: boolean;
    fieldConfig?: Record<string, { saveMode?: string; saveDebounce?: number }>;
    validate?: string;
} {
    const result: ReturnType<typeof parseFormOptions> = {};
    const braceStart = blockContent.indexOf('{');
    const braceEnd = blockContent.lastIndexOf('}');
    if (braceStart === -1 || braceEnd === -1) return result;
    const inner = blockContent.slice(braceStart + 1, braceEnd).trim();

    // Parse semicolon or newline-separated key: value pairs
    const lines = inner.split(/[;\n]/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        // A bare flag: `{ warnUnsaved }` is how the docs and the stories write it.
        if (line === 'warnUnsaved') { result.warnUnsaved = true; continue; }
        // Match: key: value
        const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
        if (!kv) continue;
        const key = kv[1];
        const rawVal = kv[2].trim().replace(/;$/, '').trim();
        const val = rawVal.replace(/^['"]|['"]$/g, ''); // strip quotes

        switch (key) {
            case 'save':
            case 'saveMode':
                result.saveMode = val;
                break;
            case 'source':
                result.source = val;
                break;
            case 'parent':
                result.parent = val;
                break;
            case 'warnUnsaved':
                result.warnUnsaved = val === 'true' || val === '';
                break;
            case 'validate':
                // An EXPRESSION, not a literal: the raw text is emitted as the option's value, so a
                // function name, a method or an arrow all work. Quotes are not stripped for the
                // same reason — 'x' would be a string, and a string is not callable.
                result.validate = rawVal;
                break;
            case 'fields':
                // Parse nested field config: fields: { name: { save: 'immediate' }, ... }
                result.fieldConfig = parseFieldConfig(rawVal);
                break;
        }
    }
    return result;
}

/** Parse per-field config from: { name: { save: 'immediate', saveDebounce: 200 }, ... } */
function parseFieldConfig(raw: string): Record<string, { saveMode?: string; saveDebounce?: number }> {
    const config: Record<string, { saveMode?: string; saveDebounce?: number }> = {};
    const inner = raw.replace(/^\{/, '').replace(/\}$/, '').trim();
    // Match: fieldName: { key: value, ... }
    const fieldRegex = /(\w+)\s*:\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = fieldRegex.exec(inner)) !== null) {
        const fieldName = m[1];
        const opts: { saveMode?: string; saveDebounce?: number } = {};
        const pairs = m[2].split(',').map(p => p.trim());
        for (const pair of pairs) {
            const kv = pair.match(/(\w+)\s*:\s*(.+)/);
            if (!kv) continue;
            const k = kv[1].trim();
            const v = kv[2].trim().replace(/^['"]|['"]$/g, '');
            if (k === 'save' || k === 'saveMode') opts.saveMode = v;
            if (k === 'saveDebounce') opts.saveDebounce = Number(v);
        }
        config[fieldName] = opts;
    }
    return config;
}
