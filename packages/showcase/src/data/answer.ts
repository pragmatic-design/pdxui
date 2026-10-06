// The answer to an action, in one place for every screen that writes.
//
// One function per rule, because the rule is the point: a screen that calls `reversible` cannot
// accidentally grow a fifth shape, and a reader can see which of the three a new action belongs to.
// Tickets, customers and the board share it, because a copy is where a fix does not arrive.
import { announce } from '@pdxui/core';
import type { ToastQueue } from '@pdxui/core';

/**
 * The part of `@pdxui/ui/toast`'s `toast` an answer uses. The page passes it in: it imports
 * `toast` anyway, and a `.ts` here cannot resolve the ui package's types without a build.
 */
export type ToastApi = Pick<ToastQueue, 'add' | 'dismiss'>;

export interface Answer {
    /** Rule 1 — reversible, and the record is out of sight. The undo travels with the message. */
    reversible(message: string, undoLabel: string, undo: () => void): void;
    /** Rule 2 — it happened where the reader is looking; only the announcement is added. */
    visible(message: string): void;
    /** Rule 3 — refused: a toast in view that stays until it is dismissed, one at a time. */
    refused(message: string): void;
    /** Take the standing refusal away: the next write does this before it starts. */
    clearRefusal(): void;
}

/** A screen's answers. Each screen has its own, so its refusal is the one it takes away. */
export function createAnswer(toast: ToastApi): Answer {
    let refusalId = '';
    function clearRefusal(): void {
        if (refusalId) toast.dismiss(refusalId);
        refusalId = '';
    }
    return {
        reversible(message, undoLabel, undo) {
            // `type`, not `variant`: the copies wrote `variant: 'info'`, which is not a variant — it
            // rendered as the default `filled`, and the type was `info` by default. Same toast.
            toast.add({ type: 'info', message, duration: 8000, action: { label: undoLabel, onClick: undo } });
            // NO announce() here, and it is measured rather than assumed: a toast already carries
            // role="status" + aria-live="polite" (pdx-toast.ts:129), so adding one would say it TWICE.
        },
        visible(message) {
            // A row appearing is not an event a screen reader notices.
            announce(message);
        },
        refused(message) {
            // A toast and not a paragraph under the grid, which is out of sight while the reader is
            // at the bulk bar. A refusal never goes on a timer: `duration: 0` is the queue's «persistent».
            clearRefusal();
            refusalId = toast.add({ type: 'error', message, duration: 0, dismissible: true });
        },
        clearRefusal,
    };
}
