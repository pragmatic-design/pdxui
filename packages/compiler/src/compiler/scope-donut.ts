// `<style scoped>` under `target: 'baseline-2026'` (#152): a donut scope that stops at nested components.
//
//   @scope ([data-pdx-H], [data-pdx-H-in]) to ([data-pdx-root] > *) { …the rules… }
//
// The roots are the component's host and the elements of its template that sit inside a child
// component's tag — content the child projects into a slot, marked `data-pdx-H-in` by the compiler
// (./slotted-marks). Every component host carries `data-pdx-root` (core): the limit `[data-pdx-root] > *`
// stops at what a child renders, and leaves the child's host itself in scope, so a page still places
// the components it lays out. Measured in Chromium: packages/showcase/tests/scoped-styles.spec.ts.
//
// Two rewrites of a selector, each with the specificity the ancestor form of baseline-2024 gives it —
// `[data-pdx-H] S` is S plus one attribute — so a scoped rule wins and loses against the page's other
// CSS where it did before:
//   - inside `@scope` a selector without `:scope` is relative, `:where(:scope) S`: it matches the
//     descendants of a root, never the root itself, and the `:where` drops the attribute's weight. So
//     `S` → `:scope S, :where(:not([data-pdx-H])):scope:is(S)`. The explicit `:scope` weighs what the
//     attribute did; the second alternative matches a projected root itself, with the same weight, and
//     never the host;
//   - `:scope` is the host: `:scope` → `:where(:scope)[data-pdx-H]`, the weight of `[data-pdx-H]`, and a
//     projected root is not styled as one.
// A template that writes nothing inside a component's tag has no projected root: its blocks get the
// single-root form, `@scope ([data-pdx-H]) to (…)` with `S` → `:scope S` (#511).
// `@media`, `@supports`, `@layer`, `@container` and `@starting-style` hold a scope of their own; every
// other at-rule — `@keyframes`, `@font-face`, an author's `@scope` — is copied as written.

const NESTED_AT_RULES = new Set(['media', 'supports', 'layer', 'container', 'starting-style']);

/** The fixed attribute core puts on every component host. */
export const ROOT_ATTR = 'data-pdx-root';

/**
 * The prelude of the donut scope for a component's scope attribute. Without `slotted` — a template
 * that writes nothing inside a component's tag (#511) — the host is the only root.
 */
export function donutPrelude(scopeId: string, slotted = true): string {
    return slotted
        ? `@scope ([${scopeId}], [${scopeId}-in]) to ([${ROOT_ATTR}] > *)`
        : `@scope ([${scopeId}]) to ([${ROOT_ATTR}] > *)`;
}

/** The index of the `}` that closes the block opened at `open`, braces in strings skipped. */
export function blockEnd(css: string, open: number): number {
    let depth = 0;
    let quote = '';
    for (let i = open; i < css.length; i++) {
        const c = css[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) return i;
    }
    return css.length - 1;
}

/** Where an at-rule's prelude ends: the first `;` or `{` outside strings and parentheses, or -1. */
export function preludeEnd(css: string, from: number): number {
    let depth = 0;
    let quote = '';
    for (let i = from; i < css.length; i++) {
        const c = css[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (depth <= 0 && (c === ';' || c === '{')) return i;
    }
    return -1;
}

/** A selector list split at its top-level commas. */
export function splitList(selector: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote = '';
    let start = 0;
    for (let i = 0; i < selector.length; i++) {
        const c = selector[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ',' && depth === 0) { parts.push(selector.slice(start, i)); start = i + 1; }
    }
    parts.push(selector.slice(start));
    return parts.map((p) => p.trim()).filter(Boolean);
}

// Match: `:scope` as a pseudo-class, not the start of a longer name. Groups: none
const SCOPE_PSEUDO = /:scope(?![\w-])/g;
// `.test` on a global regex moves its lastIndex: reset before every use (see donutSelector).

const LEGACY_PSEUDO_ELEMENTS = [':before', ':after', ':first-line', ':first-letter'];

/**
 * A trailing pseudo-element, which `:is()` cannot hold: `.a::before` → ['.a', '::before']. Found from
 * the last `::` rather than with a regex anchored at the end, which backtracks on a long selector.
 */
function splitPseudoElement(sel: string): [string, string] {
    const at = sel.lastIndexOf('::');
    if (at > 0 && /^::[\w-]+(?:\([^()]*\))?$/.test(sel.slice(at))) return [sel.slice(0, at), sel.slice(at)];
    for (const legacy of LEGACY_PSEUDO_ELEMENTS) {
        if (sel.length > legacy.length && sel.endsWith(legacy) && sel[sel.length - legacy.length - 1] !== ':') {
            return [sel.slice(0, -legacy.length), legacy];
        }
    }
    return [sel, ''];
}

/**
 * One selector of a scoped rule, rewritten for the donut. The second form, which matches a projected
 * root itself, only when the template has projected roots (`slotted`).
 */
function donutSelector(sel: string, scopeId: string, slotted: boolean): string {
    SCOPE_PSEUDO.lastIndex = 0;
    if (SCOPE_PSEUDO.test(sel)) {
        SCOPE_PSEUDO.lastIndex = 0;
        return sel.replace(SCOPE_PSEUDO, `:where(:scope)[${scopeId}]`);
    }
    if (!slotted) return `:scope ${sel}`;
    const [base, pseudo] = splitPseudoElement(sel);
    return `:scope ${sel}, :where(:not([${scopeId}])):scope:is(${base})${pseudo}`;
}

/**
 * A block's CSS — comments out and its functions transformed — as donut scopes. `slotted` says the
 * template marks elements inside a component's tag (./slotted-marks): without them, one root and one
 * form per selector (#511).
 */
export function donutScope(css: string, scopeId: string, slotted = true): string {
    let out = '';
    let run = ''; // style rules waiting for their @scope
    const flush = (): void => {
        if (run.trim()) out += `${donutPrelude(scopeId, slotted)} {${run}}`;
        run = '';
    };
    let pos = 0;
    while (pos < css.length) {
        const wsStart = pos;
        while (pos < css.length && /\s/.test(css[pos])) pos++;
        const ws = css.slice(wsStart, pos);
        if (run) run += ws; else out += ws;
        if (pos >= css.length) break;

        if (css[pos] === '@') {
            const end = preludeEnd(css, pos);
            if (end === -1) { flush(); out += css.slice(pos); break; }
            flush();
            if (css[end] === ';') { out += css.slice(pos, end + 1); pos = end + 1; continue; }
            const prelude = css.slice(pos, end).trim();
            // The name, in lower case. Match: `@` and the name. Groups: [1]=name
            const name = (/^@([\w-]+)/.exec(prelude)?.[1] ?? '').toLowerCase();
            const close = blockEnd(css, end);
            const inner = css.slice(end + 1, close);
            out += NESTED_AT_RULES.has(name) ? `${prelude} {${donutScope(inner, scopeId, slotted)}}` : `${prelude} {${inner}}`;
            pos = close + 1;
            continue;
        }

        const brace = css.indexOf('{', pos);
        if (brace === -1) { flush(); out += css.slice(pos); break; }
        const close = blockEnd(css, brace);
        const selectors = splitList(css.slice(pos, brace)).map((s) => donutSelector(s, scopeId, slotted)).join(', ');
        run += `${selectors} {${css.slice(brace + 1, close)}}`;
        pos = close + 1;
    }
    flush();
    return out;
}
