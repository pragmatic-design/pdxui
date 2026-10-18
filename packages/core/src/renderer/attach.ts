// Attachments (#143): behaviour attached to an element, with its cleanup.
//
// `<input attach:autofocus attach:tooltip="'Search'">` compiles to `attach(el, autofocus)` and
// `attach(el, tooltip, () => 'Search')`. The attachment is a plain function of the element and a
// getter for its value; it may return a cleanup. It runs inside an effect owned by the scope that
// rendered the element, so the cleanup runs when the value changes — before the attachment runs
// again — and when the element's scope is disposed: an `@if` that removes it, a `@for` row that goes,
// the component itself. No ref, no onMount, no onDestroy by hand.
//
// The effect tracks the value only. What the attachment reads inside is untracked: a tooltip that
// reads a theme signal does not tear itself down and rebuild on every theme change.

import { effect, untracked } from '../reactivity/signal';
import { focusTrap } from '../a11y/focus-trap';
import { getFocusableElements } from '../a11y/focus';

/** An attachment: a function of the element and a getter for its value, returning an optional cleanup. */
export type Attachment<V = unknown> = (el: Element, value: () => V) => void | (() => void);

const noValue = (): undefined => undefined;

/**
 * Run `fn(el, value)` as an attachment of `el`: now, again when `value()` changes (its previous
 * cleanup first), and its cleanup once more when the scope that called `attach` is disposed.
 */
export function attach<V>(el: Element, fn: Attachment<V>, value?: () => V): void {
    const read = (value ?? noValue) as () => V;
    effect(() => {
        read();
        const cleanup = untracked(() => fn(el, read));
        return typeof cleanup === 'function' ? cleanup : undefined;
    });
}

/** The element to focus for `el`: itself when it takes focus, otherwise the first focusable inside it (a component's host). */
function focusTarget(el: Element): HTMLElement | null {
    const html = el as HTMLElement;
    if (html.matches?.('input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]')) return html;
    return getFocusableElements(html)[0] ?? null;
}

/**
 * `attach:autofocus` — focus the element once it is in the document. On a component it focuses the
 * first focusable element inside the host. Unlike the `autofocus` attribute, it works for an element
 * a block renders after the page loaded.
 */
export const autofocus: Attachment = (el) => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) focusTarget(el)?.focus(); });
    return () => { cancelled = true; };
};

/**
 * `attach:trapFocus` — keep Tab inside the element and hide what is beside it from screen readers
 * (core's `focusTrap`), from the moment it is in the document until its scope is disposed, which
 * gives focus back to where it was.
 */
export const trapFocus: Attachment = (el) => {
    let release: (() => void) | null = null;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) release = focusTrap(el as HTMLElement); });
    return () => { cancelled = true; release?.(); };
};

/**
 * `attach:clickOutside="close"` — call the handler for a press (`pointerdown`) anywhere outside the
 * element, with the event. Inside it, nothing happens.
 */
export const clickOutside: Attachment<((event: Event) => void) | undefined> = (el, value) => {
    const onPress = (event: Event): void => {
        const target = event.target as Node | null;
        if (target && el.contains(target)) return;
        value()?.(event);
    };
    document.addEventListener('pointerdown', onPress, true);
    return () => document.removeEventListener('pointerdown', onPress, true);
};
