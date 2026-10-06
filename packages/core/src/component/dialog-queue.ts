// Dialog Queue — signal-based programmatic dialog/confirm/alert queue.
// Pure queue primitive — no rendering. Consumed by <pdx-overlay-outlet> in UI.
// Pattern: identical to toast-queue.ts (factory + signal items).

import { signal, computed } from '../reactivity/signal';
import { overlayStack } from './overlay-stack';
import type { ReadonlySignal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────

export type DialogType = 'confirm' | 'alert' | 'dialog';

export interface DialogData {
    /** Unique ID (auto-generated if omitted). */
    id?: string;
    /** Dialog type determines UI layout. */
    type: DialogType;
    /** Dialog title. */
    title: string;
    /** Body message text. */
    message?: string;
    // confirm-specific
    /** Confirm button label. Default: 'Confirm'. */
    confirmLabel?: string;
    /** Cancel button label. Default: 'Cancel'. */
    cancelLabel?: string;
    /** Visual variant for confirm. Default: 'default'. */
    variant?: 'default' | 'danger';
    /** Type-to-confirm: user must type this text to enable confirm. */
    confirmText?: string;
    /** Timer-gated confirm: seconds before confirm button is enabled. */
    confirmDelay?: number;
    // dialog-specific
    /** Panel size. Default: 'sm'. */
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface DialogInstance extends DialogData {
    id: string;
    zIndex: number;
    resolve: (value: unknown) => void;
    createdAt: number;
}

export interface DialogQueue {
    /** All active dialogs (reactive, newest last). */
    items: ReadonlySignal<DialogInstance[]>;
    /** Number of active dialogs (reactive). */
    count: ReadonlySignal<number>;
    /** Push a dialog onto the queue. Returns Promise resolved on close. */
    push(data: DialogData): Promise<unknown>;
    /** Close a dialog by ID with an optional result value. */
    close(id: string, result?: unknown): void;
    /** Close all dialogs. */
    closeAll(): void;
}

// ─── Implementation ───────────────────────────────────────────

let _nextId = 1;

/**
 * A stack of dialogs where opening one returns a promise that resolves with its result.
 *
 * That is the useful part: `const ok = await queue.push({ ... })` reads like the question it asks,
 * instead of a callback plus a signal plus a cleanup. Dialogs stack, and each takes a z-index from
 * the shared overlay stack so a confirm opened from a dialog lands ABOVE it rather than behind.
 *
 * Closing resolves; dismissing resolves too, with the dismissal value — an unresolved promise on
 * Escape is a leaked await.
 */
export function createDialogQueue(): DialogQueue {
    const _items = signal<DialogInstance[]>([]);
    const _count = computed(() => _items().length);

    function push(data: DialogData): Promise<unknown> {
        return new Promise((resolve) => {
            const id = data.id ?? `pdx-dlg-${_nextId++}`;
            const zIndex = overlayStack.push(id, { modal: true });
            const instance: DialogInstance = {
                ...data,
                id,
                zIndex,
                resolve,
                createdAt: Date.now(),
            };
            _items.set(prev => [...prev, instance]);
        });
    }

    function close(id: string, result?: unknown): void {
        const current = _items.peek();
        const item = current.find(d => d.id === id);
        if (!item) return;
        item.resolve(result);
        overlayStack.pop(id);
        _items.set(current.filter(d => d.id !== id));
    }

    function closeAll(): void {
        for (const item of _items.peek()) {
            item.resolve(undefined);
            overlayStack.pop(item.id);
        }
        _items.set([]);
    }

    return {
        items: _items as ReadonlySignal<DialogInstance[]>,
        count: _count,
        push,
        close,
        closeAll,
    };
}

let _globalQueue: DialogQueue | null = null;

/**
 * The page's one dialog queue: the one `<pdx-overlay-outlet>` draws, `dialog.confirm()` pushes to,
 * and a form's leave guard asks through. It lives here, not in @pdxui/ui, because core has to
 * ask a question too and cannot import the package that draws it.
 */
export function getDialogQueue(): DialogQueue {
    if (!_globalQueue) _globalQueue = createDialogQueue();
    return _globalQueue;
}
