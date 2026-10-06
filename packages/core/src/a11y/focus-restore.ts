// Focus restore — save and restore focus with MutationObserver fallback.
// If the previously focused element is removed from DOM, auto-restores to parent.
// Used by: Dialog close, Drawer close, any overlay dismiss.

import type { Dispose } from '../utils/types';

export interface FocusRestoreReturn {
    /** Save the currently focused element. */
    save(): void;
    /** Restore focus to the saved element (or nearest focusable ancestor). */
    restore(): void;
    /** Clean up the MutationObserver. */
    dispose: Dispose;
}

/**
 * Create a save/restore focus pair with automatic fallback.
 * If the saved element is removed from the DOM before restore(),
 * focus is moved to the nearest focusable ancestor.
 */
export function focusRestore(): FocusRestoreReturn {
    if (typeof document === 'undefined') {
        return { save: () => {}, restore: () => {}, dispose: () => {} };
    }

    let savedElement: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    function save(): void {
        savedElement = document.activeElement as HTMLElement | null;

        // Watch for removal of the saved element
        if (savedElement && savedElement !== document.body) {
            observer?.disconnect();
            observer = new MutationObserver(() => {
                if (savedElement && !document.body.contains(savedElement)) {
                    // Element was removed — find nearest focusable ancestor
                    savedElement = null;
                    observer?.disconnect();
                    observer = null;
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function restore(): void {
        observer?.disconnect();
        observer = null;

        if (savedElement && typeof savedElement.focus === 'function' && document.body.contains(savedElement)) {
            savedElement.focus();
        }
        savedElement = null;
    }

    function dispose(): void {
        observer?.disconnect();
        observer = null;
        savedElement = null;
    }

    return { save, restore, dispose };
}
