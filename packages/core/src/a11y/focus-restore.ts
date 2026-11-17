// Focus restore — save focus, and give it back to the saved element, or, if that element has left the
// DOM, to the nearest focusable place where it was.
// Used by: Dialog close, Drawer close, any overlay dismiss.

import type { Dispose } from '../utils/types';
import { focusFirst, FOCUSABLE } from './focus';

export interface FocusRestoreReturn {
    /** Save the currently focused element. */
    save(): void;
    /** Restore focus to the saved element (or nearest focusable ancestor). */
    restore(): void;
    /** Forget the saved element. */
    dispose: Dispose;
}

/** An element that can take focus when asked: tabbable, or given `tabindex="-1"` to be a focus target. */
function takesFocus(el: HTMLElement): boolean {
    return el.hasAttribute('tabindex') || el.matches(FOCUSABLE);
}

/**
 * Create a save/restore focus pair with automatic fallback.
 * If the saved element is removed from the DOM before restore(), focus moves to the nearest ancestor
 * still in the document: the ancestor itself if it takes focus, else the first focusable inside it,
 * else on up (#1159). The case it exists for: a dialog opened from a row's menu button, whose own
 * action deletes the row — focus goes to the list, not to <body>.
 */
export function focusRestore(): FocusRestoreReturn {
    if (typeof document === 'undefined') {
        return { save: () => {}, restore: () => {}, dispose: () => {} };
    }

    let savedElement: HTMLElement | null = null;
    // The saved element's ancestors at save time, nearest first. Once the element's subtree is removed,
    // its parent chain stops at the removed root, so the chain is recorded while it still reaches the
    // document.
    let ancestors: HTMLElement[] = [];

    function save(): void {
        const active = document.activeElement as HTMLElement | null;
        savedElement = active && active !== document.body ? active : null;
        ancestors = [];
        for (let p = savedElement?.parentElement ?? null; p && p !== document.body; p = p.parentElement) ancestors.push(p);
    }

    function restore(): void {
        const saved = savedElement;
        const chain = ancestors;
        savedElement = null;
        ancestors = [];
        if (!saved) return;
        if (saved.isConnected) {
            if (typeof saved.focus === 'function') saved.focus();
            return;
        }
        for (const ancestor of chain) {
            if (!ancestor.isConnected) continue;
            if (takesFocus(ancestor)) { ancestor.focus(); return; }
            if (focusFirst(ancestor)) return;
        }
    }

    function dispose(): void {
        savedElement = null;
        ancestors = [];
    }

    return { save, restore, dispose };
}
