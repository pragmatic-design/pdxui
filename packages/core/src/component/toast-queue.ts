// Toast Queue — signal-based notification queue with auto-dismiss.
// Pure queue primitive — no rendering. Consumed by <pdx-toast-container> in Tier 1.
// Used by: all user feedback flows (save, error, info, warning).

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────

export type ToastType = 'info' | 'success' | 'warning' | 'error';
export type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface ToastData {
    /** Unique ID (auto-generated if omitted). */
    id?: string;
    /** Toast title (bold, optional). */
    title?: string;
    /** Toast message / description. */
    message: string;
    /** Toast type. Default: 'info'. */
    type?: ToastType;
    /** Visual variant: filled (default), bordered (subtle border+bg), minimal (text only). */
    variant?: 'filled' | 'bordered' | 'minimal';
    /** Custom icon name (overrides type-based icon). null = no icon. */
    icon?: string | null;
    /** Size: compact, default, large. */
    size?: 'compact' | 'default' | 'large';
    /** Auto-dismiss duration in ms. 0 = persistent. Default: from queue options. */
    duration?: number;
    /** Whether the user can dismiss this toast. Default: true. */
    dismissible?: boolean;
    /** Optional action button. */
    action?: { label: string; onClick: () => void };
    /** Arbitrary metadata for custom rendering. */
    meta?: Record<string, unknown>;
}

export interface Toast extends Required<Pick<ToastData, 'id' | 'message' | 'type' | 'dismissible'>> {
    title?: string;
    variant: 'filled' | 'bordered' | 'minimal';
    icon?: string | null;
    size: 'compact' | 'default' | 'large';
    duration: number;
    action?: { label: string; onClick: () => void };
    meta?: Record<string, unknown>;
    /** Timestamp when this toast was added. */
    createdAt: number;
}

export interface ToastQueueOptions {
    /** Screen position for the toast stack. Default: 'top-right'. */
    position?: ToastPosition;
    /** Max visible toasts. Older ones are removed. Default: 5. */
    maxVisible?: number;
    /** Default auto-dismiss duration in ms. Default: 4000. */
    defaultDuration?: number;
    /** Called when a toast is added. */
    onAdd?: (toast: Toast) => void;
    /** Called when a toast is dismissed. */
    onDismiss?: (toast: Toast) => void;
}

export interface ToastQueue {
    /** All visible toasts (reactive, newest last). */
    items: ReadonlySignal<Toast[]>;
    /** Number of toasts (reactive). */
    count: ReadonlySignal<number>;
    /** Queue position setting. */
    position: ToastPosition;
    /** Add a toast. Returns its ID. */
    add(data: ToastData): string;
    /** Convenience: add with type preset. */
    success(message: string, opts?: Partial<ToastData>): string;
    info(message: string, opts?: Partial<ToastData>): string;
    warning(message: string, opts?: Partial<ToastData>): string;
    error(message: string, opts?: Partial<ToastData>): string;
    /** Dismiss a specific toast by ID. */
    dismiss(id: string): void;
    /** Dismiss all toasts. */
    clear(): void;
    /** Update a toast's message/type in place. */
    update(id: string, data: Partial<Pick<ToastData, 'message' | 'type' | 'duration'>>): void;
    /** Promise-based toast: loading → success/error. */
    promise<T>(p: Promise<T>, messages: { loading: string; success: string | ((data: T) => string); error: string | ((err: unknown) => string) }, opts?: Partial<ToastData>): Promise<T>;
    /** Pause auto-dismiss (e.g., on hover). */
    pause(id: string): void;
    /** Resume auto-dismiss. */
    resume(id: string, remainingMs?: number): void;
}

// ─── Implementation ───────────────────────────────────────────

let _nextId = 1;

/**
 * The state behind a toast stack: a capped list, per-toast auto-dismiss timers, and pause/resume.
 *
 * `maxVisible` (5) is a cap, not a limit on what you may push — the overflow waits its turn, because
 * twenty stacked toasts communicate less than five.
 *
 * `pause`/`resume` exist for hover: a message that disappears while it is being read is a message
 * that was not delivered. A component using this should pause on pointer-enter and on focus.
 */
export function createToastQueue(options?: ToastQueueOptions): ToastQueue {
    const maxVisible = options?.maxVisible ?? 5;
    const defaultDuration = options?.defaultDuration ?? 4000;
    const position = options?.position ?? 'top-right';

    const _items = signal<Toast[]>([]);
    const _count = computed(() => _items().length);
    const _timers = new Map<string, ReturnType<typeof setTimeout>>();
    const _startTimes = new Map<string, number>(); // when the current timer started
    const _remaining = new Map<string, number>();   // remaining ms when paused

    function add(data: ToastData): string {
        const id = data.id ?? `toast-${_nextId++}`;
        const duration = data.duration ?? defaultDuration;

        const toast: Toast = {
            id,
            title: data.title,
            message: data.message,
            type: data.type ?? 'info',
            variant: data.variant ?? 'filled',
            icon: data.icon,
            size: data.size ?? 'default',
            dismissible: data.dismissible ?? true,
            duration,
            action: data.action,
            meta: data.meta,
            createdAt: Date.now(),
        };

        _items.set(prev => {
            const next = [...prev, toast];
            // Evict oldest if over max
            return next.length > maxVisible ? next.slice(next.length - maxVisible) : next;
        });

        options?.onAdd?.(toast);

        // Auto-dismiss
        if (duration > 0) {
            _timers.set(id, setTimeout(() => dismiss(id), duration));
            _startTimes.set(id, Date.now());
            _remaining.set(id, duration);
        }

        return id;
    }

    function dismiss(id: string): void {
        const timer = _timers.get(id);
        if (timer) { clearTimeout(timer); _timers.delete(id); }

        const current = _items.peek();
        const toast = current.find(t => t.id === id);
        if (!toast) return;

        _items.set(current.filter(t => t.id !== id));
        options?.onDismiss?.(toast);
    }

    function clear(): void {
        for (const timer of _timers.values()) clearTimeout(timer);
        _timers.clear();
        const all = _items.peek();
        _items.set([]);
        for (const t of all) options?.onDismiss?.(t);
    }

    function update(id: string, data: Partial<Pick<ToastData, 'message' | 'type' | 'duration'>>): void {
        _items.set(prev => prev.map(t => {
            if (t.id !== id) return t;
            const updated = { ...t, ...data };
            // Reset auto-dismiss timer + tracking if duration changed
            if (data.duration !== undefined) {
                const timer = _timers.get(id);
                if (timer) clearTimeout(timer);
                if (data.duration > 0) {
                    _timers.set(id, setTimeout(() => dismiss(id), data.duration));
                    _startTimes.set(id, Date.now());
                    _remaining.set(id, data.duration);
                } else {
                    _timers.delete(id);
                    _startTimes.delete(id);
                    _remaining.delete(id);
                }
            }
            return updated;
        }));
    }

    function withType(type: ToastType) {
        return (message: string, opts?: Partial<ToastData>) => add({ ...opts, message, type });
    }

    /** Promise-based toast: shows loading → success/error automatically. */
    function promise<T>(
        p: Promise<T>,
        messages: { loading: string; success: string | ((data: T) => string); error: string | ((err: unknown) => string) },
        opts?: Partial<ToastData>,
    ): Promise<T> {
        const id = add({ ...opts, message: messages.loading, type: 'info', duration: 0 });
        return p.then(
            (data) => {
                const msg = typeof messages.success === 'function' ? messages.success(data) : messages.success;
                update(id, { message: msg, type: 'success', duration: opts?.duration ?? defaultDuration });
                return data;
            },
            (err) => {
                const msg = typeof messages.error === 'function' ? messages.error(err) : messages.error;
                update(id, { message: msg, type: 'error', duration: opts?.duration ?? defaultDuration });
                throw err;
            },
        );
    }

    /** Pause auto-dismiss timer for a toast (e.g., on hover). */
    function pause(id: string): void {
        const timer = _timers.get(id);
        if (timer) {
            clearTimeout(timer);
            _timers.delete(id);
            // Calculate remaining time based on when the timer started
            const startTime = _startTimes.get(id);
            const prevRemaining = _remaining.get(id);
            if (startTime && prevRemaining) {
                const elapsed = Date.now() - startTime;
                _remaining.set(id, Math.max(0, prevRemaining - elapsed));
            }
        }
    }

    /** Resume auto-dismiss timer for a toast from where it was paused. */
    function resume(id: string, remainingMs?: number): void {
        const items = _items.peek();
        const toast = items.find(t => t.id === id);
        if (!toast || toast.duration <= 0) return;
        const ms = remainingMs ?? _remaining.get(id) ?? toast.duration;
        _startTimes.set(id, Date.now());
        _remaining.set(id, ms);
        _timers.set(id, setTimeout(() => dismiss(id), ms));
    }

    return {
        items: _items as ReadonlySignal<Toast[]>,
        count: _count,
        position,
        add,
        success: withType('success'),
        info: withType('info'),
        warning: withType('warning'),
        error: withType('error'),
        promise,
        pause,
        resume,
        dismiss,
        clear,
        update,
    };
}
