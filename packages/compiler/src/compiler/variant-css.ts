// `@variant` blocks in CSS, and the form the library's stylesheets compile them to (#153, #512).
//
// `expandVariantBlocks` finds every `@variant tests { rules }` and hands each selector of its body to
// the caller, who decides what it becomes: a `.pdx` puts it under its scoped host (./variants), the
// library puts it under the tag's attribute test, bounded at nested components, plus the native
// selector its axis maps (#626, docs/language/styles.md, "In the library"):
//     @variant variant(ghost) { [data-part="root"] { … } }            in components/button.css
//     :where(pdx-button[variant="ghost"]) [data-part="root"]:not(:where(pdx-button[variant="ghost"] [data-pdx-root] [data-part="root"])),
//     .pdx-ghost { … }
//
// This module imports nothing: the design package's build scripts load it with Node, which strips the
// types but does not resolve an import without its extension.

/** One axis a library component declares, as `custom-elements.json` lists it. */
export interface LibraryAxis {
    name: string;
    values: string[];
    default: string;
    /** Each value → the selector that draws the same look on native HTML, for a record axis. */
    native?: Record<string, string>;
}

/** One value of a library `@variant` test: the tag (written, or implied by the file), axis, value. */
export interface LibraryVariantTest {
    tag: string | undefined;
    axis: string;
    value: string;
    /** Offset of the test in the CSS — the same for every value of a list. */
    at: number;
}

/** Where a block that starts at `open` (a `{`) closes. */
function blockEnd(css: string, open: number): number {
    let depth = 0;
    for (let i = open; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) return i;
    }
    return css.length - 1;
}

/** The selectors of a list, split at its top-level commas. */
function splitList(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
    }
    parts.push(list.slice(start));
    return parts.map((s) => s.trim()).filter(Boolean);
}

/** The CSS with each comment blanked to spaces, so offsets hold and a brace in a comment is not one. */
function maskComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, (c) => ' '.repeat(c.length));
}

/**
 * A prelude split where its head starts: the whitespace and comments before it, kept as written, and
 * the head. A comment may name `@variant` or hold a `{`-free selector; it is never read as the head.
 */
function splitPrelude(prelude: string): { lead: string; head: string } {
    const start = maskComments(prelude).search(/\S/);
    if (start < 0) return { lead: prelude, head: '' };
    return { lead: prelude.slice(0, start), head: prelude.slice(start).trim() };
}

/** The rules of a `@variant` body, each selector rewritten by `under`. */
function rewriteBody(body: string, tests: string, under: (tests: string, selector: string) => string): string {
    const masked = maskComments(body);
    let out = '';
    let pos = 0;
    while (pos < body.length) {
        const open = masked.indexOf('{', pos);
        if (open === -1) { out += body.slice(pos); break; }
        const end = blockEnd(masked, open);
        const { lead, head } = splitPrelude(body.slice(pos, open));
        if (head.startsWith('@')) {
            // An at-rule inside a variant (`@media`): its rules are rewritten too.
            out += `${lead}${head} {${rewriteBody(body.slice(open + 1, end), tests, under)}}`;
        } else {
            out += `${lead}${splitList(head).map((s) => under(tests, s)).join(', ')} {${body.slice(open + 1, end)}}`;
        }
        pos = end + 1;
    }
    return out;
}

// Match: the at-rules whose blocks hold rules, where a `@variant` may sit. Groups: none
const NESTING = /^@(media|supports|layer|container|pdx-theme)\b/i;

/**
 * The CSS with every `@variant tests { rules }` replaced by its rules, each selector of the body
 * rewritten by `under(tests, selector)`, where `tests` is the prelude after `@variant`. `@variant` is
 * found at the top level and inside `@media`, `@supports`, `@layer`, `@container` and `@pdx-theme`;
 * elsewhere it is copied as written.
 */
export function expandVariantBlocks(css: string, under: (tests: string, selector: string) => string): string {
    if (!css.includes('@variant')) return css;
    const masked = maskComments(css);
    let out = '';
    let pos = 0;
    while (pos < css.length) {
        const open = masked.indexOf('{', pos);
        if (open === -1) { out += css.slice(pos); break; }
        const end = blockEnd(masked, open);
        const prelude = css.slice(pos, open);
        const { lead, head } = splitPrelude(prelude);
        // Match: `@variant` followed by its tests. Groups: [1]=the tests
        const variant = /^@variant\s+(.+)$/s.exec(head);
        if (variant) {
            out += lead + rewriteBody(css.slice(open + 1, end), variant[1].trim(), under).trim();
        } else if (NESTING.test(head)) {
            out += `${prelude}{${expandVariantBlocks(css.slice(open + 1, end), under)}}`;
        } else {
            out += css.slice(pos, end + 1);
        }
        pos = end + 1;
    }
    return out;
}

// Match: one test of a `@variant` prelude, one value or several. Groups: [1]=axis [2]=the values
export const VARIANT_TEST = /(\w+)\s*\(\s*([\w-]+(?:\s*,\s*[\w-]+)*)\s*\)/g;

/** The values of a test, `ghost, danger` → `['ghost', 'danger']`. */
export function testValues(list: string): string[] {
    return list.split(',').map((v) => v.trim());
}

/** The attribute test for some values of an axis: `[variant="ghost"]`, or `:is(…)` for several. */
export function attributeTest(axis: string, values: string[]): string {
    const attrs = values.map((v) => `[${axis}="${v}"]`);
    return attrs.length > 1 ? `:is(${attrs.join(',')})` : attrs[0];
}

// Match: a custom element's name opening a prelude, before its tests. Groups: [1]=tag
const PRELUDE_TAG = /^\s*([a-z][a-z0-9]*-[a-z0-9-]*)(?=\s)/;

/** A prelude read: its tag (written, else the implied one) and its tests. */
function readPrelude(prelude: string, impliedTag: string | undefined): { tag: string | undefined; tests: [string, string[]][] } {
    const written = PRELUDE_TAG.exec(prelude);
    const rest = written ? prelude.slice(written[0].length) : prelude;
    return { tag: written?.[1] ?? impliedTag, tests: [...rest.matchAll(VARIANT_TEST)].map((t) => [t[1], testValues(t[2])]) };
}

/**
 * The host's attribute test: for each axis, its values and every value sharing one of their native
 * selectors, in the axis's order — `[variant="ghost"]`, or `:is(…)` for several.
 */
function attributeTests(tests: [string, string[]][], axes: LibraryAxis[]): string {
    return tests.map(([name, values]) => {
        const axis = axes.find((a) => a.name === name);
        if (!axis) return attributeTest(name, values);
        const natives = new Set(values.map((v) => axis.native?.[v]));
        natives.delete(undefined);
        const selected = axis.values.filter((v) => values.includes(v) || natives.has(axis.native?.[v]));
        return attributeTest(name, selected.length ? selected : values);
    }).join('');
}

/** The native compound of the tests, when every value has one: several of an axis are one `:is()`. */
function nativeCompound(tests: [string, string[]][], axes: LibraryAxis[]): string | undefined {
    let compound = '';
    for (const [name, values] of tests) {
        const axis = axes.find((a) => a.name === name);
        const natives = values.map((v) => axis?.native?.[v]);
        if (natives.some((n) => n === undefined)) return undefined;
        const unique = [...new Set(natives)];
        compound += unique.length > 1 ? `:is(${unique.join(',')})` : unique[0];
    }
    return compound || undefined;
}

// Match: the root part's attribute selector, quoted or not. Groups: [1]=the quote
const ROOT_PART = /\[data-part=(["']?)root\1\]/g;
// Match: a pseudo-element ending a selector. Groups: [1]=the pseudo-element
const PSEUDO_ELEMENT = /(::[\w-]+(?:\([^)]*\))?|:(?:before|after|first-line|first-letter))$/;

/** The native form of a selector: its root part replaced by the native selector, when it names no other part. */
function nativeForm(selector: string, native: string | undefined): string | undefined {
    const parts = selector.match(/\[data-part=/g)?.length ?? 0;
    const rootParts = selector.match(ROOT_PART)?.length ?? 0;
    if (native === undefined || rootParts === 0 || rootParts !== parts) return undefined;
    return selector.replace(ROOT_PART, native);
}

/**
 * One selector of a library rule: under the host test, then its native form if it has one. A
 * descendant of the host is bounded at nested components; a child of the host, `:scope > S`, cannot
 * be inside one and is not — the bound costs the browser an ancestor walk per candidate element.
 */
function librarySelector(selector: string, host: string, native: string | undefined): string {
    // Match: a leading `:scope`, the host itself. Groups: none
    if (/^:scope(?![\w-])/.test(selector)) {
        const rest = selector.slice(':scope'.length);
        // Match: a child combinator after `:scope`. Groups: [1]=the child selector
        const child = /^\s*>\s*(.+)$/s.exec(rest)?.[1];
        const own = child === undefined ? undefined : nativeForm(child, native);
        return `:where(${host})${rest}${own === undefined ? '' : `, ${own}`}`;
    }
    const pseudo = PSEUDO_ELEMENT.exec(selector)?.[1] ?? '';
    const base = selector.slice(0, selector.length - pseudo.length);
    const bounded = `:where(${host}) ${base}:not(:where(${host} [data-pdx-root] ${base}))${pseudo}`;
    const own = nativeForm(selector, native);
    return own === undefined ? bounded : `${bounded}, ${own}`;
}

/**
 * A library stylesheet with every `@variant` compiled to the selectors of #626. `impliedTag` is the
 * tag of the component whose own stylesheet this is (`pdx-button` for `components/button.css`), and
 * `axesOf` the axes the manifest lists for a tag. A rule with no tag, or naming what the manifest does
 * not declare, still compiles — on the attributes alone — and the diagnostics report it.
 */
export function expandLibraryVariants(css: string, impliedTag: string | undefined, axesOf: (tag: string) => LibraryAxis[] | undefined): string {
    return expandVariantBlocks(css, (prelude, selector) => {
        const { tag, tests } = readPrelude(prelude, impliedTag);
        const axes = (tag && axesOf(tag)) || [];
        return librarySelector(selector, `${tag ?? ''}${attributeTests(tests, axes)}`, nativeCompound(tests, axes));
    });
}

/** Every test of every library `@variant` prelude in the CSS, in order, with its tag. Comments ignored. */
export function libraryVariantTests(css: string, impliedTag: string | undefined): LibraryVariantTest[] {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    const found: LibraryVariantTest[] = [];
    // Match: a `@variant` prelude up to its `{`. Groups: [1]=the prelude
    for (const m of text.matchAll(/@variant\s+([^{};]+)\{/g)) {
        const base = m.index + m[0].indexOf(m[1]);
        const written = PRELUDE_TAG.exec(m[1]);
        const offset = written ? written[0].length : 0;
        for (const t of m[1].slice(offset).matchAll(VARIANT_TEST)) {
            for (const value of testValues(t[2])) {
                found.push({ tag: written?.[1] ?? impliedTag, axis: t[1], value, at: base + offset + t.index });
            }
        }
    }
    return found;
}
