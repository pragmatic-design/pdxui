// The host's own attributes, bindings and listeners, declared (#133): `@host { … }` in a .pdx, `host`
// in the TypeScript descriptor. In a web component the host IS the element, so `role`,
// `aria-expanded` or a `keydown` listener belong on it, written once rather than reached through
// `ctx.el` in setup.
//
//   host: {
//     role: 'combobox',                            // static: set at connection, unless the page set it
//     ':aria-expanded': (ctx) => ctx.open(),       // bound: follows what it reads
//     '@keydown.enter': (ctx, e) => ctx.toggle(e), // a listener, with the template's modifiers
//     ':class': hostClass((ctx) => ({ on: ctx.on() })), // :class and :style, as the template's (#1242)
//   }

import { eventListenerFor } from '../renderer/template';
import { DEV } from '../utils/env';

/**
 * A bound entry that writes its value its own way, not as an attribute: `hostClass` and `hostStyle`
 * (host-class-style.ts, #1242). `bind` is given the host, its value read with the render's context, and
 * the host's `track`.
 */
export interface HostBinder {
    readonly read: (ctx: never) => unknown;
    readonly bind: (el: HTMLElement, value: () => unknown, track: (fn: () => void) => unknown) => void;
}

/** One entry of `host`: a static value, a bound one, a binder, or a listener. */
export type HostValue = string | ((ctx: never, event: Event) => unknown) | HostBinder;

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
            const name = key.slice(1);
            if (typeof value === 'object') {
                const read = value.read as (ctx: unknown) => unknown;
                value.bind(el, () => read(ctx), track);
                continue;
            }
            // Written as an attribute, `:class` would replace the author's classes and `:style` their
            // inline style: those two take hostClass() and hostStyle(), as a compiled @host does.
            if (DEV && (name === 'class' || name === 'style')) {
                console.warn(`[pdx] host '${key}' is a plain function, written as the attribute over what the page set. Wrap it in host${name === 'class' ? 'Class' : 'Style'}(…) from @pdxui/core, as a compiled @host does.`);
            }
            const fn = value as (ctx: unknown) => unknown;
            track(() => { writeAttribute(el, name, fn(ctx)); });
        } else if (!el.hasAttribute(key)) {
            el.setAttribute(key, String(value));
        }
    }
}
