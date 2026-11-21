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
import { clearBoundProperty } from './template';

// `once` (#1270): a value that cannot change — a literal, a `@for` row's key, an instance constant —
// or a `:name.once` is written by the same write with no effect, and then the value argument IS the
// value, not a getter: the compiler passes it as it reads it (a `.once` through `untracked`). A flag on
// the same call, not a function of its own: a module imports core's names in full, and a second name
// for each write weighed more than the effect it saved. The value itself, not a getter called here:
// measured on a stub element, a getter cost 14 ns a row in an allocation and `untracked`, the value 0.

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
 * With `once`, `value` is the value itself, written once with no effect (#1270).
 */
export function bindAttribute(el: Element, attr: string, value: () => unknown): void;
export function bindAttribute(el: Element, attr: string, value: unknown, once: 1): void;
export function bindAttribute(el: Element, attr: string, value: unknown, once?: 1): void {
    if (once) { writeAttribute(el, attr, value); return; }
    let written: unknown = {};
    effect(() => {
        const next = (value as () => unknown)(); // a getter: no flag, by the overloads
        if (Object.is(next, written)) return;
        written = next;
        writeAttribute(el, attr, next);
    });
}

/**
 * `:attr` that the element certainly has as a property (`disabled` on an <input>), bound as `attr`.
 * With `once`, `value` is the value itself, written once with no effect (#1270).
 */
export function bindNativeProperty(el: Element, attr: string, prop: string, value: () => unknown): void;
export function bindNativeProperty(el: Element, attr: string, prop: string, value: unknown, once: 1): void;
export function bindNativeProperty(el: Element, attr: string, prop: string, value: unknown, once?: 1): void {
    if (once) { writeProperty(el, attr, prop, value); return; }
    let written: unknown = {};
    effect(() => {
        const next = (value as () => unknown)(); // a getter: no flag, by the overloads
        if (Object.is(next, written)) return;
        written = next;
        writeProperty(el, attr, prop, next);
    });
}

/**
 * `:attr` on an element that may or may not have the property: asked at each write, as core's
 * `bindProperty` asks (`prop in el`). A name the element does not have — `:itemprop`, `:for` on a
 * <div> — is its attribute; assigning it would set an expando nothing reads. With `once`, `value` is the value itself, written once with no effect (#1270).
 */
export function bindAttributeOrProperty(el: Element, attr: string, prop: string, value: () => unknown): void;
export function bindAttributeOrProperty(el: Element, attr: string, prop: string, value: unknown, once: 1): void;
export function bindAttributeOrProperty(el: Element, attr: string, prop: string, value: unknown, once?: 1): void {
    if (once) { writeAttributeOrProperty(el, attr, prop, value); return; }
    let written: unknown = {};
    effect(() => {
        const next = (value as () => unknown)(); // a getter: no flag, by the overloads
        if (Object.is(next, written)) return;
        written = next;
        writeAttributeOrProperty(el, attr, prop, next);
    });
}

/** The property `prop` if the element has it, asked at each write; else the attribute `attr`. */
function writeAttributeOrProperty(el: Element, attr: string, prop: string, value: unknown): void {
    if (prop in el) writeProperty(el, attr, prop, value);
    else writeAttribute(el, attr, value);
}

/**
 * `:style="expr"` on a plain element, HTML or SVG (#1240): the string is written to `style.cssText`,
 * null or undefined as `''`. Assigning `el.style` relies on the browser forwarding it to `cssText`
 * ([PutForwards=cssText]), and throws where `style` is a bare getter — happy-dom, for SVG.
 * With `once`, `value` is the value itself, written once with no effect (#1270).
 */
export function bindStyleText(el: Element, value: () => unknown): void;
export function bindStyleText(el: Element, value: unknown, once: 1): void;
export function bindStyleText(el: Element, value: unknown, once?: 1): void {
    if (once) { writeStyleText(el, value); return; }
    let written: unknown = {};
    effect(() => {
        const next = (value as () => unknown)(); // a getter: no flag, by the overloads
        if (Object.is(next, written)) return;
        written = next;
        writeStyleText(el, next);
    });
}

/** `value` to `style.cssText`, null or undefined as `''`. */
function writeStyleText(el: Element, value: unknown): void {
    (el as HTMLElement).style.cssText = value == null ? '' : String(value);
}
