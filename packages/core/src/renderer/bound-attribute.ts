/**
 * The binding of one dynamic attribute or property of a plain element, as the compiler emits it (#1207).
 *
 * The inline render wrote each of these out in full where the template binds it: an effect, the value it
 * wrote last, the comparison, and the write with its null rule — about 200 bytes of minified code per
 * `:aria-label`, the largest construct a compiled component carries after its own script. The work is
 * the same in every binding, so it lives here once and the compiled module calls it. Nothing moves to
 * run time: the compiler still decides, from the element and the name, which of the three writes a
 * binding is, and emits the call to that one.
 *
 * Each keeps the value it wrote last, as core's own binding does (`template.ts`): the effect re-runs
 * when anything it READ changes, and writing the same value again would put it back over what the
 * element holds since — a field being typed in (#44). It starts as an object no value is.
 */

import { effect } from '../reactivity/signal';
import { sanitizeBoundUrl } from '../security/sanitize-url';
import { assignBoundProperty, clearBoundProperty, interpolationText } from './template';

// `once` (#1270): a value that cannot change — a literal, a `@for` row's key, an instance constant —
// or a `:name.once` is written by the same write with no effect, and then the value argument IS the
// value, not a getter: the compiler passes it as it reads it (a `.once` through `untracked`). A flag on
// the same call, not a function of its own: a module imports core's names in full, and a second name
// for each write weighed more than the effect it saved. The value itself, not a getter called here:
// measured on a stub element, a getter cost 14 ns a row in an allocation and `untracked`, the value 0.

/**
 * The bindings of one block, run by one effect (#1275): what a binding given a group adds to it instead
 * of making its own effect, and `bindGroup` runs. A block's bindings each made an effect, and that was
 * the cost of a declarative template: `pdx-fieldset` written so made 13 at every mount and measured
 * 1.4× its TypeScript version; in one effect, 1.03×. A flat array, six slots a binding — its write, the
 * element, the attribute, the property, the getter, the value written last — so a binding allocates
 * nothing of its own. Opaque to the compiled module, which only creates it and passes it.
 */
export type BindGroup = unknown[];

/** A binding's slots in a group, from its first: see `BindGroup`. */
const SLOTS = 6;

/** A write of a grouped binding: the group, where the binding's slots start, and its new value. */
type GroupWrite = (g: BindGroup, at: number, value: unknown) => void;

/** The value no binding has written yet: an object no value is. */
const UNWRITTEN = {};

/** Add a binding to `g`: its write, its element, attribute and property, and its getter. */
function join(g: BindGroup, write: GroupWrite, el: Node, attr: string | null, prop: string | null, value: unknown): void {
    g.push(write, el, attr, prop, value, UNWRITTEN);
}

/**
 * Run the bindings of `g` in one effect: each getter read, and its write made when the value differs
 * from the one it wrote last. A signal one binding reads re-runs them all; the others read their value
 * again and write nothing. The writes are those of each binding alone, in the order they were added.
 *
 * `held`, one per binding in the order they were added: the value the static markup already holds for
 * it, which the compiler wrote there — the value with the props at their defaults (#1275). The first
 * run then writes only a binding whose value differs from it. Undefined, or a hole, is not known: that
 * binding is written at the first run.
 */
export function bindGroup(g: BindGroup, held?: readonly unknown[]): void {
    if (held) {
        for (let k = 0; k < held.length; k++) if (held[k] !== undefined) g[k * SLOTS + 5] = held[k];
    }
    effect(() => {
        for (let at = 0; at < g.length; at += SLOTS) {
            const next = (g[at + 4] as () => unknown)();
            if (Object.is(next, g[at + 5])) continue;
            g[at + 5] = next;
            (g[at] as GroupWrite)(g, at, next);
        }
    });
}

/** Write `value` as the attribute `attr`: null or false removes it, true is the empty attribute. */
function writeAttribute(el: Element, attr: string, value: unknown): void {
    if (value == null || value === false) el.removeAttribute(attr);
    else el.setAttribute(attr, value === true ? '' : String(value));
}

/** Write `value` to the property `prop`; null clears it by the property's type (`clearBoundProperty`). */
function writeProperty(el: Element, attr: string, prop: string, value: unknown): void {
    if (value == null) clearBoundProperty(el, attr, prop);
    else (el as unknown as Record<string, unknown>)[prop] = value;
}

/**
 * `:attr` that is an attribute — `aria-*`, `data-*`, a hyphenated name, `role` on SVG.
 * With `once`, `value` is the value itself, written once with no effect (#1270); with a group, the
 * binding is added to it (#1275).
 */
export function bindAttribute(el: Element, attr: string, value: () => unknown, group?: BindGroup): void;
export function bindAttribute(el: Element, attr: string, value: unknown, once: 1): void;
export function bindAttribute(el: Element, attr: string, value: unknown, mode?: 1 | BindGroup): void {
    if (mode === 1) { writeAttribute(el, attr, value); return; }
    if (mode) { join(mode, groupedAttribute, el, attr, null, value); return; }
    let written: unknown = UNWRITTEN;
    effect(() => {
        const next = (value as () => unknown)(); // a getter: no flag, by the overloads
        if (Object.is(next, written)) return;
        written = next;
        writeAttribute(el, attr, next);
    });
}
const groupedAttribute: GroupWrite = (g, at, v) => writeAttribute(g[at + 1] as Element, g[at + 2] as string, v);

/**
 * `:attr` that the element certainly has as a property (`disabled` on an <input>), bound as `attr`.
 * With `once`, `value` is the value itself, written once with no effect (#1270); with a group, the
 * binding is added to it (#1275).
 */
export function bindNativeProperty(el: Element, attr: string, prop: string, value: () => unknown, group?: BindGroup): void;
export function bindNativeProperty(el: Element, attr: string, prop: string, value: unknown, once: 1): void;
export function bindNativeProperty(el: Element, attr: string, prop: string, value: unknown, mode?: 1 | BindGroup): void {
    if (mode === 1) { writeProperty(el, attr, prop, value); return; }
    if (mode) { join(mode, groupedProperty, el, attr, prop, value); return; }
    let written: unknown = UNWRITTEN;
    effect(() => {
        const next = (value as () => unknown)(); // a getter: no flag, by the overloads
        if (Object.is(next, written)) return;
        written = next;
        writeProperty(el, attr, prop, next);
    });
}
const groupedProperty: GroupWrite = (g, at, v) => writeProperty(g[at + 1] as Element, g[at + 2] as string, g[at + 3] as string, v);

/**
 * `:attr` on an element that may or may not have the property: asked at each write, as core's
 * `bindProperty` asks (`prop in el`). A name the element does not have — `:itemprop`, `:for` on a
 * <div> — is its attribute; assigning it would set an expando nothing reads. With `once`, `value` is the
 * value itself, written once with no effect (#1270); with a group, the binding is added to it (#1275).
 */
export function bindAttributeOrProperty(el: Element, attr: string, prop: string, value: () => unknown, group?: BindGroup): void;
export function bindAttributeOrProperty(el: Element, attr: string, prop: string, value: unknown, once: 1): void;
export function bindAttributeOrProperty(el: Element, attr: string, prop: string, value: unknown, mode?: 1 | BindGroup): void {
    if (mode === 1) { writeAttributeOrProperty(el, attr, prop, value); return; }
    if (mode) { join(mode, groupedAttributeOrProperty, el, attr, prop, value); return; }
    let written: unknown = UNWRITTEN;
    effect(() => {
        const next = (value as () => unknown)(); // a getter: no flag, by the overloads
        if (Object.is(next, written)) return;
        written = next;
        writeAttributeOrProperty(el, attr, prop, next);
    });
}
const groupedAttributeOrProperty: GroupWrite = (g, at, v) => writeAttributeOrProperty(g[at + 1] as Element, g[at + 2] as string, g[at + 3] as string, v);

/** The property `prop` if the element has it, asked at each write; else the attribute `attr`. */
function writeAttributeOrProperty(el: Element, attr: string, prop: string, value: unknown): void {
    if (prop in el) writeProperty(el, attr, prop, value);
    else writeAttribute(el, attr, value);
}

/**
 * `:style="expr"` on a plain element, HTML or SVG (#1240): the string is written to `style.cssText`,
 * null or undefined as `''`. Assigning `el.style` relies on the browser forwarding it to `cssText`
 * ([PutForwards=cssText]), and throws where `style` is a bare getter — happy-dom, for SVG.
 * With `once`, `value` is the value itself, written once with no effect (#1270); with a group, the
 * binding is added to it (#1275).
 */
export function bindStyleText(el: Element, value: () => unknown, group?: BindGroup): void;
export function bindStyleText(el: Element, value: unknown, once: 1): void;
export function bindStyleText(el: Element, value: unknown, mode?: 1 | BindGroup): void {
    if (mode === 1) { writeStyleText(el, value); return; }
    if (mode) { join(mode, groupedStyleText, el, null, null, value); return; }
    let written: unknown = UNWRITTEN;
    effect(() => {
        const next = (value as () => unknown)(); // a getter: no flag, by the overloads
        if (Object.is(next, written)) return;
        written = next;
        writeStyleText(el, next);
    });
}
const groupedStyleText: GroupWrite = (g, at, v) => writeStyleText(g[at + 1] as Element, v);

/** `value` to `style.cssText`, null or undefined as `''`. */
function writeStyleText(el: Element, value: unknown): void {
    (el as HTMLElement).style.cssText = value == null ? '' : String(value);
}

/**
 * `:href`, `:src`, `:action`, `:formaction`, `:poster`, `:xlink:href` (#1346): the value goes through
 * `sanitizeBoundUrl` first, and a refused or null value removes the attribute, so a `javascript:` URL
 * never becomes a live link. Written out, each one was its own effect of about 120 bytes gzip.
 *
 * `prop` is the property the URL is written to: a component's prop (assigned before its upgrade, as
 * `assignBoundProperty` does) or a plain element's own property (`href` on an <a>). A plain element
 * that does not have it, and `null` for a name that is only an attribute (`xlink:href`, SVG), write
 * the attribute. With `once`, `value` is the value itself, written once with no effect (#1270); with a
 * group, the binding is added to it (#1275).
 */
export function bindUrl(el: Element, attr: string, prop: string | null, value: () => unknown, group?: BindGroup): void;
export function bindUrl(el: Element, attr: string, prop: string | null, value: unknown, once: 1): void;
export function bindUrl(el: Element, attr: string, prop: string | null, value: unknown, mode?: 1 | BindGroup): void {
    if (mode === 1) { writeUrl(el, attr, prop, value); return; }
    if (mode) { join(mode, groupedUrl, el, attr, prop, value); return; }
    let written: unknown = UNWRITTEN;
    effect(() => {
        const next = (value as () => unknown)(); // a getter: no flag, by the overloads
        if (Object.is(next, written)) return;
        written = next;
        writeUrl(el, attr, prop, next);
    });
}
const groupedUrl: GroupWrite = (g, at, v) => writeUrl(g[at + 1] as Element, g[at + 2] as string, g[at + 3] as string | null, v);

/** Write a URL as `bindUrl` describes; the same writes the compiled module spelled out before. */
function writeUrl(el: Element, attr: string, prop: string | null, value: unknown): void {
    if (prop !== null && (el.localName.includes('-') || prop in el)) {
        const safe = sanitizeBoundUrl(el, prop, value);
        if (safe == null) el.removeAttribute(prop);
        else assignBoundProperty(el, prop, safe);
        return;
    }
    if (value == null || value === false) { el.removeAttribute(attr); return; }
    const safe = sanitizeBoundUrl(el, attr, value);
    if (safe == null) el.removeAttribute(attr);
    else el.setAttribute(attr, safe);
}

/**
 * `:prop` on a component (#1346): its value assigned through `assignBoundProperty`, which works before
 * the component is upgraded. Written out, each one was its own effect. A URL prop is `bindUrl`'s. With
 * a group, the binding is added to it (#1275).
 */
export function bindComponentProp(el: Element, prop: string, value: () => unknown, group?: BindGroup): void {
    if (group) { join(group, groupedComponentProp, el, null, prop, value); return; }
    let written: unknown = UNWRITTEN;
    effect(() => {
        const next = value();
        if (Object.is(next, written)) return;
        written = next;
        assignBoundProperty(el, prop, next);
    });
}
const groupedComponentProp: GroupWrite = (g, at, v) => assignBoundProperty(g[at + 1] as Element, g[at + 3] as string, v);

/**
 * `{{ expr }}` the compiler knows is text — a string, number or boolean prop, a literal, a template
 * string (#1275) — added to a block's group: its text is put in place of `anchor`, the empty marker the
 * static markup holds there, and then written to that text node. As `bindInterpolation` renders a
 * primitive: null, undefined and false are the empty text, which replaces the marker too. An interpolation
 * that may render nodes keeps `bindInterpolation`, whose value is re-read only when what IT reads
 * changes: in a group, an unrelated change would build its nodes again.
 */
export function bindText(anchor: ChildNode, value: () => unknown, group: BindGroup): void {
    join(group, groupedText, anchor, null, null, value);
}
const groupedText: GroupWrite = (g, at, v) => {
    const node = g[at + 1] as ChildNode;
    const text = interpolationText(v);
    if (node.nodeType === 3) { (node as Text).data = text; return; }
    const t = (node.ownerDocument ?? document).createTextNode(text);
    node.replaceWith(t);
    g[at + 1] = t;
};
