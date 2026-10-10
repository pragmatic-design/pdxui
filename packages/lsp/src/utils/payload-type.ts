// Whether an event's payload type names nothing the projected file would have to import.

/** The type keywords a self-contained payload may use. */
const KEYWORDS = new Set(['string', 'number', 'boolean', 'null', 'undefined']);

/** Punctuation a type of primitives, literals, objects and arrays is written with. */
const PUNCTUATION = new Set(['{', '}', '[', ']', ':', ';', ',', '|', '?']);

const isIdentStart = (c: string) => /[a-z_$]/.test(c);
const isIdentChar = (c: string) => /[\w$]/.test(c);

/**
 * A payload type built only from primitives, literals, and object and array shapes of them:
 * `{ id: number }` is one; `Ticket` is not — it would be an unknown name in the projected file, which
 * is a false error. An identifier is allowed only as a property KEY, followed by `?:` or `:`.
 *
 * A scan, each character read once. It was a regex with `\d+` inside a repeated alternation, which
 * backtracked exponentially on a run of digits (#67).
 */
export function isSelfContainedType(type: string): boolean {
    let i = 0;
    while (i < type.length) {
        const c = type[i];
        if (/\s/.test(c) || PUNCTUATION.has(c)) { i++; continue; }
        if (c === "'" || c === '"') {
            const close = type.indexOf(c, i + 1);
            if (close === -1) return false;
            i = close + 1;
            continue;
        }
        if (/\d/.test(c)) {
            while (i < type.length && /\d/.test(type[i])) i++;
            continue;
        }
        if (isIdentStart(c)) {
            let end = i + 1;
            while (end < type.length && isIdentChar(type[end])) end++;
            const word = type.slice(i, end);
            if (!KEYWORDS.has(word)) {
                // A key: `name:` or `name?:`, whitespace allowed before the colon.
                let k = end;
                if (type[k] === '?') k++;
                while (k < type.length && /\s/.test(type[k])) k++;
                if (type[k] !== ':') return false;
            }
            i = end;
            continue;
        }
        return false;
    }
    return true;
}
