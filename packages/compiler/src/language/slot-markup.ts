// Reading the markup the scoped-slot rewrites move (#492): where a tag ends, where a slot closes, which
// element a slot is directly inside, and the names of a snippet's parameters. Text only: the rewrites
// run on files that may not compile once the alpha forms are removed.

/** The index of the `>` that ends the tag opened at `start`, quoted values read whole; -1 when none. */
export function tagEnd(text: string, start: number): number {
    let quote = '';
    for (let i = start + 1; i < text.length; i++) {
        const c = text[i];
        if (quote) { if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '>') return i;
    }
    return -1;
}

/** Whether the tag that ends at `end` closes itself, `<slot … />`. */
export function selfClosing(text: string, end: number): boolean {
    return text[end - 1] === '/';
}

// Match: a `<slot` or `</slot` that opens or closes a slot element. Groups: [1]=`/` for a closing tag
const SLOT_TAG = /<(\/?)slot(?=[\s/>])/g;

/** The index of the `</slot>` that closes the slot whose opening tag ends before `from`, nested slots counted; -1 when none. */
export function slotClose(text: string, from: number): number {
    let depth = 1;
    const re = new RegExp(SLOT_TAG.source, 'g');
    re.lastIndex = from;
    for (let m = re.exec(text); m; m = re.exec(text)) {
        if (m[1]) {
            if (--depth === 0) return m.index;
            continue;
        }
        const end = tagEnd(text, m.index);
        if (end !== -1 && !selfClosing(text, end)) depth++;
    }
    return -1;
}

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * The element `index` is directly inside — the innermost tag opened before it and not closed — by its
 * lower-case name, or null at the top of the text. Comments are skipped; a void element and a
 * self-closing tag open nothing.
 */
export function enclosingTag(text: string, index: number): string | null {
    const stack: string[] = [];
    // Match: a comment, or the start of an opening or closing tag. Groups: [1]=`/` [2]=the tag name
    const re = /<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w-]*)/g;
    for (let m = re.exec(text); m && m.index < index; m = re.exec(text)) {
        if (!m[2]) continue;
        const name = m[2].toLowerCase();
        if (m[1]) {
            const at = stack.lastIndexOf(name);
            if (at !== -1) stack.length = at;
            continue;
        }
        const end = tagEnd(text, m.index);
        if (end === -1 || end >= index) break;
        re.lastIndex = end + 1;
        if (!selfClosing(text, end) && !VOID_ELEMENTS.has(name)) stack.push(name);
    }
    return stack.at(-1) ?? null;
}

/** `s` cut at each top-level `sep`: brackets, braces, parentheses, angle brackets and strings nest; `=>` is not a bracket. */
export function splitTopLevel(s: string, sep: string | RegExp): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote = '';
    let start = 0;
    const isSep = (c: string) => (typeof sep === 'string' ? c === sep : sep.test(c));
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = '';
            continue;
        }
        if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
        else if (c === ')' || c === ']' || c === '}' || (c === '>' && s[i - 1] !== '=')) depth--;
        else if (depth === 0 && isSep(c)) { parts.push(s.slice(start, i)); start = i + 1; }
    }
    parts.push(s.slice(start));
    return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** The names of a snippet signature's parameters, in order: `(item: T, index: number)` → `['item', 'index']`. */
export function signatureParamNames(signature: string): string[] {
    const inner = signature.trim().replace(/^\(/, '').replace(/\)$/, '');
    return splitTopLevel(inner, ',').map((p) => /^(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)/.exec(p)?.[1] ?? p);
}

/** The value of a static attribute of an opening tag, or null when it has none. */
export function attributeOf(tag: string, name: string): string | null {
    // Match: ` name="v"` or ` name='v'`. Groups: [1]|[2]=the value
    const m = new RegExp(`(?<=\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
    return m ? (m[1] ?? m[2]) : null;
}

/** The line (1-based) of `index` in `text`. */
export function lineAt(text: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
    return line;
}

/** A block body wrapped in `{ }`, spaced off where it starts or ends with a brace, which `{{` would swallow. */
export function braced(body: string): string {
    return `{${body.startsWith('{') ? ' ' : ''}${body}${body.endsWith('}') ? ' ' : ''}}`;
}

/** One replacement of the text from `start` to `end`. */
export interface TextEdit { start: number; end: number; text: string }

/** `text` with `edits` applied; edits do not overlap. */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
    let out = text;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    return out;
}
