// `:class` and `:style` on the host, read as the template reads them (#1242): `hostClass(read)` and
// `hostStyle(read)`, the binders a host entry holds where a plain bound attribute holds a function.
//
//   host: {
//     ':class': hostClass((ctx) => ({ 'is-vertical': ctx.vertical() })),
//     ':style': hostStyle((ctx) => ({ width: ctx.width() })),
//   }
//
// Here and not in `bindHost`: a component whose host binds neither does not carry this code, and the
// compiler imports these only for a `@host` that writes `:class` or `:style` (bundle only what is used).

import type { HostBinder } from './host';

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
 * `:class` on the host: the object form toggles each class it names, a string adds its classes. A class
 * it named last time and names no more is removed; one it never named — the author's `class="toolbar"`
 * — stays. Writing the attribute replaced them all, and wrote an object as `[object Object]`.
 */
export function hostClass<C>(read: (ctx: C) => unknown): HostBinder {
    return {
        read: read as HostBinder['read'],
        bind(el, value, track) {
            let named: string[] = [];
            track(() => {
                const { on, off } = classesOf(value());
                for (const t of named) if (!on.includes(t) && !off.includes(t)) el.classList.remove(t);
                for (const t of off) el.classList.remove(t);
                for (const t of on) el.classList.add(t);
                named = on.concat(off);
            });
        },
    };
}

/** A `:style` object's key as its CSS property: `marginTop` is `margin-top`, a custom property as written. */
const cssProperty = (key: string): string => (key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

/**
 * `:style` on the host: the object form sets each property it names (`String(value ?? '')`, so null
 * clears it) and removes one it named last time and names no more, keeping the author's inline style;
 * a string is written to `style.cssText`, null as '' (#1240).
 */
export function hostStyle<C>(read: (ctx: C) => unknown): HostBinder {
    return {
        read: read as HostBinder['read'],
        bind(el, value, track) {
            let named: string[] = [];
            track(() => {
                const v = value();
                if (v !== null && typeof v === 'object') {
                    const now: string[] = [];
                    for (const [key, item] of Object.entries(v)) {
                        const name = cssProperty(key);
                        now.push(name);
                        el.style.setProperty(name, String(item ?? ''));
                    }
                    for (const name of named) if (!now.includes(name)) el.style.removeProperty(name);
                    named = now;
                } else {
                    named = [];
                    el.style.cssText = v == null ? '' : String(v);
                }
            });
        },
    };
}
