// The element that carries a floating element's relation: the control that takes focus.
//
// pdx-popover and pdx-tooltip anchor to the element before them, often a <pdx-button>. Written on
// that host, which has no role, aria-expanded / aria-describedby would leave the inner <button> a
// screen reader lands on carrying nothing: "Click me, button", never "expanded". Focus returned to
// the host would go nowhere too, since it takes none.

const FOCUSABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * `anchor` itself when it is a plain element, or focusable on its own; for a custom element (a tag
 * with a dash) whose control is inside it — pdx-button, pdx-input — that inner control.
 */
export function anchorControl(anchor: HTMLElement): HTMLElement {
    if (!anchor.tagName.includes('-') || anchor.hasAttribute('tabindex')) return anchor;
    return anchor.querySelector<HTMLElement>(FOCUSABLE) ?? anchor;
}
