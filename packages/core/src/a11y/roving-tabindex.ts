// Roving Tabindex — composable for keyboard navigation in widget groups.
// Extends focus-group pattern: exactly one child has tabindex=0,
// all others have tabindex=-1. Arrow keys move the active item.
// Used by: Tabs, Toolbar, Menubar, RadioGroup, ButtonGroup.

import { signal, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

export interface RovingTabindexOptions {
    /** Orientation. Default: 'horizontal'. */
    orientation?: 'horizontal' | 'vertical' | 'both';
    /** Wrap around. Default: true. */
    wrap?: boolean;
    /** CSS selector for focusable items. Default: '[role="tab"], button, [tabindex]'. */
    itemSelector?: string;
    /** Skip items with aria-disabled="true". Default: true. */
    skipDisabled?: boolean;
    /** Called when active item changes. */
    onActiveChange?: (element: HTMLElement, index: number) => void;
}

export interface RovingTabindexReturn {
    /** Current active element index (reactive). */
    activeIndex: ReadonlySignal<number>;
    /**
     * Focus a specific item by index.
     *
     * @param searchDir - Where to look when that item is disabled: forward (default) or back.
     *   Home wants forward from the first, End wants back from the last, and neither can be
     *   inferred from the index alone.
     */
    focusItem(index: number, searchDir?: 1 | -1): void;
    /** Focus next item. */
    focusNext(): void;
    /** Focus previous item. */
    focusPrev(): void;
    /** Cleanup. */
    dispose: Dispose;
}

/**
 * The roving tabindex pattern: a group of controls that Tab enters ONCE, and the arrow keys move
 * within.
 *
 * Exactly one item is `tabindex=0` at a time and the rest are `-1`, so a toolbar of twelve buttons
 * costs one Tab stop instead of twelve. That is the WAI-ARIA rule for tabs, toolbars, menus and
 * radio groups, and getting it wrong is the most common keyboard defect in a component library.
 *
 * `orientation` picks which arrows move (horizontal by default), `wrap` decides whether the last
 * item leads back to the first, and disabled items are skipped rather than focused.
 */
export function useRovingTabindex(
    el: () => HTMLElement | null,
    options?: RovingTabindexOptions,
): RovingTabindexReturn {
    const orientation = options?.orientation ?? 'horizontal';
    const wrap = options?.wrap ?? true;
    const itemSelector = options?.itemSelector ?? '[role="tab"], button, [tabindex]';
    const skipDisabled = options?.skipDisabled ?? true;

    const _activeIndex = signal(0);

    function getItems(): HTMLElement[] {
        const container = el();
        if (!container) return [];
        return Array.from(container.querySelectorAll(itemSelector)) as HTMLElement[];
    }

    function isDisabled(item: HTMLElement): boolean {
        if (!skipDisabled) return false;
        return item.getAttribute('aria-disabled') === 'true' || item.hasAttribute('disabled');
    }

    function updateTabindexes(activeIdx: number): void {
        const items = getItems();
        for (let i = 0; i < items.length; i++) {
            items[i].setAttribute('tabindex', i === activeIdx ? '0' : '-1');
        }
    }

    function focusItem(index: number, searchDir: 1 | -1 = 1): void {
        const items = getItems();
        if (items.length === 0) return;

        // Clamp
        if (index < 0) index = wrap ? items.length - 1 : 0;
        if (index >= items.length) index = wrap ? 0 : items.length - 1;

        // Skip disabled, in the direction the CALLER is travelling.
        //
        // It is not inferred: `index > activeIndex ? 1 : -1` is right for next/prev and wrong for
        // Home and End. Home asks for index 0 while the active index is already 0, so the inference
        // says "backwards" and Home wraps to the LAST item of the group; End does the mirror image.
        // That happens in a group whose first (or last) item is disabled, which is what a toolbar
        // looks like whenever an action is unavailable.
        if (isDisabled(items[index])) {
            const dir = searchDir;
            let attempts = items.length;
            while (isDisabled(items[index]) && attempts > 0) {
                index += dir;
                if (index < 0) index = wrap ? items.length - 1 : 0;
                if (index >= items.length) index = wrap ? 0 : items.length - 1;
                attempts--;
            }
        }

        _activeIndex.set(index);
        updateTabindexes(index);
        items[index]?.focus();
        options?.onActiveChange?.(items[index], index);
    }

    function focusNext(): void { focusItem(_activeIndex.peek() + 1, 1); }
    function focusPrev(): void { focusItem(_activeIndex.peek() - 1, -1); }

    function onKeydown(e: KeyboardEvent): void {
        const nextKey = orientation === 'vertical' ? 'ArrowDown'
            : orientation === 'horizontal' ? 'ArrowRight' : null;
        const prevKey = orientation === 'vertical' ? 'ArrowUp'
            : orientation === 'horizontal' ? 'ArrowLeft' : null;

        if (e.key === nextKey || (orientation === 'both' && (e.key === 'ArrowRight' || e.key === 'ArrowDown'))) {
            e.preventDefault();
            focusNext();
        } else if (e.key === prevKey || (orientation === 'both' && (e.key === 'ArrowLeft' || e.key === 'ArrowUp'))) {
            e.preventDefault();
            focusPrev();
        } else if (e.key === 'Home') {
            e.preventDefault();
            focusItem(0, 1);              // first, or the next enabled AFTER it
        } else if (e.key === 'End') {
            e.preventDefault();
            focusItem(getItems().length - 1, -1);   // last, or the next enabled BEFORE it
        }
    }

    // Sync active when a child is clicked
    function onFocusin(e: FocusEvent): void {
        const items = getItems();
        const target = e.target as HTMLElement;
        const idx = items.indexOf(target);
        if (idx >= 0 && idx !== _activeIndex.peek()) {
            _activeIndex.set(idx);
            updateTabindexes(idx);
            options?.onActiveChange?.(target, idx);
        }
    }

    let cleanupEffect: Dispose | null = null;

    if (isBrowser) {
        cleanupEffect = effect(() => {
            const container = el();
            if (!container) return;

            updateTabindexes(_activeIndex.peek());
            container.addEventListener('keydown', onKeydown);
            container.addEventListener('focusin', onFocusin);

            return () => {
                container.removeEventListener('keydown', onKeydown);
                container.removeEventListener('focusin', onFocusin);
            };
        });
    }

    return {
        activeIndex: _activeIndex as ReadonlySignal<number>,
        focusItem,
        focusNext,
        focusPrev,
        dispose: () => { cleanupEffect?.(); },
    };
}
