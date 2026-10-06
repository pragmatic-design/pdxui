// Active Descendant — manages aria-activedescendant pattern.
// For Combobox, Menu, Listbox where focus stays on one element (input)
// but arrow keys navigate a list of options.

import { signal, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// Monotonic, because the id has to be unique in the DOCUMENT and this module may be driving several
// lists at once. An id like `${index}-${Date.now()}` collides the moment two comboboxes activate
// the same index in the same millisecond — one opening in response to the other is exactly that.
// A duplicate id makes aria-activedescendant resolve to whichever element comes first in the
// document, so one control announces the other's option.
let idCounter = 0;

// ─── Types ─────────────────────────────────────────────────────

export interface ActiveDescendantOptions {
    /** Orientation of the list. Default: 'vertical'. */
    orientation?: 'vertical' | 'horizontal';
    /** Wrap from last to first. Default: true. */
    wrap?: boolean;
    /** CSS selector for the list items. Default: '[role="option"]'. */
    itemSelector?: string;
    /** Called when active item changes. */
    onActiveChange?: (id: string | null, index: number) => void;
    /** Called when an item is selected (Enter/Space). */
    onSelect?: (id: string, index: number) => void;
    /** Type-ahead: match items by text content. Default: true. */
    typeAhead?: boolean;
    /** Type-ahead timeout in ms. Default: 500. */
    typeAheadTimeout?: number;
}

export interface ActiveDescendantReturn {
    /** Current active item ID (reactive). */
    activeId: ReadonlySignal<string | null>;
    /** Current active index (reactive). */
    activeIndex: ReadonlySignal<number>;
    /** Set active by index. */
    setActive(index: number): void;
    /** Move to next item. */
    next(): void;
    /** Move to previous item. */
    prev(): void;
    /** Move to first item. */
    first(): void;
    /** Move to last item. */
    last(): void;
    /** Clear active descendant. */
    clear(): void;
    /** Cleanup. */
    dispose: Dispose;
}

// ─── useActiveDescendant ──────────────────────────────────────

/**
 * @param controller - Element that has focus and receives keyboard events (e.g. input).
 * @param listbox - Element containing the items (e.g. dropdown list).
 */
export function useActiveDescendant(
    controller: () => HTMLElement | null,
    listbox: () => HTMLElement | null,
    options?: ActiveDescendantOptions,
): ActiveDescendantReturn {
    const orientation = options?.orientation ?? 'vertical';
    const wrap = options?.wrap ?? true;
    const itemSelector = options?.itemSelector ?? '[role="option"]';
    const typeAhead = options?.typeAhead ?? true;
    const typeAheadTimeout = options?.typeAheadTimeout ?? 500;

    const _activeId = signal<string | null>(null);
    const _activeIndex = signal(-1);

    let typeBuffer = '';
    let typeTimer: ReturnType<typeof setTimeout> | null = null;

    function getItems(): HTMLElement[] {
        const lb = listbox();
        if (!lb) return [];
        return Array.from(lb.querySelectorAll(itemSelector)) as HTMLElement[];
    }

    function setActive(index: number): void {
        const items = getItems();
        const ctrl = controller();
        if (!ctrl || items.length === 0) return;

        // Clear previous
        const prevIdx = _activeIndex.peek();
        if (prevIdx >= 0 && prevIdx < items.length) {
            items[prevIdx].removeAttribute('data-active');
            items[prevIdx].classList.remove('pdx-active');
        }

        // Clamp index
        if (index < 0) index = wrap ? items.length - 1 : 0;
        if (index >= items.length) index = wrap ? 0 : items.length - 1;

        const item = items[index];
        if (!item) return;

        // Ensure item has an ID
        if (!item.id) item.id = `pdx-ad-${++idCounter}`;

        item.setAttribute('data-active', '');
        item.classList.add('pdx-active');

        // Set aria-activedescendant on controller
        ctrl.setAttribute('aria-activedescendant', item.id);

        // Scroll into view
        item.scrollIntoView?.({ block: 'nearest' });

        _activeId.set(item.id);
        _activeIndex.set(index);
        options?.onActiveChange?.(item.id, index);
    }

    function next(): void { setActive(_activeIndex.peek() + 1); }
    function prev(): void { setActive(_activeIndex.peek() - 1); }
    function first(): void { setActive(0); }
    function last(): void { setActive(getItems().length - 1); }

    function clear(): void {
        const items = getItems();
        const ctrl = controller();
        const idx = _activeIndex.peek();
        if (idx >= 0 && idx < items.length) {
            items[idx].removeAttribute('data-active');
            items[idx].classList.remove('pdx-active');
        }
        if (ctrl) ctrl.removeAttribute('aria-activedescendant');
        _activeId.set(null);
        _activeIndex.set(-1);
        options?.onActiveChange?.(null, -1);
    }

    // Type-ahead: match items by first letter(s)
    function handleTypeAhead(char: string): void {
        if (!typeAhead) return;
        if (typeTimer) clearTimeout(typeTimer);
        typeBuffer += char.toLowerCase();
        typeTimer = setTimeout(() => { typeBuffer = ''; }, typeAheadTimeout);

        const items = getItems();
        for (let i = 0; i < items.length; i++) {
            const text = (items[i].textContent ?? '').trim().toLowerCase();
            if (text.startsWith(typeBuffer)) {
                setActive(i);
                return;
            }
        }
    }

    function onKeydown(e: KeyboardEvent): void {
        const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
        const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';

        switch (e.key) {
            case nextKey:
                e.preventDefault();
                next();
                break;
            case prevKey:
                e.preventDefault();
                prev();
                break;
            case 'Home':
                e.preventDefault();
                first();
                break;
            case 'End':
                e.preventDefault();
                last();
                break;
            case 'Enter':
            case ' ':
                if (_activeIndex.peek() >= 0) {
                    e.preventDefault();
                    const id = _activeId.peek();
                    if (id) options?.onSelect?.(id, _activeIndex.peek());
                }
                break;
            case 'Escape':
                clear();
                break;
            default:
                // Type-ahead: single printable character
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    handleTypeAhead(e.key);
                }
        }
    }

    let cleanupEffect: Dispose | null = null;

    if (isBrowser) {
        cleanupEffect = effect(() => {
            const ctrl = controller();
            if (!ctrl) return;

            ctrl.addEventListener('keydown', onKeydown);
            return () => ctrl.removeEventListener('keydown', onKeydown);
        });
    }

    return {
        activeId: _activeId as ReadonlySignal<string | null>,
        activeIndex: _activeIndex as ReadonlySignal<number>,
        setActive,
        next,
        prev,
        first,
        last,
        clear,
        dispose: () => { cleanupEffect?.(); if (typeTimer) clearTimeout(typeTimer); },
    };
}
