// Clipboard API — signal-based copy/paste/cut with state tracking.
// Used by: DataGrid, RichText, CodeEditor, Form, Tree.

import { signal } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

const isBrowser = typeof navigator !== 'undefined' && !!navigator.clipboard;

// ─── Types ─────────────────────────────────────────────────────

export interface ClipboardOptions {
    /** Called after a successful copy. */
    onCopy?: (text: string) => void;
    /** Called after a successful paste. */
    onPaste?: (text: string) => void;
    /** Called on error. */
    onError?: (error: Error) => void;
}

export interface ClipboardReturn {
    /** Last copied text (reactive). */
    copiedText: ReadonlySignal<string>;
    /** Whether a clipboard operation is in progress (reactive). */
    isPending: ReadonlySignal<boolean>;
    /** Copy text to clipboard. */
    copy(text: string): Promise<void>;
    /** Read text from clipboard. Requires focus + permission. */
    paste(): Promise<string>;
    /** Copy text and clear the source (cut pattern). */
    cut(text: string, onClear: () => void): Promise<void>;
    /** Whether the Clipboard API is available. */
    isSupported: boolean;
}

// ─── useClipboard ─────────────────────────────────────────────

/**
 * Copy, cut and paste through the async Clipboard API, with a `copied` signal for the "Copied!"
 * feedback.
 *
 * Check `isSupported` before offering the affordance: the API needs a secure context, and `paste()`
 * additionally needs focus and the user's permission — a paste button that silently does nothing on
 * http:// is worse than no button.
 */
export function useClipboard(options?: ClipboardOptions): ClipboardReturn {
    const _copiedText = signal('');
    const _isPending = signal(false);

    async function copy(text: string): Promise<void> {
        if (!isBrowser) return;
        _isPending.set(true);
        try {
            await navigator.clipboard.writeText(text);
            _copiedText.set(text);
            options?.onCopy?.(text);
        } catch (e) {
            options?.onError?.(e instanceof Error ? e : new Error(String(e)));
        } finally {
            _isPending.set(false);
        }
    }

    async function paste(): Promise<string> {
        if (!isBrowser) return '';
        _isPending.set(true);
        try {
            const text = await navigator.clipboard.readText();
            options?.onPaste?.(text);
            return text;
        } catch (e) {
            options?.onError?.(e instanceof Error ? e : new Error(String(e)));
            return '';
        } finally {
            _isPending.set(false);
        }
    }

    async function cut(text: string, onClear: () => void): Promise<void> {
        await copy(text);
        onClear();
    }

    return {
        copiedText: _copiedText as ReadonlySignal<string>,
        isPending: _isPending as ReadonlySignal<boolean>,
        copy,
        paste,
        cut,
        isSupported: isBrowser,
    };
}
