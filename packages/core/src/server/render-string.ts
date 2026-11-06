// html`` rendered to a string, with no DOM (#160): what static generation writes a route's HTML with.
//
// It renders what the client would build from the same template and the same values, read once: a
// function value is called untracked, no effect is created, no listener is attached. The markup is
// the client's, node for node, so that hydration can adopt it (#160, part 4): every place the client
// puts content a value gave — a text, a nested template, a list — is bracketed by `<!--pdx-->` and
// `<!--/pdx-->`, because the HTML parser merges adjacent text that the client keeps apart.
//
// How each binding renders follows template.ts: `@event`, `:ref` and `attach:` write nothing; `:class.x`,
// `:style.x` and `:show` write the class and style they would set; `:prop` writes the attribute a
// property reflects, or nothing where it reflects none; a plain attribute follows `setProp`. Text and
// attribute values are escaped; a bound URL is sanitised as the client sanitises it.

import { untracked } from '../reactivity/signal';
import { sanitizeUrlForTag } from '../security/sanitize-url';
import { PH_EXTRACT, PH_REGEX } from '../renderer/template-plan';
import { templateTree, type TreeNode, type TreeAttribute } from './template-tree';
import { withServerRender, isServerTemplate, type ServerTemplate } from './mode';

/** Brackets a value's content, so that hydration finds it after the parser merged its text. */
export const PART_OPEN = '<!--pdx-->';
export const PART_CLOSE = '<!--/pdx-->';

/** Render what `fn` returns — an html`` template, typically — to a string. */
export function renderToString(fn: () => unknown): string {
    return withServerRender(() => untracked(() => content(fn())));
}

/** A value in content: what the client's `toNodes`/`bindInterpolation` would put there, as markup. */
function content(value: unknown): string {
    if (typeof value === 'function') return content(untracked(value as () => unknown));
    if (isServerTemplate(value)) return renderTemplate(value);
    if (Array.isArray(value)) return value.map(content).join('');
    if (value == null || value === false) return '';
    if (typeof value === 'object') return '';
    return escapeText(String(value));
}

function renderTemplate(t: ServerTemplate): string {
    return nodes(templateTree(t.strings), t.values);
}

function nodes(list: TreeNode[], values: readonly unknown[]): string {
    let out = '';
    for (const n of list) {
        if (n.kind === 'text') out += n.raw;
        else if (n.kind === 'comment') out += `<!--${n.raw}-->`;
        else if (n.kind === 'hole') out += PART_OPEN + content(values[n.index]) + PART_CLOSE;
        else out += element(n, values);
    }
    return out;
}

// ─── Elements ─────────────────────────────────────────────────────

/** What an element's bindings wrote: its attributes in order, plus class and style built up apart. */
interface ElementState {
    tag: string;
    attributes: Map<string, string | null>;
    classes: string[];
    style: string[];
    /** Text a `:textContent` binding put in place of the children. */
    text: string | null;
}

function element(n: Extract<TreeNode, { kind: 'element' }>, values: readonly unknown[]): string {
    const s: ElementState = { tag: n.name, attributes: new Map(), classes: [], style: [], text: null };
    for (const a of n.attributes) attribute(s, a, values);
    let open = `<${n.name}`;
    const attrs = new Map(s.attributes);
    if (s.classes.length) attrs.set('class', [attrs.get('class'), ...s.classes].filter(Boolean).join(' '));
    if (s.style.length) attrs.set('style', [attrs.get('style'), ...s.style].filter(Boolean).join(' '));
    for (const [name, value] of attrs) open += value === null ? ` ${name}` : ` ${name}="${value}"`;
    open += '>';
    if (n.void) return open;
    const inner = s.text !== null ? escapeText(s.text) : nodes(n.children, values);
    return `${open}${inner}</${n.name}>`;
}

function attribute(s: ElementState, a: TreeAttribute, values: readonly unknown[]): void {
    if (a.value === null || !PH_EXTRACT.test(a.value)) {
        s.attributes.set(a.name, a.value);
        return;
    }
    const whole = a.value.match(new RegExp(`^${PH_EXTRACT.source}$`));
    if (!whole) {
        // Static and bound parts in one value: the client concatenates them into one string.
        const joined = a.value.split(PH_REGEX).map((seg) => {
            const m = seg.match(PH_EXTRACT);
            return m ? String(read(values[Number(m[1])]) ?? '') : seg;
        }).join('');
        binding(s, a.name, joined);
        return;
    }
    binding(s, a.name, values[Number(whole[1])]);
}

/** A bound attribute by its prefix, as template.ts routes it. */
function binding(s: ElementState, key: string, value: unknown): void {
    if (key.startsWith('@') || key === ':ref' || key.startsWith('attach:')) return;
    if (key.startsWith('::')) { property(s, key.slice(2).split('.')[0], read(value)); return; }
    if (key === ':show') { if (!read(value)) s.style.push('display: none;'); return; }
    if (key.startsWith(':class.')) { if (read(value)) s.classes.push(key.slice(7)); return; }
    if (key.startsWith(':style.')) { s.style.push(`${key.slice(7)}: ${escapeAttr(String(read(value) ?? ''))};`); return; }
    if (key.startsWith(':')) { property(s, key.endsWith('.once') ? key.slice(1, -5) : key.slice(1), read(value)); return; }
    plainAttribute(s, key, read(value));
}

/** A function value is read once, untracked: the client's first run of its effect. */
function read(value: unknown): unknown {
    return typeof value === 'function' ? untracked(value as () => unknown) : value;
}

/** `setProp`: a plain attribute. */
function plainAttribute(s: ElementState, key: string, value: unknown): void {
    if (key === 'class' && typeof value === 'string') { s.attributes.set('class', escapeAttr(value)); return; }
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

/** `:prop` (template.ts `bindProperty`): a component's prop writes nothing; a plain element's, its attribute. */
function property(s: ElementState, prop: string, value: unknown): void {
    if (s.tag.includes('-')) return;
    const camel = ATTR_TO_PROP[prop] ?? prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    if (camel === 'className') { for (const t of textOf(value).split(/\s+/).filter(Boolean)) s.classes.push(escapeAttr(t)); return; }
    if (camel === 'textContent' || camel === 'innerText') { s.text = textOf(value); return; }
    if (UNREFLECTED.has(camel)) return;
    if (camel === 'style') { if (value != null) s.style.push(escapeAttr(String(value))); return; }
    if (camel === 'value' && s.tag === 'textarea') { s.text = textOf(value); return; }
    const attr = prop.startsWith('aria-') || prop.startsWith('data-') ? prop : prop.toLowerCase();
    if (value == null || value === false) { s.attributes.delete(attr); return; }
    if (value === true) { s.attributes.set(attr, ''); return; }
    setUrlOrString(s, attr, value);
}

function setUrlOrString(s: ElementState, key: string, value: unknown): void {
    if (URL_PROPS.has(key.toLowerCase())) {
        const safe = sanitizeUrlForTag(s.tag, key, value);
        if (safe == null) s.attributes.delete(key); else s.attributes.set(key, escapeAttr(safe));
        return;
    }
    s.attributes.set(key, escapeAttr(String(value)));
}

function styleObject(value: object): string {
    return Object.entries(value).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${escapeAttr(String(v))};`).join(' ');
}

/** `interpolationText`: null, undefined and false are no text. */
function textOf(value: unknown): string {
    return value == null || value === false ? '' : String(value);
}

function escapeText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
