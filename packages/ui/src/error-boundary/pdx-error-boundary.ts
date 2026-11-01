// pdx-error-boundary — Declarative error boundary component.
// Catches errors from children (render + effects) and displays fallback UI.
// Provides error state to descendants via Context Protocol.
//
// Usage:
//   <pdx-error-boundary>
//     <app-risky-widget />
//   </pdx-error-boundary>
//
//   <pdx-error-boundary max-retries="3" auto-retry>
//     <pdx-data-heavy-panel />
//   </pdx-error-boundary>

import { component, html, signal, computed, provide, context, event } from '@pdxui/core';
import { errorBoundary } from '@pdxui/core';
import type { Signal, ReadonlySignal } from '@pdxui/core';
import { uiString } from '../shared/i18n';

/** Error context provided to descendants via hierarchical provide. */
export interface ErrorContext {
    /** Current error (null if no error). */
    error: Signal<Error | null>;
    /** Number of retries attempted. */
    retryCount: Signal<number>;
    /** Whether a retry is possible. */
    canRetry: ReadonlySignal<boolean>;
    /** Trigger a retry. */
    retry: () => void;
}

/**
 * The context token the nearest boundary provides its `ErrorContext` under (#495): a component inside
 * reads it with `inject(ErrorContext, el, null)`.
 */
export const ErrorContext = context<ErrorContext>('error-boundary');

/**
 * Catches render errors and effect failures from its children and shows a fallback UI with retry.
 *
 * @csspart fallback - The fallback shown in place of the children (`role="alert"`).
 * @csspart message - The fallback's message: `fallbackMessage`, or the component string.
 * @csspart detail - The error's own message, under it.
 * @csspart retry - The Retry button, while retries are left; the note that none are, after.
 *
 * @cssstate error - A child threw: the fallback shows. Cleared when Retry brings the children back.
 */
component('pdx-error-boundary', {
    events: {
        /** A child threw; the error, and how many retries have been made. */
        'pdx-error': event<{ error: Error; retryCount: number }>(),
    },
    // On the host as a custom state (#132, #290): a page can tell a failed boundary from outside it.
    states: ['error'],
    parts: ['fallback', 'message', 'detail', 'retry'],
    props: {
        /** Maximum retries before permanent fallback. 0 = no retry. Default: 3. */
        maxRetries: { type: Number, default: 3 },
        /** Auto-retry on error (no user action needed). Default: false. */
        autoRetry: { type: Boolean, default: false },
        /** Delay between auto-retries in ms. Default: 1000. */
        retryDelay: { type: Number, default: 1000 },
        /** Fallback message shown on error. Default: 'Something went wrong.' */
        /** The fallback's message. Empty: the error-boundary.message component string, «Something went wrong.». */
        fallbackMessage: { type: String, default: '' },
    },
    setup(ctx) {
        const _error = signal<Error | null>(null);
        const _retryCount = signal(0);
        const _canRetry = computed(() => _retryCount() < (ctx.maxRetries() as number));
        let _retryFn: (() => void) | null = null;

        function retry() {
            if (_retryFn && _canRetry()) _retryFn();
        }

        // Provide error context to descendants
        const errorContext: ErrorContext = {
            error: _error,
            retryCount: _retryCount,
            canRetry: _canRetry,
            retry,
        };
        provide(ErrorContext, errorContext, ctx.el);

        // The children, kept for Retry. The fallback clears everything between the
        // boundary's markers, the projected children included, and a Retry that rendered a new
        // <slot> — which nothing fills after mount — would bring the boundary back empty. They are taken when an
        // error arrives, while they are still in place, and put back by the next render.
        let _children: Node[] | null = null;
        function keepChildren(): void {
            const nodes: Node[] = [];
            let inside = false;
            for (const n of Array.from(ctx.el.childNodes)) {
                if (n.nodeType === Node.COMMENT_NODE && (n as Comment).data === 'error-boundary') { inside = true; continue; }
                if (n.nodeType === Node.COMMENT_NODE && (n as Comment).data === '/error-boundary') break;
                if (inside) nodes.push(n);
            }
            // Only while the content shows: the fallback's own nodes are not the children.
            if (nodes.length && !ctx.el.querySelector(':scope > .pdx-error-boundary')) _children = nodes;
        }
        /** The content: the slot the first time, the kept children after. Rendering it ends the error state. */
        function content(): Node | DocumentFragment {
            ctx.state('error', false);
            if (!_children) return html`<slot></slot>`;
            const frag = document.createDocumentFragment();
            for (const n of _children) frag.appendChild(n);
            return frag;
        }

        return {
            _error, _retryCount, _canRetry, retry, keepChildren, content,
            setRetryFn: (fn: () => void) => { _retryFn = fn; },
            setError: (e: Error | null) => { _error.set(e); ctx.state('error', e !== null); },
            setRetryCount: (n: number) => _retryCount.set(n),
        };
    },
    render: (ctx) => {
        const maxRetries = ctx.maxRetries() as number;
        const autoRetry = ctx.autoRetry() as boolean;
        const retryDelay = ctx.retryDelay() as number;
        const fallbackMsg = ctx.fallbackMessage() as string;

        return errorBoundary(
            // Content: the projected children; after an error, the same children kept for Retry.
            () => (ctx as any).content(),
            // Fallback: error UI with retry button
            (error, retry) => {
                (ctx as any).setError(error);
                (ctx as any).setRetryFn(retry);
                const canRetry = (ctx as any)._retryCount() < maxRetries;

                return html`<div class="pdx-error-boundary" role="alert" data-part="fallback">
                    <div class="pdx-error-boundary-icon">⚠</div>
                    <div class="pdx-error-boundary-message" data-part="message">${() => fallbackMsg || uiString('error-boundary', 'message')}</div>
                    <div class="pdx-error-boundary-detail pdx-txt-small pdx-ink-muted" data-part="detail">${error.message}</div>
                    ${() => canRetry
                        ? html`<button class="pdx-outline" size="sm" data-part="retry" @click=${retry}>${() => uiString('error-boundary', 'retry')}</button>`
                        : html`<span class="pdx-txt-small pdx-ink-muted" data-part="retry">${() => uiString('error-boundary', 'maxRetries')}</span>`
                    }
                </div>`;
            },
            {
                maxRetries,
                autoRetry,
                retryDelay,
                onError: (error, count) => {
                    // Before the fallback clears them.
                    (ctx as any).keepChildren();
                    (ctx as any).setError(error);
                    (ctx as any).setRetryCount(count);
                    ctx.emit('pdx-error', { error, retryCount: count });
                },
            },
        );
    },
});
