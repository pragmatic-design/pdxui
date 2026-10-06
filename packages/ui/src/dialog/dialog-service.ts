// Dialog Service — programmatic API for confirm/alert/dialog.
// Pattern: identical to toast facade in pdx-toast.ts (lazy singleton + wrapper).
// Usage: import { dialog } from '@pdxui/ui/dialog';

import { getDialogQueue } from '@pdxui/core';

// The queue itself lives in core, so a form's leave guard and this service push to the one queue
// the outlet draws. Re-exported: it is public here as well.
export { getDialogQueue };

/** Programmatic dialog API. */
export const dialog = {
    /** Confirm dialog. Returns true (confirm) or false (cancel/Escape). */
    confirm(props: {
        title: string;
        message?: string;
        confirmLabel?: string;
        cancelLabel?: string;
        variant?: 'default' | 'danger';
        confirmText?: string;
        confirmDelay?: number;
    }): Promise<boolean> {
        return getDialogQueue().push({ type: 'confirm', ...props }) as Promise<boolean>;
    },

    /** Alert dialog (single OK button). Resolves when dismissed. */
    alert(props: { title: string; message?: string }): Promise<void> {
        return getDialogQueue().push({ type: 'alert', ...props }) as Promise<void>;
    },

    /** Generic dialog with message. Resolves when closed. */
    open(props: { title: string; message?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }): Promise<void> {
        return getDialogQueue().push({ type: 'dialog', ...props }) as Promise<void>;
    },

    /** Close all programmatic dialogs. */
    closeAll(): void {
        getDialogQueue().closeAll();
    },
};
