// The design CSS under `target: 'baseline-2026'` (#156): a theme's behaviours through container style
// queries instead of attributes on <html>.
//
// A theme declares its behaviours as tokens (`--pdx-card-style: elevated`). The design CSS is written
// against the attributes core's `setTheme` mirrors them into on <html> — the baseline-2024 form:
//     [pdx-card-style="elevated"] .pdx-surface-card { … }
// Under baseline-2026 the pdx() plugin rewrites each such rule into a query on the token:
//     @container style(--pdx-card-style: elevated) { :is(:root, *) .pdx-surface-card { … } }
// Every element is a style container for a custom property, and the query reads the value the element
// inherits, so a `pdx-theme` subtree gets its own behaviours, in the frame the theme changes, with no
// script. `:is(:root, *)` stands where the attribute stood and weighs what it weighed — one attribute,
// (0,1,0) — so a rewritten rule wins and loses against the rest of the CSS where it did before.
//
// The attribute has to be in the selector's leading compound, where the attribute on <html> could
// match; one anywhere else has no query to become, and the rewrite refuses it rather than ship a rule
// that never applies. `:is(.pdx-tabs-pills, [pdx-tab-style="pill"]) S` is split into one rule per
// alternative.

import { blockEnd, preludeEnd, splitList } from './scope-donut';

/** Each behaviour attribute and the token it mirrors (core's BEHAVIOR_TOKEN_MAP, read the other way). */
export const BEHAVIOUR_TOKENS: Readonly<Record<string, string>> = {
    'pdx-input-style': '--pdx-input-style',
    'pdx-input-focus': '--pdx-input-focus',
    'pdx-tab-style': '--pdx-tab-indicator',
    'pdx-card-style': '--pdx-card-style',
};

// Match: a behaviour attribute selector, `[pdx-card-style="elevated"]`, quoted or not. Groups: [1]=attribute [2]=value
const BEHAVIOUR_ATTR = /\[(pdx-(?:input-style|input-focus|tab-style|card-style))=["']?([\w-]+)["']?\]/y;
// Match: a behaviour attribute name inside a selector, anywhere. Groups: [1]=attribute
const ANY_BEHAVIOUR = /\[(pdx-(?:input-style|input-focus|tab-style|card-style))\b/;

/** What stands where a behaviour attribute stood: any element, with the weight of one attribute. */
const ANY_ELEMENT = ':is(:root, *)';

const NESTED_AT_RULES = new Set(['media', 'supports', 'layer', 'container', 'scope', 'starting-style']);

/** One selector after the rewrite: the query it needs ('' for none) and the selector inside it. */
interface Placed { query: string; selector: string }

/** Where a selector's leading compound ends: the first top-level whitespace or combinator. */
function leadingCompoundEnd(sel: string): number {
    let depth = 0;
    let quote = '';
    for (let i = 0; i < sel.length; i++) {
        const c = sel[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (depth === 0 && (/\s/.test(c) || c === '>' || c === '+' || c === '~')) return i;
    }
    return sel.length;
}

/** A selector split into the query it needs and what it selects inside that query. */
function place(sel: string): Placed[] {
    if (!ANY_BEHAVIOUR.test(sel)) return [{ query: '', selector: sel }];
    const end = leadingCompoundEnd(sel);
    const head = sel.slice(0, end);
    const rest = sel.slice(end);
    // `:is(a, [attr]) rest`: one selector per alternative, each with the weight the :is() gave it.
    if (head.startsWith(':is(') && head.endsWith(')') && splitList(head.slice(4, -1)).length > 1) {
        return splitList(head.slice(4, -1)).flatMap((alt) => place(alt + rest));
    }
    const conditions: string[] = [];
    let kept = '';
    let depth = 0;
    for (let i = 0; i < head.length; i++) {
        const c = head[i];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === '[' && depth === 0) {
            BEHAVIOUR_ATTR.lastIndex = i;
            const m = BEHAVIOUR_ATTR.exec(head);
            if (m) {
                conditions.push(`style(${BEHAVIOUR_TOKENS[m[1]]}: ${m[2]})`);
                i += m[0].length - 1;
                continue;
            }
        }
        kept += c;
    }
    const left = ANY_BEHAVIOUR.exec(kept + rest);
    if (left) throw new Error(`[pdx] ${left[1]} in "${sel}": a behaviour attribute is read on <html>, so it belongs in the selector's leading compound — there it becomes a style query (#156)`);
    return [{ query: conditions.sort().join(' and '), selector: kept + ANY_ELEMENT.repeat(conditions.length) + rest }];
}

/** One style rule, its selectors grouped by the query each needs: the plain ones first, as written. */
function rewriteRule(selectorList: string, body: string): string {
    const groups = new Map<string, string[]>();
    for (const placed of splitList(selectorList).flatMap(place)) {
        const list = groups.get(placed.query) ?? [];
        list.push(placed.selector);
        groups.set(placed.query, list);
    }
    let out = '';
    const plain = groups.get('');
    if (plain) out += `${plain.join(', ')} {${body}}`;
    for (const [query, selectors] of groups) {
        if (query) out += `${out ? ' ' : ''}@container ${query} { ${selectors.join(', ')} {${body}} }`;
    }
    return out;
}

/** CSS without its comments, then each rule on a behaviour attribute as a container style query. */
export function behaviourQueries(css: string): string {
    return rewriteBlock(css.replace(/\/\*[\s\S]*?\*\//g, '')); // strip CSS comments
}

/** A block's rules rewritten, at-rules that hold rules walked into, every other at-rule as written. */
function rewriteBlock(css: string): string {
    let out = '';
    let pos = 0;
    while (pos < css.length) {
        const wsStart = pos;
        while (pos < css.length && /\s/.test(css[pos])) pos++;
        out += css.slice(wsStart, pos);
        if (pos >= css.length) break;

        if (css[pos] === '@') {
            const end = preludeEnd(css, pos);
            if (end === -1) { out += css.slice(pos); break; }
            if (css[end] === ';') { out += css.slice(pos, end + 1); pos = end + 1; continue; }
            const prelude = css.slice(pos, end).trim();
            // The name, in lower case. Match: `@` and the name. Groups: [1]=name
            const name = (/^@([\w-]+)/.exec(prelude)?.[1] ?? '').toLowerCase();
            const close = blockEnd(css, end);
            const inner = css.slice(end + 1, close);
            out += NESTED_AT_RULES.has(name) ? `${prelude} {${rewriteBlock(inner)}}` : `${prelude} {${inner}}`;
            pos = close + 1;
            continue;
        }

        const brace = css.indexOf('{', pos);
        if (brace === -1) { out += css.slice(pos); break; }
        const close = blockEnd(css, brace);
        const body = css.slice(brace + 1, close);
        const nested = ANY_BEHAVIOUR.exec(body);
        if (nested) throw new Error(`[pdx] ${nested[1]} in a nested rule: the behaviour rewrite reads top-level rules only (#156)`);
        out += rewriteRule(css.slice(pos, brace).trim(), body);
        pos = close + 1;
    }
    return out;
}
