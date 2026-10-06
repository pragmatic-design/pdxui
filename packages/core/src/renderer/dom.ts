// Low-level DOM helpers — thin wrappers for testability and future optimization.
// SSR-safe: guard all global DOM access.

import { onSwipe, onLongpress, onPinch } from '../component/gestures';
import { sanitizeBoundUrl } from '../security/sanitize-url';
import { DEV } from '../utils/env';

const isBrowser = typeof document !== 'undefined';

// Attributes whose value becomes a navigable/fetchable URL — sanitize runtime-controlled values.
// `data` is excluded: it is an overloaded property/attr name (grids/charts/lists bind arrays via
// :data) and is only a URL on the native <object>; sanitizing it stringifies bound data.
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster']);

/** Set a property or attribute on an element. Handles special cases (events, boolean attrs, style, class). */
export function setProp(el: Element, key: string, value: unknown): void {
    if (key.startsWith('@')) {
        const event = key.slice(1);

        // Gesture: @__swipe → ['direction', callback]
        if (event === '__swipe' && Array.isArray(value)) {
            onSwipe(el as HTMLElement, value[0], value[1]);
            return;
        }
        // Gesture: @__longpress → callback
        if (event === '__longpress' && typeof value === 'function') {
            onLongpress(el as HTMLElement, value as (e: PointerEvent) => void);
            return;
        }
        // Gesture: @__pinch → callback
        if (event === '__pinch' && typeof value === 'function') {
            onPinch(el as HTMLElement, value as (e: { scale: number; center: { x: number; y: number } }) => void);
            return;
        }

        // Standard event: @click → addEventListener('click', handler)
        el.addEventListener(event, value as EventListener);
        return;
    }

    if (key === 'style' && typeof value === 'object' && value !== null) {
        Object.assign((el as HTMLElement).style, value);
        return;
    }

    if (key === 'class' && typeof value === 'string') {
        // The attribute, not `className`: on an SVG element that is a read-only SVGAnimatedString,
        // and assigning it throws in a browser.
        el.setAttribute('class', value);
        return;
    }

    // Boolean attributes
    if (typeof value === 'boolean') {
        if (value) {
            el.setAttribute(key, '');
        } else {
            el.removeAttribute(key);
        }
        return;
    }

    // Inline event-handler attributes (`onclick`, `onmouseover`, …) are never a legitimate
    // binding target — the framework's event syntax is `@event`. Setting one from a bound
    // value would create a live handler from data, so block it (defense in depth).
    if (/^on/i.test(key)) {
        el.removeAttribute(key);
        if (DEV) console.warn(`[pdx] refused to set inline event attribute "${key}" — use @${key.slice(2)} instead.`);
        return;
    }

    if (value == null || value === false) {
        el.removeAttribute(key);
    } else if (URL_ATTRS.has(key.toLowerCase())) {
        const safe = sanitizeBoundUrl(el, key, value);
        if (safe == null) el.removeAttribute(key);
        else el.setAttribute(key, safe);
    } else {
        el.setAttribute(key, String(value));
    }
}

/** Insert a node before a marker, or append to parent. */
export function insert(parent: Node, node: Node, before?: Node | null): void {
    if (before) {
        parent.insertBefore(node, before);
    } else {
        parent.appendChild(node);
    }
}

/** Remove a node from its parent. */
export function remove(node: Node): void {
    node.parentNode?.removeChild(node);
}

/** Create a text node. SSR returns null-safe stub. */
export function text(value: string): Text {
    if (!isBrowser) return { data: value } as unknown as Text;
    return document.createTextNode(value);
}

/** Create a comment marker for conditional/list boundaries. */
export function marker(label?: string): Comment {
    if (!isBrowser) return { data: label ?? '' } as unknown as Comment;
    return document.createComment(label ?? '');
}

// ─── Static HTML Pre-compilation ──────────────────────────────────

const staticTplCache = new Map<string, HTMLTemplateElement>();

/** Pre-compile static HTML into a cached template. Faster than html`` for fully static content.
 *  Used by the compiler in production mode for components with no reactive bindings. */
export function __staticHTML(content: string): DocumentFragment {
    if (!isBrowser) return new DocumentFragment();
    let tpl = staticTplCache.get(content);
    if (!tpl) {
        tpl = document.createElement('template');
        tpl.innerHTML = content;
        staticTplCache.set(content, tpl);
    }
    return tpl.content.cloneNode(true) as DocumentFragment;
}
