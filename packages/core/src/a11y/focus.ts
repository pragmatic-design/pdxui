// Focus management utilities — first-focus, restore, trap.

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Focus the first focusable element inside a container.
 * Returns the focused element, or null if none found.
 */
export function focusFirst(container: HTMLElement): HTMLElement | null {
    const el = container.querySelector<HTMLElement>(FOCUSABLE);
    if (el) { el.focus(); return el; }
    return null;
}

/**
 * Focus the last focusable element inside a container.
 */
export function focusLast(container: HTMLElement): HTMLElement | null {
    const all = container.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (all.length > 0) { all[all.length - 1].focus(); return all[all.length - 1]; }
    return null;
}

/**
 * Save and restore focus — useful for modals/drawers.
 *
 * Usage:
 *   const restore = saveFocus();
 *   openModal();
 *   // ... later
 *   closeModal();
 *   restore(); // returns focus to original element
 */
export function saveFocus(): () => void {
    const previous = document.activeElement as HTMLElement | null;
    return () => { if (previous && typeof previous.focus === 'function') previous.focus(); };
}

/**
 * Get all focusable elements inside a container.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}
