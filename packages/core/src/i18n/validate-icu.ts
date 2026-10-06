// ICU MessageFormat validation — a build-time check for the EXACT subset that $t() renders at
// runtime: simple interpolation `{name}`/`{0}` and plural blocks
// `{count, plural, one {# item} other {# items}}`. `select`/`selectordinal` are recognised only to
// REJECT them — the runtime (translate.ts) implements plural only, so approving a select block would
// let it render raw. Returns an error string, or null when valid.

// Matches any `{name, <kind>, …}` complex argument; group 2 is the kind.
const COMPLEX = /^(\w+)\s*,\s*(plural|selectordinal|select)\s*,\s*/;

/**
 * Validate an ICU message. Catches the common authoring mistakes:
 *  - unbalanced braces (the classic `{count, plural, one {# item}` — missing the outer `}`);
 *  - a plural/select block with no `other` arm (ICU requires it);
 *  - a malformed rule arm (a category not followed by a `{…}` body).
 *
 * @returns a human-readable error, or null if the message is well-formed.
 */
export function validateIcu(message: string): string | null {
    // 1. Brace balance — the cheapest and most common failure.
    let depth = 0;
    for (let i = 0; i < message.length; i++) {
        if (message[i] === '{') depth++;
        else if (message[i] === '}') {
            depth--;
            if (depth < 0) return `unexpected '}' at position ${i}`;
        }
    }
    if (depth !== 0) return `unbalanced braces — ${depth} unclosed '{'`;

    // 2. Structure of each complex (plural/select) block.
    return validateRange(message, 0, message.length);
}

/** Validate every top-level `{…}` block within [from, to). */
function validateRange(s: string, from: number, to: number): string | null {
    let i = from;
    while (i < to) {
        const open = s.indexOf('{', i);
        if (open === -1 || open >= to) break;
        const close = findClosingBrace(s, open);
        if (close === -1 || close > to) return `unbalanced braces near position ${open}`;

        const inner = s.slice(open + 1, close);
        const complex = inner.match(COMPLEX);
        if (complex) {
            const kind = complex[2];
            if (kind !== 'plural') {
                return `${kind} near position ${open}: not supported by $t() (only 'plural' is) — it would render raw`;
            }
            const err = validatePluralRules(inner.slice(complex[0].length), kind, open);
            if (err) return err;
        }
        i = close + 1;
    }
    return null;
}

/** Validate the rule arms of a plural/select block: `cat {body} cat {body} …` with an `other`. */
function validatePluralRules(rules: string, kind: string, at: number): string | null {
    const cats = new Set<string>();
    let i = 0;
    while (i < rules.length) {
        while (i < rules.length && /\s/.test(rules[i])) i++;
        if (i >= rules.length) break;

        // Read the category token up to the opening brace.
        const brace = rules.indexOf('{', i);
        if (brace === -1) return `plural/select block near position ${at}: category "${rules.slice(i).trim()}" has no { … } body`;
        const cat = rules.slice(i, brace).trim();
        // plural/selectordinal arms must be a CLDR keyword or =N; select arms are free identifiers.
        const valid = kind === 'select'
            ? /^[\w-]+$/.test(cat)
            : /^(=\d+|zero|one|two|few|many|other)$/.test(cat);
        if (!valid) {
            return `${kind} block near position ${at}: invalid category "${cat}"`;
        }
        cats.add(cat);

        const close = findClosingBrace(rules, brace);
        if (close === -1) return `plural/select block near position ${at}: unclosed body for "${cat}"`;
        // Recurse — bodies may nest further blocks.
        const nested = validateRange(rules, brace + 1, close);
        if (nested) return nested;
        i = close + 1;
    }
    if (!cats.has('other')) return `${kind} block near position ${at}: missing required "other" arm`;
    return null;
}

/** Index of the brace matching the `{` at openIndex, or -1. */
function findClosingBrace(s: string, openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < s.length; i++) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}
