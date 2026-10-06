// Focus trap — cycles Tab within a container, hides siblings from screen readers.
// Used by: Dialog, Drawer, BottomSheet, any modal overlay.

import type { Dispose } from '../utils/types';
import { getFocusableElements, focusFirst, focusLast } from './focus';

export interface FocusTrapOptions {
    /** Where to focus initially. Default: 'first'. */
    initialFocus?: HTMLElement | 'first' | 'last';
    /** Restore focus to previously focused element on deactivate. Default: true. */
    restoreFocus?: boolean;
    /** Allow Escape to deactivate the trap. Default: true. */
    escapeDeactivates?: boolean;
}

/**
 * Activate a focus trap on the given container.
 * - Tab/Shift+Tab cycles within the container.
 * - Siblings are hidden from screen readers via aria-hidden. With several traps active, only the
 *   most recent one is exposed.
 * - Returns a Dispose function to deactivate.
 */
export function focusTrap(container: HTMLElement, options?: FocusTrapOptions): Dispose {
    if (typeof document === 'undefined') return () => {};

    const restoreFocus = options?.restoreFocus ?? true;
    const escapeDeactivates = options?.escapeDeactivates ?? true;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Hide everything but this container from screen readers: it is now the top trap
    const entry: TrapEntry = { container };
    activeTraps.push(entry);
    exposeTopTrap();

    // Set initial focus
    const initialFocus = options?.initialFocus ?? 'first';
    if (initialFocus === 'first') {
        if (!focusFirst(container)) container.focus();
    } else if (initialFocus === 'last') {
        if (!focusLast(container)) container.focus();
    } else if (initialFocus instanceof HTMLElement) {
        initialFocus.focus();
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape' && escapeDeactivates) {
            // Don't prevent default — let overlay stack handle Escape
            return;
        }

        if (e.key !== 'Tab') return;

        const focusable = getFocusableElements(container)
            .filter(el => (el as HTMLElement).offsetParent !== null);

        if (focusable.length === 0) {
            e.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
            // Shift+Tab on first → go to last
            if (active === first || !container.contains(active)) {
                e.preventDefault();
                last.focus();
            }
        } else {
            // Tab on last → go to first
            if (active === last || !container.contains(active)) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    container.addEventListener('keydown', onKeyDown);

    return () => {
        container.removeEventListener('keydown', onKeyDown);
        const index = activeTraps.indexOf(entry);
        if (index !== -1) {
            activeTraps.splice(index, 1);
            exposeTopTrap();
        }
        if (restoreFocus && previouslyFocused && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
    };
}

// ─── aria-hidden siblings management ───────────────────────────

type TrapEntry = { container: HTMLElement };

/**
 * The active traps, oldest first. Only the last one is exposed to screen readers.
 *
 * The traps hide and restore together, not each on its own. Otherwise a second modal BESIDE the
 * first — a `dialog.confirm()` drawn by `<pdx-overlay-outlet>` while a `pdx-dialog` is open — sits
 * under an ancestor the first trap has hidden: on screen, focused, and invisible to a screen reader.
 * And a trap closing out of order restores what the other one still needs hidden.
 */
const activeTraps: TrapEntry[] = [];

/** The aria-hidden each element had before a trap touched it (null: no attribute). */
const originalAriaHidden = new Map<Element, string | null>();

/**
 * Put every element a trap touched back to its original aria-hidden, then hide everything beside the
 * top trap's container and its ancestors. Run on every activation and every dispose, so the result
 * depends only on which trap is on top, whatever the nesting and the order traps close in.
 */
function exposeTopTrap(): void {
    for (const [el, previousValue] of originalAriaHidden) {
        if (previousValue === null) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', previousValue);
    }
    originalAriaHidden.clear();

    const top = activeTraps[activeTraps.length - 1];
    if (top) hideSiblingsFromSR(top.container);
}

/** Hide all siblings of the container and of each of its ancestors (and their subtrees). */
function hideSiblingsFromSR(container: HTMLElement): void {
    // Walk up from container to body, hiding siblings at each level
    let current: HTMLElement | null = container;
    while (current && current !== document.body) {
        const parent: HTMLElement | null = current.parentElement;
        if (!parent) break;

        for (const sibling of Array.from(parent.children) as Element[]) {
            if (sibling === current) continue;
            if (sibling.tagName === 'SCRIPT' || sibling.tagName === 'STYLE') continue;

            const prev = sibling.getAttribute('aria-hidden');
            if (prev === 'true') continue; // already hidden by the page, don't track

            originalAriaHidden.set(sibling, prev);
            sibling.setAttribute('aria-hidden', 'true');
        }
        current = parent;
    }
}
