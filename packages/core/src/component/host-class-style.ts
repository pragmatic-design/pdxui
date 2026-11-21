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

/** Match: a run of whitespace — a key or a string that names several classes. */
const SPACES = /\s+/;

/**
 * `:class` on the host: the object form toggles each class it names, a string adds its classes. A class
 * it named last time and names no more is removed; one it never named — the author's `class="toolbar"`
 * — stays. Writing the attribute replaced them all, and wrote an object as `[object Object]`.
 *
 * It runs at every mount of every host that binds it: one toggle per key, and a split only for a key
 * that holds several classes (#1210, pdx-button-group).
 */
export function hostClass<C>(read: (ctx: C) => unknown): HostBinder {
    return {
        read: read as HostBinder['read'],
        bind(el, value, track) {
            let named: string[] = [];
            track(() => {
                const v = value();
                const now: string[] = [];
                if (v !== null && typeof v === 'object') {
                    for (const key in v) {
                        const on = !!(v as Record<string, unknown>)[key];
                        if (!SPACES.test(key)) { el.classList.toggle(key, on); now.push(key); continue; }
                        for (const t of key.split(SPACES)) if (t) { el.classList.toggle(t, on); now.push(t); }
                    }
                } else if (v != null && v !== false) {
                    for (const t of String(v).split(SPACES)) if (t) { el.classList.add(t); now.push(t); }
                }
                for (const t of named) if (!now.includes(t)) el.classList.remove(t);
                named = now;
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
