// The nested-theme guard for a generated theme's component rules.
//
// A theme's component rules are descendant selectors of its root, `[pdx-theme="x"] .pdx-primary`, and
// match every `.pdx-primary` under that root — including the ones under a nested root of another
// theme. The 13 shipped themes carry a guard on each rule's subject; a generated theme carries the
// same guard on its design language's and its author's `cssOverrides`, or a theme saved from the
// builder would reach into a nested theme.

/** The guard a rule of theme `name` carries on its subject: not under a nested root of another theme. */
export function nestedThemeGuard(name: string): string {
    const foreign = `[pdx-theme="${name}"] [pdx-theme]:not([pdx-theme="${name}"])`;
    return `:not(:where(${foreign}, ${foreign} *))`;
}

/**
 * `css` with the guard of theme `name` on the subject of every style rule's selectors.
 *
 * - Comments and strings are copied as they are; an at-rule keeps its prelude, and the rules inside
 *   its block are guarded.
 * - A selector list is split at top-level commas, a selector into compounds at top-level
 *   combinators. The guard goes on the last compound, before a pseudo-element.
 * - Left as they are: the theme root's own block (`&` or `&[attr]`, one compound on the root), a
 *   selector already guarded, and the declarations and nested rules inside a guarded rule — those
 *   hang off a selector that is guarded already.
 */
export function guardThemeRules(css: string, name: string): string {
    const guard = nestedThemeGuard(name);
    let out = '';
    let i = 0;
    let prelude = '';

    const copyString = (): string => {
        const quote = css[i];
        let s = css[i++];
        while (i < css.length && css[i] !== quote) {
            if (css[i] === '\\') s += css[i++];
            s += css[i++];
        }
        if (i < css.length) s += css[i++];
        return s;
    };
    const copyComment = (): string => {
        const end = css.indexOf('*/', i + 2);
        const stop = end < 0 ? css.length : end + 2;
        const s = css.slice(i, stop);
        i = stop;
        return s;
    };
    /** Copy the block that starts at css[i] === '{' through its matching '}'. */
    const copyBlock = (): string => {
        let depth = 0;
        let s = '';
        while (i < css.length) {
            const c = css[i];
            if (c === '"' || c === "'") { s += copyString(); continue; }
            if (c === '/' && css[i + 1] === '*') { s += copyComment(); continue; }
            s += c;
            i++;
            if (c === '{') depth++;
            else if (c === '}' && --depth === 0) break;
        }
        return s;
    };

    while (i < css.length) {
        const c = css[i];
        if (c === '"' || c === "'") { prelude += copyString(); continue; }
        if (c === '/' && css[i + 1] === '*') {
            // A comment between rules goes out as it is; one inside a prelude stays in it.
            if (prelude.trim()) prelude += copyComment();
            else { out += prelude + copyComment(); prelude = ''; }
            continue;
        }
        if (c === '{') {
            const head = prelude;
            prelude = '';
            if (head.trim().startsWith('@')) {
                // An at-rule's block holds rules: guard them, keep the braces.
                const block = copyBlock();
                out += head + '{' + guardThemeRules(block.slice(1, -1), name) + '}';
            } else {
                out += guardSelectorList(head, guard) + copyBlock();
            }
            continue;
        }
        if (c === ';' && prelude.trim().startsWith('@')) {
            // A block-less at-rule (@import, @charset): copied as it is.
            out += prelude + ';';
            prelude = '';
            i++;
            continue;
        }
        prelude += c;
        i++;
    }
    return out + prelude;
}

/** Split `text` at top-level occurrences of `isSep`, outside brackets, parentheses and strings. */
function splitTop(text: string, isSep: (c: string) => boolean): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    let quote = '';
    for (let k = 0; k < text.length; k++) {
        const c = text[k];
        if (quote) { if (c === '\\') k++; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (depth === 0 && isSep(c)) { parts.push(text.slice(start, k)); start = k + 1; }
    }
    parts.push(text.slice(start));
    return parts;
}

function guardSelectorList(list: string, guard: string): string {
    // Keep the whitespace around the list (the source's indentation and the space before `{`).
    const lead = list.match(/^\s*/)![0];
    const trail = list.match(/\s*$/)![0];
    const body = list.slice(lead.length, list.length - trail.length);
    const selectors = splitTop(body, (c) => c === ',').map((s) => guardSelector(s, guard));
    return lead + selectors.join(',') + trail;
}

function guardSelector(selector: string, guard: string): string {
    const s = selector.trim();
    if (!s || s.includes(guard)) return selector;
    const compounds = splitTop(s, (c) => c === ' ' || c === '>' || c === '+' || c === '~').filter(Boolean);
    // One compound on the theme root (`&`, `&[pdx-tab-style="pill"]`): the root's own block.
    if (compounds.length === 1 && compounds[0].startsWith('&')) return selector;
    // The subject is the last compound; its last occurrence in the selector is where it sits.
    const subject = compounds[compounds.length - 1];
    const at = s.lastIndexOf(subject);
    const lead = selector.match(/^\s*/)![0];
    return lead + s.slice(0, at) + guardCompound(subject, guard) + selector.slice(lead.length + s.length);
}

/** The guard goes before a pseudo-element: `summary::after` → `summary:not(…)::after`. */
function guardCompound(compound: string, guard: string): string {
    let depth = 0;
    let quote = '';
    for (let k = 0; k < compound.length; k++) {
        const c = compound[k];
        if (quote) { if (c === '\\') k++; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (depth === 0 && c === ':') {
            const rest = compound.slice(k);
            if (rest.startsWith('::') || /^:(before|after|first-line|first-letter)\b/.test(rest)) {
                return compound.slice(0, k) + guard + compound.slice(k);
            }
        }
    }
    return compound + guard;
}
