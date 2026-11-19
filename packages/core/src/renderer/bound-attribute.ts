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

/** `:attr` that is an attribute — `aria-*`, `data-*`, a hyphenated name, `role` on SVG. */
export function bindAttribute(el: Element, attr: string, value: () => unknown): void {
    let written: unknown = {};
    effect(() => {
        const next = value();
        if (Object.is(next, written)) return;
        written = next;
        writeAttribute(el, attr, next);
    });
}

/** `:attr` that the element certainly has as a property (`disabled` on an <input>), bound as `attr`. */
export function bindNativeProperty(el: Element, attr: string, prop: string, value: () => unknown): void {
    let written: unknown = {};
    effect(() => {
        const next = value();
        if (Object.is(next, written)) return;
        written = next;
        writeProperty(el, attr, prop, next);
    });
}

/**
 * `:attr` on an element that may or may not have the property: asked at each write, as core's
 * `bindProperty` asks (`prop in el`). A name the element does not have — `:itemprop`, `:for` on a
 * <div> — is its attribute; assigning it would set an expando nothing reads.
 */
export function bindAttributeOrProperty(el: Element, attr: string, prop: string, value: () => unknown): void {
    let written: unknown = {};
    effect(() => {
        const next = value();
        if (Object.is(next, written)) return;
        written = next;
        if (prop in el) writeProperty(el, attr, prop, next);
        else writeAttribute(el, attr, next);
    });
}
