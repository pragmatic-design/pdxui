// Browser Observer APIs → Signal bridge.
// IntersectionObserver, ResizeObserver, MutationObserver as reactive signals.
// Auto-cleanup, auto-tracked, zero boilerplate.

import { signal } from './signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

type DisposableSignal<T> = ReadonlySignal<T> & { dispose: Dispose };

// ─── fromIntersection() ─────────────────────────────────────────

export interface IntersectionState {
    isIntersecting: boolean;
    ratio: number;
    entry: IntersectionObserverEntry | null;
}

/**
 * Observe element intersection as a reactive signal.
 *
 * Usage:
 *   const visibility = fromIntersection(ref, { threshold: 0.5 });
 *   effect(() => {
 *     if (visibility().isIntersecting) loadContent();
 *   });
 */
export function fromIntersection(
    target: Element | (() => Element | null),
    options?: IntersectionObserverInit,
): DisposableSignal<IntersectionState> {
    const initial: IntersectionState = { isIntersecting: false, ratio: 0, entry: null };
    const _value = signal<IntersectionState>(initial);

    let observer: IntersectionObserver | null = null;
    let currentEl: Element | null = null;

    function observe(el: Element): void {
        if (currentEl === el && observer) return;
        disconnect();
        observer = new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            _value.set({
                isIntersecting: entry.isIntersecting,
                ratio: entry.intersectionRatio,
                entry,
            } as never);
        }, options);
        observer.observe(el);
        currentEl = el;
    }

    function disconnect(): void {
        if (observer) { observer.disconnect(); observer = null; }
        currentEl = null;
    }

    // Resolve target
    const el = typeof target === 'function' ? target() : target;
    if (el) observe(el);

    const readable = (() => _value()) as DisposableSignal<IntersectionState>;
    readable.peek = () => _value.peek();
    readable.dispose = disconnect;
    return readable;
}

// ─── fromResize() ───────────────────────────────────────────────

export interface ResizeState {
    width: number;
    height: number;
    entry: ResizeObserverEntry | null;
}

/**
 * Observe element size as a reactive signal.
 *
 * Usage:
 *   const size = fromResize(containerRef);
 *   effect(() => console.log(`${size().width}x${size().height}`));
 */
export function fromResize(
    target: Element | (() => Element | null),
    options?: ResizeObserverOptions,
): DisposableSignal<ResizeState> {
    const initial: ResizeState = { width: 0, height: 0, entry: null };
    const _value = signal<ResizeState>(initial);

    let observer: ResizeObserver | null = null;
    let currentEl: Element | null = null;

    function observe(el: Element): void {
        if (currentEl === el && observer) return;
        disconnect();
        observer = new ResizeObserver((entries) => {
            const entry = entries[entries.length - 1];
            const box = entry.contentBoxSize?.[0];
            _value.set({
                width: box ? box.inlineSize : entry.contentRect.width,
                height: box ? box.blockSize : entry.contentRect.height,
                entry,
            } as never);
        });
        observer.observe(el, options);
        currentEl = el;
    }

    function disconnect(): void {
        if (observer) { observer.disconnect(); observer = null; }
        currentEl = null;
    }

    const el = typeof target === 'function' ? target() : target;
    if (el) observe(el);

    const readable = (() => _value()) as DisposableSignal<ResizeState>;
    readable.peek = () => _value.peek();
    readable.dispose = disconnect;
    return readable;
}

// ─── fromMutation() ─────────────────────────────────────────────

export interface MutationState {
    records: MutationRecord[];
    count: number;
}

/**
 * Observe DOM mutations as a reactive signal.
 *
 * Usage:
 *   const changes = fromMutation(listRef, { childList: true });
 *   effect(() => console.log(`${changes().count} mutations`));
 */
export function fromMutation(
    target: Node | (() => Node | null),
    options?: MutationObserverInit,
): DisposableSignal<MutationState> {
    const initial: MutationState = { records: [], count: 0 };
    const _value = signal<MutationState>(initial);

    let observer: MutationObserver | null = null;
    let totalCount = 0;
    let currentNode: Node | null = null;

    const config: MutationObserverInit = options ?? { childList: true, subtree: true };

    function observe(node: Node): void {
        if (currentNode === node && observer) return;
        disconnect();
        observer = new MutationObserver((records) => {
            totalCount += records.length;
            _value.set({ records, count: totalCount } as never);
        });
        observer.observe(node, config);
        currentNode = node;
    }

    function disconnect(): void {
        if (observer) { observer.disconnect(); observer = null; }
        currentNode = null;
    }

    const node = typeof target === 'function' ? target() : target;
    if (node) observe(node);

    const readable = (() => _value()) as DisposableSignal<MutationState>;
    readable.peek = () => _value.peek();
    readable.dispose = disconnect;
    return readable;
}
