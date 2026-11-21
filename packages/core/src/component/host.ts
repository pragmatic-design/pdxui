// The host's own attributes, bindings and listeners, declared (#133): `@host { … }` in a .pdx, `host`
// in the TypeScript descriptor. In a web component the host IS the element, so `role`,
// `aria-expanded` or a `keydown` listener belong on it, written once rather than reached through
// `ctx.el` in setup.
//
//   host: {
//     role: 'combobox',                            // static: set at connection, unless the page set it
//     ':aria-expanded': (ctx) => ctx.open(),       // bound: follows what it reads
//     '@keydown.enter': (ctx, e) => ctx.toggle(e), // a listener, with the template's modifiers
//   }

import { eventListenerFor } from '../renderer/template';

/** One entry of `host`: a static value, a bound one, or a listener. */
export type HostValue = string | ((ctx: never, event: Event) => unknown);

/** The `host` field of a descriptor, by attribute name: `role`, `:aria-expanded`, `@keydown.enter`. */
export type HostBindings = Record<string, HostValue>;

/**
 * Write a bound value as an attribute: `null`, `undefined` and `false` remove it, `true` writes it
 * empty, anything else as a string — the rules of a `:attr=` in the template.
 */
function writeAttribute(el: Element, name: string, value: unknown): void {
    if (value === null || value === undefined || value === false) el.removeAttribute(name);
    else el.setAttribute(name, value === true ? '' : String(value));
}

/** The classes a `:class` value names: `{ name: on }` by key (a key may hold several), a string by word. */
function classesOf(value: unknown): { on: string[]; off: string[] } {
    const on: string[] = [];
    const off: string[] = [];
    if (value !== null && typeof value === 'object') {
        for (const [key, cond] of Object.entries(value)) for (const t of key.split(/\s+/)) if (t) (cond ? on : off).push(t);
    } else if (value != null && value !== false) {
        for (const t of String(value).split(/\s+/)) if (t) on.push(t);
    }
    return { on, off };
}

/**
 * `:class` on the host, read as the template's (#1242): the object form toggles each class it names, a
 * string adds its classes. A class it named last time and names no more is removed; one it never
 * named — the author's `class="toolbar"` — stays. Writing the attribute replaced them all.
 */
function bindHostClass(el: HTMLElement, read: () => unknown, track: (fn: () => void) => unknown): void {
    let named: string[] = [];
    track(() => {
        const { on, off } = classesOf(read());
        for (const t of named) if (!on.includes(t) && !off.includes(t)) el.classList.remove(t);
        for (const t of off) el.classList.remove(t);
        for (const t of on) el.classList.add(t);
        named = on.concat(off);
    });
}

/** A `:style` object's key as its CSS property: `marginTop` is `margin-top`, a custom property as written. */
const cssProperty = (key: string): string => (key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

/**
 * `:style` on the host, read as the template's (#1242): the object form sets each property it names
 * (`String(value ?? '')`, so null clears it) and removes one it named last time and names no more,
 * keeping the author's inline style; a string is written to `style.cssText`, null as '' (#1240).
 */
function bindHostStyle(el: HTMLElement, read: () => unknown, track: (fn: () => void) => unknown): void {
    let named: string[] = [];
    track(() => {
        const value = read();
        if (value !== null && typeof value === 'object') {
            const now: string[] = [];
            for (const [key, v] of Object.entries(value)) {
                const name = cssProperty(key);
                now.push(name);
                el.style.setProperty(name, String(v ?? ''));
            }
            for (const name of named) if (!now.includes(name)) el.style.removeProperty(name);
            named = now;
        } else {
            named = [];
            el.style.cssText = value == null ? '' : String(value);
        }
    });
}

/**
 * Apply a descriptor's `host` to its element. Static attributes are set unless the element already
 * carries them — the page's `role` or `tabindex` wins. Bound ones are written in an effect, and a
 * listener is added in one, so both stop when the component disconnects.
 */
export function bindHost(
    el: HTMLElement,
    host: HostBindings,
    ctx: unknown,
    track: (fn: () => void | (() => void)) => unknown,
): void {
    for (const [key, value] of Object.entries(host)) {
        if (key.startsWith('@')) {
            const fn = value as (ctx: unknown, event: Event) => unknown;
            const { type, listener, options } = eventListenerFor(key.slice(1), (e) => { fn(ctx, e); });
            track(() => {
                el.addEventListener(type, listener, options);
                return () => el.removeEventListener(type, listener, options);
            });
        } else if (key.startsWith(':')) {
            const fn = value as (ctx: unknown) => unknown;
            const name = key.slice(1);
            if (name === 'class') bindHostClass(el, () => fn(ctx), track);
            else if (name === 'style') bindHostStyle(el, () => fn(ctx), track);
            else track(() => { writeAttribute(el, name, fn(ctx)); });
        } else if (!el.hasAttribute(key)) {
            el.setAttribute(key, String(value));
        }
    }
}
