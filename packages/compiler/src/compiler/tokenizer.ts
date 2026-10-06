// Tokenizer — shared string/comment-aware utilities for the compiler.
// All bracket/paren/brace tracking MUST use these to avoid processing
// content inside strings, template literals, and comments.

// ─── Core: Skip Non-Code ────────────────────────────────────────────

/**
 * If `pos` is at the start of a string literal, template literal, or comment,
 * return the position AFTER it. Otherwise return null (pos is code).
 */
export function skipNonCode(code: string, pos: number): number | null {
    const ch = code[pos];
    const next = pos + 1 < code.length ? code[pos + 1] : '';

    // Single/double-quoted string
    if (ch === "'" || ch === '"') return skipString(code, pos);

    // Template literal (backtick) — skip entire template including ${} expressions
    if (ch === '`') return skipTemplateLiteral(code, pos);

    // Line comment
    if (ch === '/' && next === '/') return skipLineComment(code, pos);

    // Block comment
    if (ch === '/' && next === '*') return skipBlockComment(code, pos);

    // Regex literal — a `/` that opens a well-formed regex must be skipped whole, else quotes
    // inside its character class (e.g. `/['"]/`) are mis-read as string delimiters, derailing
    // every downstream scanner. Distinguish regex from division by the previous
    // significant char (heuristic shared with normalizeStatements): after a value/identifier/
    // closer, `/` is division.
    if (ch === '/' && regexStartsAt(code, pos)) {
        const end = skipRegexLiteral(code, pos);
        if (end > pos) return end;
    }

    return null;
}

/**
 * Return a copy of `code` with the CONTENT of strings, template literals and
 * comments replaced by spaces (newlines preserved, so line numbers/structure are
 * unchanged). Used for keyword/decorator scans that must not match inside
 * non-code regions — e.g. compilation-mode detection (a `$signal(` in a comment
 * must not flip a legacy component to new mode).
 */
export function maskNonCode(code: string): string {
    let out = '';
    let i = 0;
    while (i < code.length) {
        const end = skipNonCode(code, i);
        if (end !== null && end > i) {
            // Blank the non-code span, preserving newlines for line alignment.
            for (let j = i; j < end; j++) out += code[j] === '\n' ? '\n' : ' ';
            i = end;
        } else {
            out += code[i];
            i++;
        }
    }
    return out;
}

// ─── High-Level Utilities ───────────────────────────────────────────

/**
 * Find the closing bracket/paren/brace that matches the opener at `start`.
 * Skips strings, template literals, and comments.
 * Returns the index of the closing char, or -1 if not found.
 */
export function findClosing(code: string, start: number): number {
    const opener = code[start];
    const closer = opener === '(' ? ')' : opener === '[' ? ']' : opener === '{' ? '}' : '';
    if (!closer) return -1;

    let depth = 0;
    for (let i = start; i < code.length; i++) {
        const skip = skipNonCode(code, i);
        if (skip !== null) { i = skip - 1; continue; }

        if (code[i] === opener) depth++;
        else if (code[i] === closer) { depth--; if (depth === 0) return i; }
    }
    return -1;
}

/**
 * Find the next occurrence of `char` at bracket depth 0.
 * Skips strings, template literals, and comments.
 * Returns the index, or -1 if not found.
 */
export function findAtDepthZero(code: string, start: number, char: string): number {
    let depth = 0;
    for (let i = start; i < code.length; i++) {
        const skip = skipNonCode(code, i);
        if (skip !== null) { i = skip - 1; continue; }

        const ch = code[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === char && depth === 0) return i;
    }
    return -1;
}

/**
 * Split a string by `separator` at bracket depth 0.
 * Skips strings, template literals, and comments.
 */
export function splitAtDepthZero(code: string, separator: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let start = 0;

    for (let i = 0; i < code.length; i++) {
        const skip = skipNonCode(code, i);
        if (skip !== null) { i = skip - 1; continue; }

        const ch = code[i];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === separator && depth === 0) {
            result.push(code.slice(start, i));
            start = i + 1;
        }
    }
    if (start <= code.length) result.push(code.slice(start));
    return result;
}

/**
 * Count bracket depth changes in a line, skipping strings and comments.
 * Tracks: ( ) [ ] { }
 */
export function countDepthChange(line: string, openers: string, closers: string): number {
    let depth = 0;
    for (let i = 0; i < line.length; i++) {
        const skip = skipNonCode(line, i);
        if (skip !== null) { i = skip - 1; continue; }
        if (openers.includes(line[i])) depth++;
        if (closers.includes(line[i])) depth--;
    }
    return depth;
}

// ─── Internal: String/Comment Skippers ──────────────────────────────

/** Skip past a single or double-quoted string. Returns position after closing quote. */
function skipString(code: string, start: number): number {
    const quote = code[start];
    for (let i = start + 1; i < code.length; i++) {
        if (code[i] === '\\') { i++; continue; }
        if (code[i] === quote) return i + 1;
    }
    return code.length;
}

/** Skip past a template literal, including nested ${} expressions. */
function skipTemplateLiteral(code: string, start: number): number {
    for (let i = start + 1; i < code.length; i++) {
        if (code[i] === '\\') { i++; continue; }
        if (code[i] === '`') return i + 1;
        // ${...} expression — find matching }
        if (code[i] === '$' && i + 1 < code.length && code[i + 1] === '{') {
            const close = findClosing(code, i + 1);
            if (close !== -1) i = close;
        }
    }
    return code.length;
}

/** Skip past a line comment (// ...\n). */
function skipLineComment(code: string, start: number): number {
    const nl = code.indexOf('\n', start);
    return nl === -1 ? code.length : nl + 1;
}

/** Skip past a block comment. */
function skipBlockComment(code: string, start: number): number {
    const end = code.indexOf('*/', start + 2);
    return end === -1 ? code.length : end + 2;
}

/**
 * Keywords after which an expression starts, so a `/` there opens a regex. They end in an
 * identifier character, which alone would read the `/` as division: `return /^[\[{]/.test(v)` would
 * have its `{` counted as a block, and every later setup declaration would leave the template.
 */
const EXPRESSION_KEYWORDS = new Set(['return', 'typeof', 'case', 'throw', 'void', 'delete', 'in', 'of', 'new', 'else', 'do', 'yield', 'await', 'instanceof']);

/**
 * Is the identifier that ends at `end` (inclusive) one of EXPRESSION_KEYWORDS, used as a keyword?
 * A property named like one (`o.return`, `o?.typeof`) is a value.
 */
export function endsWithExpressionKeyword(code: string, end: number): boolean {
    let start = end;
    while (start > 0 && /[\w$]/.test(code[start - 1])) start--;
    if (!EXPRESSION_KEYWORDS.has(code.slice(start, end + 1))) return false;
    let k = start - 1;
    while (k >= 0 && /\s/.test(code[k])) k--;
    return code[k] !== '.';
}

/**
 * Does a regex literal (not a division) start at the `/` at `pos`? Looks at the previous
 * significant (non-whitespace) char: after a value — identifier char, `)`, `]`, or another `/` —
 * a `/` is division, unless that identifier is an expression keyword (`return /x/`); otherwise
 * (start of input, operator, opener, separator) it opens a regex.
 */
export function regexStartsAt(code: string, pos: number): boolean {
    let i = pos - 1;
    while (i >= 0 && /\s/.test(code[i])) i--;
    if (i < 0) return true; // start of input → regex
    if (/[\w$]/.test(code[i])) return endsWithExpressionKeyword(code, i);
    return !/[)\]/]/.test(code[i]);
}

/**
 * Skip a regex literal starting at `start` (the opening `/`). Returns the index AFTER the
 * closing `/` and any flags, or `start` if it isn't a well-formed single-line regex (unterminated
 * or newline before close) — in which case the caller treats the `/` as division.
 */
function skipRegexLiteral(code: string, start: number): number {
    let inClass = false;
    for (let i = start + 1; i < code.length; i++) {
        const c = code[i];
        if (c === '\\') { i++; continue; }        // escaped char
        if (c === '\n') return start;             // unterminated → not a regex
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
            let j = i + 1;
            while (j < code.length && /[a-z]/i.test(code[j])) j++; // consume flags
            return j;
        }
    }
    return start;
}
