// Off-screen instructions, for an interaction a screen reader cannot guess.
//
// A keyboard drag or reorder has no affordance: nothing on the page says that Space lifts and the
// arrows move. `aria-describedby` pointing at a hidden sentence is how that is told, and this is
// the element it points at.
//
// Shared, and keyed by id rather than hard-coded to ONE: `useSortable` needs its own sentence — it moves by item and drops into a position, which is not what a free
// drag does — and two callers sharing one element would each overwrite the other's text, leaving
// whichever ran last describing both.
//
// One element per id, reused: N draggables pointing at N identical copies helps nobody.

/** Visually hidden, still read. The same recipe `a11y/announcer.ts` uses for its live region. */
const HIDDEN: Partial<CSSStyleDeclaration> = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
};

/**
 * Make sure an off-screen element with this id holds this text, and return the id so the caller
 * can put it in an `aria-describedby`.
 *
 * Returns the id even when there is no document, so a caller in a non-browser environment builds
 * the same attribute it would in a browser rather than branching.
 */
export function offscreenInstructions(id: string, text: string): string {
    if (typeof document === 'undefined') return id;
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('div');
        el.id = id;
        Object.assign(el.style, HIDDEN);
        document.body.appendChild(el);
    }
    el.textContent = text;
    return id;
}

/**
 * Add an id to an element's `aria-describedby` without losing what was already there.
 *
 * Appending and not assigning: an element the caller already described keeps its description, and
 * ours is added to it. Idempotent, because the effect that writes it re-runs.
 */
export function describedBy(el: HTMLElement, id: string): void {
    const existing = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    if (existing.includes(id)) return;
    el.setAttribute('aria-describedby', [...existing, id].join(' '));
}
