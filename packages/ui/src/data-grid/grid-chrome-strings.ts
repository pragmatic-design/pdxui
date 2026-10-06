// The names the grid's chrome carries, declared on the element instead of written into it once.
//
// The grid's toolbar is built once and only its chips are redrawn afterwards, so a name written
// with `setAttribute(…, t(key))` at build time would keep the language of that moment: a locale
// installed later — a dictionary that arrives as a chunk, a language switched at runtime — would
// leave «Reload» and «Table tools» in English under an otherwise translated page.
//
// `uiAttr` is the mechanism the rest of @pdxui/ui uses and it is deliberately not used here: this
// grid writes a name per ROW, and a virtualised list would push thousands of WeakRef entries into
// that registry on every scroll. The grid already has one effect that reads
// `componentStringsChanged()` and redraws its chrome; what it needs is the chrome saying which
// string each of its elements holds, so that redraw can re-read them.
//
// So the key lives ON the element, greppable in the DOM and in the source:
//
//     <button data-dg-i18n="toolbar.reload:label,title" …>
//
// and `applyChromeStrings(bar)` re-reads every one of them.

import { t } from './grid-i18n';

/** Where a string goes: the accessible name, the tooltip, or the element's text. */
export type ChromeTarget = 'label' | 'title' | 'text';

const ATTR = 'data-dg-i18n';

/**
 * Write the string now and record which key it came from, so `applyChromeStrings` can write it
 * again when the dictionary moves. `text` replaces the element's text content, so it goes on an
 * element that holds text and nothing else — a `<span>` beside an icon, never the button around it.
 */
export function i18nMark(el: Element, key: string, ...targets: ChromeTarget[]): void {
    el.setAttribute(ATTR, `${key}:${targets.join(',')}`);
    applyOne(el);
}

/** Re-read every marked name under `root`, root included. */
export function applyChromeStrings(root: Element): void {
    if (root.hasAttribute(ATTR)) applyOne(root);
    for (const el of root.querySelectorAll(`[${ATTR}]`)) applyOne(el);
}

function applyOne(el: Element): void {
    // Match: KEY:target[,target]  — the key cannot contain a colon, the targets are a fixed set.
    const [key, list] = (el.getAttribute(ATTR) ?? '').split(':');
    if (!key || !list) return;
    const value = t(key);
    for (const target of list.split(',')) {
        if (target === 'label') el.setAttribute('aria-label', value);
        else if (target === 'title') el.setAttribute('title', value);
        else if (target === 'text') el.textContent = value;
    }
}
