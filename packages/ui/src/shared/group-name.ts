// The accessible name of a choice group.
//
// pdx-checkbox-group, pdx-radio-group and pdx-segmented are named by `label`, or by the pdx-label put
// right before them; without either, a screen reader announces an unnamed group.

let _seq = 0;

/**
 * Names `target` (the element with the group role): `label` as aria-label; else, when `host`'s
 * previous element sibling is a <pdx-label>, aria-labelledby its inner <label> — not the pdx-label
 * host, whose description and hint would join the name. Never an empty aria-label. The caller skips
 * this when the author wrote an aria-label or aria-labelledby of their own.
 */
export function nameGroup(host: Element, target: Element, label: string): void {
    if (label) {
        target.setAttribute('aria-label', label);
        target.removeAttribute('aria-labelledby');
        return;
    }
    target.removeAttribute('aria-label');
    const prev = host.previousElementSibling;
    const labelEl = prev && prev.tagName === 'PDX-LABEL' ? prev.querySelector('label') : null;
    if (!labelEl) { target.removeAttribute('aria-labelledby'); return; }
    if (!labelEl.id) labelEl.id = `pdx-group-label-${++_seq}`;
    target.setAttribute('aria-labelledby', labelEl.id);
}

/** Whether the author named `el` themselves: then the group leaves its name alone. */
export function authoredName(el: Element): boolean {
    return el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
}
