// html`` rendered to a string, with no DOM (#160): what static generation writes a route's HTML with.
//
// It renders what the client would build from the same template and the same values, read once: a
// function value is called untracked, no listener is attached, no mount callback runs. The markup is
// the client's, node for node, so that hydration can adopt it (#160, part 4): every place the client
// puts content a value gave — a text, a nested template, a list — is bracketed by `<!--pdx-->` and
// `<!--/pdx-->`, because the HTML parser merges adjacent text that the client keeps apart.
//
// How each binding renders follows template.ts: `@event`, `:ref` and `attach:` write nothing; `:class.x`,
// `:style.x` and `:show` write the class and style they would set; `:prop` writes the attribute a
// property reflects on a plain element, and is handed to a component as the property; a plain
// attribute follows `setProp`. A component renders as its host, marked `data-pdx-ssr`, with its own
// render inside and its children projected into its slots as the client projects them
// (render-component.ts). Text and attribute values are escaped, bound URLs sanitised as the client
// sanitises them.

import { untracked, collectDisposers } from '../reactivity/signal';
import { sanitizeUrlForTag } from '../security/sanitize-url';
import { twoWayAccessor } from '../renderer/two-way-value';
import { PH_EXTRACT, PH_REGEX } from '../renderer/template-plan';
import { templateTree, VOID_ELEMENTS, type TreeNode, type TreeAttribute } from './template-tree';
import { withServerRender, isDeferredTemplate, isServerBlock, isServerElement, type DeferredTemplate, type ServerBlock, type ServerElement, type BlockMark } from './mode';
import { renderHost, type SkippedComponent } from './render-component';

export type { SkippedComponent } from './render-component';

/** Brackets a value's content, so that hydration finds it after the parser merged its text. */
export const PART_OPEN = '<!--pdx-->';
export const PART_CLOSE = '<!--/pdx-->';

/** A component's children, as the markup each of its slots receives. */
interface Projected {
    readonly default: string;
    readonly named: ReadonlyMap<string, string>;
}

/** The children projected into a component's slots, and the component, by the id its host carries. */
interface Projection extends Projected {
    readonly owner: number;
}

/**
 * Brackets what a slot received, so that hydration (#160, part 4) tells the component's own nodes from
 * the ones projected into it — which its parent's template rendered and binds. `owner` is the id of the
 * host whose slot it is (`data-pdx-ssr`), `name` the slot's name, empty for the default one.
 */
export const slotOpen = (owner: number, name: string): string => `<!--pdx-slot:${owner}:${name}-->`;
export const SLOT_CLOSE = '<!--/pdx-slot-->';

/** The ids of the hosts the current render has written, so that each slot names its own. */
let hostSeq = 0;

/** Where the current render reports the components it could not render. */
let skipped: SkippedComponent[] = [];

/** Render what `fn` returns — an html`` template, typically — to a string. */
export function renderToString(fn: () => unknown): string {
    return renderToStringWithReport(fn).html;
}

/** The same, with the components that rendered as empty hosts and why. */
export function renderToStringWithReport(fn: () => unknown): { html: string; skipped: SkippedComponent[] } {
    const outer = skipped;
    const outerSeq = hostSeq;
    skipped = [];
    hostSeq = 0;
    try {
        const html = withServerRender(() => untracked(() => content(fn(), null)));
        return { html, skipped };
    } finally {
        skipped = outer;
        hostSeq = outerSeq;
    }
}

/**
 * A value in content: what the client's `toNodes`/`bindInterpolation` would put there, as markup.
 * `mark` is what an enclosing helper does to the nodes this value places at its top level.
 */
function content(value: unknown, slots: Projection | null, mark: BlockMark | null = null): string {
    if (typeof value === 'function') return content(untracked(value as () => unknown), slots, mark);
    if (isDeferredTemplate(value)) return renderTemplate(value, slots, mark);
    if (isServerBlock(value)) return renderBlock(value, slots, mark);
    if (isServerElement(value)) return createdElement(value, mark);
    if (Array.isArray(value)) return value.map((v) => content(v, slots, mark)).join('');
    if (value == null || value === false) return '';
    if (typeof value === 'object') return '';
    return mark?.hidden ? SHOW_PLACEHOLDER : escapeText(String(value));
}

/** The comment a false `show()` puts in place of a top-level text node. */
const SHOW_PLACEHOLDER = '<!--show-->';

function renderTemplate(t: DeferredTemplate, slots: Projection | null, mark: BlockMark | null): string {
    return nodes(templateTree(t.strings), t.values, slots, mark);
}

/**
 * A helper's content between its markers. The branch or the rows render inside an ownership scope
 * disposed at the end, as the client disposes a branch it removes: nothing they create outlives the
 * render. The block's mark joins the one around it — a list inside a false `show()` has rows that are
 * both items and hidden, as on the client.
 */
function renderBlock(b: ServerBlock, slots: Projection | null, outer: BlockMark | null): string {
    const mark = b.mark && outer ? { item: b.mark.item || outer.item, hidden: b.mark.hidden || outer.hidden } : (b.mark ?? outer);
    const render = (parts: () => readonly unknown[]): string => {
        const [inner, dispose] = collectDisposers(() => untracked(() => parts().map((part) => content(part, slots, mark)).join('')));
        dispose();
        return inner;
    };
    let inner: string;
    if (b.fallback === null) inner = render(b.parts);
    else {
        // An error boundary: what the content threw while it rendered — its parts or anything they
        // render — renders the fallback in its place, as the client's boundary shows it.
        const fallback = b.fallback;
        try { inner = render(b.parts); } catch (error) { inner = render(() => fallback(error)); }
    }
    return (b.open === null ? '' : `<!--${b.open}-->`) + inner + (b.close === null ? '' : `<!--${b.close}-->`);
}

/** A component's children: none. */
const NO_CHILDREN: Projected = { default: '', named: new Map() };

/**
 * An element a helper created by its tag (ServerElement): its attributes and, on a component, the
 * properties the client assigns it. It has no children of its own.
 */
function createdElement(e: ServerElement, mark: BlockMark | null): string {
    const attrs = new Map<string, string | null>(Object.entries(e.attributes));
    if (mark?.item) attrs.set('data-pdx-item', '');
    if (mark?.hidden && e.tag !== 'svg' && e.tag !== 'math') attrs.set('style', joinStyle([attrs.get('style'), 'display: none;']));
    if (e.tag.includes('-')) {
        const host = componentHost(e.tag, attrs, new Map(Object.entries(e.props)), () => NO_CHILDREN, () => '');
        if (host !== null) return host;
    }
    const open = openTag(e.tag, attrs);
    return VOID_ELEMENTS.has(e.tag) ? open : `${open}</${e.tag}>`;
}

/**
 * A component as its host, marked pre-rendered (`data-pdx-ssr`), with its own render inside and
 * `children` projected into its slots; null when the tag is no component of ours (render-component.ts).
 */
function componentHost(tag: string, attrs: ReadonlyMap<string, string | null>, props: ReadonlyMap<string, unknown>, children: () => Projected, light: () => string): string | null {
    const owner = ++hostSeq;
    // The children render after the component's own render, inside its scope, as its slots receive them.
    const host = renderHost(tag, attrs, props, (rendered) => content(rendered, { ...children(), owner }), skipped);
    if (!host) return null;
    host.attributes.set('data-pdx-ssr', String(owner));
    // A component the server could not render: its children are written as the client finds them
    // before it mounts — its light DOM, which the client projects — in a region of their own (`*`), so
    // that hydration lets its parent bind them where they are.
    if (host.skipped) {
        const children = light();
        if (children) host.inner = slotOpen(owner, '*') + children + SLOT_CLOSE;
    }
    return `${openTag(tag, host.attributes)}${host.inner}</${tag}>`;
}

/** A node list; `mark` applies to these nodes only, not to their children. */
function nodes(list: TreeNode[], values: readonly unknown[], slots: Projection | null, mark: BlockMark | null = null): string {
    let out = '';
    for (const n of list) {
        if (n.kind === 'text') out += mark?.hidden ? SHOW_PLACEHOLDER : n.raw;
        else if (n.kind === 'comment') out += `<!--${n.raw}-->`;
        else if (n.kind === 'hole') out += PART_OPEN + content(values[n.index], slots, mark) + PART_CLOSE;
        else out += element(n, values, slots, mark);
    }
    return out;
}

// ─── Elements ─────────────────────────────────────────────────────

type ElementNode = Extract<TreeNode, { kind: 'element' }>;

/** What an element's bindings wrote, unescaped: attributes, class and style built up apart, props. */
interface ElementState {
    tag: string;
    attributes: Map<string, string | null>;
    classes: string[];
    style: string[];
    /** Text a `:textContent` binding put in place of the children. */
    text: string | null;
    /** What `:prop` bindings hand a component, by property name. */
    props: Map<string, unknown>;
}

function element(n: ElementNode, values: readonly unknown[], slots: Projection | null, mark: BlockMark | null): string {
    // The slot this template rendered, with the content projected into it (element.ts `_projectSlots`):
    // replaced by it, or left with its own default content when it has none.
    if (n.name === 'slot' && slots) {
        const name = n.attributes.find((a) => a.name === 'name')?.value ?? null;
        const projected = name ? slots.named.get(name) : slots.default;
        if (projected) return slotOpen(slots.owner, name ?? '') + projected + SLOT_CLOSE;
    }
    const s: ElementState = { tag: n.name, attributes: new Map(), classes: [], style: [], text: null, props: new Map() };
    for (const a of n.attributes) attribute(s, a, values);
    // What the enclosing helper sets on a top-level element (list.ts `createRow`, helpers.ts `show`):
    // after the element's own bindings, as the client sets it after the template built the element.
    if (mark?.item) s.attributes.set('data-pdx-item', '');
    if (mark?.hidden && n.name !== 'svg' && n.name !== 'math') s.style.push('display: none;');
    const attrs = new Map(s.attributes);
    if (s.classes.length) attrs.set('class', [attrs.get('class'), ...s.classes].filter(Boolean).join(' '));
    if (s.style.length) attrs.set('style', joinStyle([attrs.get('style'), ...s.style]));

    if (n.name.includes('-')) {
        const host = componentHost(n.name, attrs, s.props, () => project(n, values, slots), () => nodes(n.children, values, slots));
        if (host !== null) return host;
    }
    const open = openTag(n.name, attrs);
    if (n.void) return open;
    const inner = s.text !== null ? escapeText(s.text) : nodes(n.children, values, slots);
    return `${open}${inner}</${n.name}>`;
}

/** A component element's children, grouped as its slots receive them, rendered in its parent's context. */
function project(n: ElementNode, values: readonly unknown[], slots: Projection | null): Projected {
    const named = new Map<string, TreeNode[]>();
    const rest: TreeNode[] = [];
    for (const child of n.children) {
        const slot = child.kind === 'element' ? child.attributes.find((a) => a.name === 'slot')?.value ?? null : null;
        if (slot) named.set(slot, [...(named.get(slot) ?? []), child]);
        else rest.push(child);
    }
    const rendered = new Map<string, string>();
    for (const [name, group] of named) rendered.set(name, nodes(group, values, slots));
    return { default: nodes(rest, values, slots), named: rendered };
}

function openTag(name: string, attrs: ReadonlyMap<string, string | null>): string {
    let open = `<${name}`;
    for (const [attr, value] of attrs) open += value === null ? ` ${attr}` : ` ${attr}="${escapeAttr(value)}"`;
    return `${open}>`;
}

function attribute(s: ElementState, a: TreeAttribute, values: readonly unknown[]): void {
    if (a.value === null || !PH_EXTRACT.test(a.value)) {
        s.attributes.set(a.name, a.value === null ? null : decodeEntities(a.value));
        return;
    }
    const whole = a.value.match(new RegExp(`^${PH_EXTRACT.source}$`));
    if (!whole) {
        // Static and bound parts in one value: the client concatenates them into one string.
        const joined = a.value.split(PH_REGEX).map((seg) => {
            const m = seg.match(PH_EXTRACT);
            return m ? String(read(values[Number(m[1])]) ?? '') : decodeEntities(seg);
        }).join('');
        binding(s, a.name, joined);
        return;
    }
    binding(s, a.name, values[Number(whole[1])]);
}

/** A bound attribute by its prefix, as template.ts routes it. */
function binding(s: ElementState, key: string, value: unknown): void {
    if (key.startsWith('@') || key === ':ref' || key.startsWith('attach:')) return;
    // A two-way value is read as the client's bindTwoWay reads it: a field, a signal, or `{ get, set }`.
    if (key.startsWith('::')) { property(s, key.slice(2).split('.')[0], twoWayAccessor(value)?.get() ?? read(value)); return; }
    if (key === ':show') { if (!read(value)) s.style.push('display: none;'); return; }
    if (key.startsWith(':class.')) { if (read(value)) s.classes.push(key.slice(7)); return; }
    if (key.startsWith(':style.')) { s.style.push(`${key.slice(7)}: ${String(read(value) ?? '')};`); return; }
    if (key.startsWith(':')) { property(s, key.endsWith('.once') ? key.slice(1, -5) : key.slice(1), read(value)); return; }
    plainAttribute(s, key, read(value));
}

/** A function value is read once, untracked: the client's first run of its effect. */
function read(value: unknown): unknown {
    return typeof value === 'function' ? untracked(value as () => unknown) : value;
}

/** `setProp`: a plain attribute. */
function plainAttribute(s: ElementState, key: string, value: unknown): void {
    if (key === 'class' && typeof value === 'string') { s.attributes.set('class', value); return; }
    if (key === 'style' && typeof value === 'object' && value !== null) { s.style.push(styleObject(value)); return; }
    if (typeof value === 'boolean') { if (value) s.attributes.set(key, ''); else s.attributes.delete(key); return; }
    if (/^on/i.test(key)) { s.attributes.delete(key); return; }
    if (value == null || value === false) { s.attributes.delete(key); return; }
    setUrlOrString(s, key, value);
}

/** Attribute names that differ from their property, as template.ts maps them. */
const ATTR_TO_PROP: Record<string, string> = {
    class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength',
    cellspacing: 'cellSpacing', cellpadding: 'cellPadding', rowspan: 'rowSpan', colspan: 'colSpan',
    usemap: 'useMap', frameborder: 'frameBorder', contenteditable: 'contentEditable',
};
/** A plain element's properties that have no attribute: bound, they write nothing in the markup. */
const UNREFLECTED = new Set(['indeterminate', 'innerHTML', 'outerHTML', 'valueAsNumber', 'valueAsDate', 'selectedIndex', 'defaultValue']);
const URL_PROPS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster']);

/**
 * `:prop` (template.ts `bindProperty`): on a component, the property its parent assigns (aria-* and
 * data-* stay attributes); on a plain element, the attribute the property reflects.
 */
function property(s: ElementState, prop: string, value: unknown): void {
    const camel = ATTR_TO_PROP[prop] ?? prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const aria = prop.startsWith('aria-') || prop.startsWith('data-');
    if (s.tag.includes('-') && !aria) { s.props.set(camel, value); return; }
    if (camel === 'className') { for (const t of textOf(value).split(/\s+/).filter(Boolean)) s.classes.push(t); return; }
    if (camel === 'textContent' || camel === 'innerText') { s.text = textOf(value); return; }
    if (UNREFLECTED.has(camel)) return;
    if (camel === 'style') { if (value != null) s.style.push(String(value)); return; }
    if (camel === 'value' && s.tag === 'textarea') { s.text = textOf(value); return; }
    const attr = aria ? prop : prop.toLowerCase();
    if (value == null || value === false) { s.attributes.delete(attr); return; }
    if (value === true) { s.attributes.set(attr, ''); return; }
    setUrlOrString(s, attr, value);
}

function setUrlOrString(s: ElementState, key: string, value: unknown): void {
    if (URL_PROPS.has(key.toLowerCase())) {
        const safe = sanitizeUrlForTag(s.tag, key, value);
        if (safe == null) s.attributes.delete(key); else s.attributes.set(key, safe);
        return;
    }
    s.attributes.set(key, String(value));
}

/**
 * Declarations from the static attribute and the bindings, as one style attribute: each piece closed
 * with its `;`, since an author's `style="color: red"` has none and the next declaration must not run
 * into its value.
 */
function joinStyle(pieces: ReadonlyArray<string | null | undefined>): string {
    return pieces.map((p) => (p ?? '').trim()).filter(Boolean).map((p) => (p.endsWith(';') ? p : `${p};`)).join(' ');
}

function styleObject(value: object): string {
    return Object.entries(value).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${String(v)};`).join(' ');
}

/** `interpolationText`: null, undefined and false are no text. */
function textOf(value: unknown): string {
    return value == null || value === false ? '' : String(value);
}

/** A static attribute value as the parser reads it: the entities an author writes in markup. */
function decodeEntities(s: string): string {
    if (!s.includes('&')) return s;
    return s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" }[e] ?? _));
}

function escapeText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
