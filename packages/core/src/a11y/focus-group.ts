// Focus group — arrow key navigation with type-ahead and active-descendant.
// Used by: Menu, Listbox, Tree, Toolbar, RadioGroup, TabList.
// One item has tabindex="0", rest have "-1". Arrow keys move focus.

import type { Dispose } from '../utils/types';

export interface FocusGroupOptions {
    /** CSS selector for items within the group. Default: standard ARIA roles. */
    selector?: string;
    /**
     * The group's items, read at every key. Overrides `selector`, for a group a selector cannot
     * tell from a group of the same kind nested in it: pdx-tabs in a pdx-tabs panel.
     */
    items?: () => HTMLElement[];
    /** Navigation axis. Default: 'both'. */
    orientation?: 'horizontal' | 'vertical' | 'both';
    /** Wrap around at edges. Default: true. */
    wrap?: boolean;
    /** Enable type-ahead search (first character nav). Default: false. */
    typeAhead?: boolean;
    /** Milliseconds before the type-ahead search buffer resets. Default: 500. */
    typeAheadTimeout?: number;
    /** Use aria-activedescendant instead of moving DOM focus. Default: false. */
    activeDescendant?: boolean;
    /** Called when an item receives focus/activation. */
    onFocus?: (el: HTMLElement, index: number) => void;
    /**
     * Called when Enter/Space is pressed on an item. Default: `el.click()` — the action a pointer
     * takes. The key's native activation is always cancelled, so the item is activated once either
     * way; pass onSelect only to do something other than click it. Without that default, Enter and
     * Space would do nothing on pdx-context-menu and pdx-split-button.
     */
    onSelect?: (el: HTMLElement, index: number) => void;
    /** Skip disabled items during navigation. Default: true. */
    skipDisabled?: boolean;
}

const DEFAULT_SELECTOR = '[role="option"], [role="tab"], [role="menuitem"], [role="treeitem"], [role="radio"]';

/**
 * Enable focus group pattern on a container.
 * Arrow keys navigate between items. Only one item has tabindex="0".
 * Supports type-ahead, aria-activedescendant, and skip-disabled.
 */
export function focusGroup(container: HTMLElement, options?: FocusGroupOptions): Dispose {
    if (typeof document === 'undefined') return () => {};

    const selector = options?.selector ?? DEFAULT_SELECTOR;
    const orientation = options?.orientation ?? 'both';
    const wrap = options?.wrap ?? true;
    const typeAhead = options?.typeAhead ?? false;
    const typeAheadTimeout = options?.typeAheadTimeout ?? 500;
    const useActiveDescendant = options?.activeDescendant ?? false;
    const skipDisabled = options?.skipDisabled ?? true;
    const onFocus = options?.onFocus;
    const onSelect = options?.onSelect ?? ((el: HTMLElement) => el.click());

    // Type-ahead state
    let searchBuffer = '';
    let searchTimer: ReturnType<typeof setTimeout> | null = null;

    // The wait-for-items observer and the timer that gives up on it. Held so dispose() can end
    // both: clearing only the type-ahead timer would leave, for a menu opened and closed before its
    // items rendered, an observer watching a detached container — and a 5s timer — behind.
    let pendingObserver: MutationObserver | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    function getItems(): HTMLElement[] {
        if (options?.items) return options.items();
        return Array.from(container.querySelectorAll<HTMLElement>(selector));
    }

    /** The item `target` is, or is inside; null for anything else, a nested group's item included. */
    function ownItem(target: EventTarget | null): HTMLElement | null {
        if (!(target instanceof Node)) return null;
        return getItems().find(item => item === target || item.contains(target)) ?? null;
    }

    function isItemDisabled(el: HTMLElement): boolean {
        return el.hasAttribute('disabled') ||
               el.getAttribute('aria-disabled') === 'true';
    }

    function getNavigableItems(): HTMLElement[] {
        const items = getItems();
        if (skipDisabled) return items.filter(el => !isItemDisabled(el));
        return items;
    }

    function setActiveItem(allItems: HTMLElement[], _navItems: HTMLElement[], target: HTMLElement): void {
        const targetIndex = allItems.indexOf(target);
        if (targetIndex === -1) return;

        if (useActiveDescendant) {
            // Ensure items have IDs
            for (const item of allItems) {
                if (!item.id) item.id = `pdx-fg-${crypto.randomUUID().slice(0, 8)}`;
            }
            container.setAttribute('aria-activedescendant', target.id);
            // Visual indication via data attribute
            for (const item of allItems) item.removeAttribute('data-active');
            target.setAttribute('data-active', '');
        } else {
            for (const item of allItems) {
                item.setAttribute('tabindex', item === target ? '0' : '-1');
            }
            target.focus();
        }

        onFocus?.(target, targetIndex);
    }

    function navigate(direction: 1 | -1): void {
        const allItems = getItems();
        const navItems = getNavigableItems();
        if (navItems.length === 0) return;

        // Find current active item
        let currentItem: HTMLElement | null;
        if (useActiveDescendant) {
            const activeId = container.getAttribute('aria-activedescendant');
            currentItem = activeId ? document.getElementById(activeId) as HTMLElement : null;
        } else {
            currentItem = allItems.find(el => el === document.activeElement) ?? null;
        }

        if (!currentItem) {
            setActiveItem(allItems, navItems, navItems[0]);
            return;
        }

        const currentIdx = navItems.indexOf(currentItem);
        let nextIdx: number;

        if (currentIdx === -1) {
            nextIdx = 0;
        } else if (wrap) {
            nextIdx = (currentIdx + direction + navItems.length) % navItems.length;
        } else {
            nextIdx = Math.max(0, Math.min(currentIdx + direction, navItems.length - 1));
        }

        setActiveItem(allItems, navItems, navItems[nextIdx]);
    }

    function handleTypeAhead(char: string): void {
        if (!typeAhead) return;

        searchBuffer += char.toLowerCase();
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { searchBuffer = ''; }, typeAheadTimeout);

        const allItems = getItems();
        const navItems = getNavigableItems();
        const match = navItems.find(el =>
            (el.textContent?.trim().toLowerCase() ?? '').startsWith(searchBuffer)
        );

        if (match) setActiveItem(allItems, navItems, match);
    }

    // Initialize: first navigable item gets tabindex="0"
    // Retry if no items found (DOM may not be ready yet, e.g. @for not rendered)
    function initTabindex(): void {
        const allItems = getItems();
        const navItems = getNavigableItems();
        if (navItems.length > 0 && !useActiveDescendant) {
            for (const item of allItems) {
                item.setAttribute('tabindex', item === navItems[0] ? '0' : '-1');
            }
        } else if (navItems.length === 0) {
            // Items not in DOM yet — observe for changes
            const obs = new MutationObserver(() => {
                const retryItems = getNavigableItems();
                if (retryItems.length > 0) {
                    obs.disconnect();
                    pendingObserver = null;
                    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
                    const all = getItems();
                    for (const item of all) {
                        item.setAttribute('tabindex', item === retryItems[0] ? '0' : '-1');
                    }
                }
            });
            obs.observe(container, { childList: true, subtree: true });
            pendingObserver = obs;
            // Safety: disconnect after 5s
            pendingTimer = setTimeout(() => { obs.disconnect(); pendingObserver = null; pendingTimer = null; }, 5000);
        }
    }
    initTabindex();

    function handleKeydown(e: KeyboardEvent): void {
        // Only the keys pressed on this group's items, or on its container. A key pressed in a group
        // nested inside it bubbles here too, and would move the focus a second time. With an
        // active descendant the focus stays outside the items, so every key is the group's.
        if (!useActiveDescendant && e.target !== container && !ownItem(e.target)) return;
        const isHorizontal = orientation === 'horizontal' || orientation === 'both';
        const isVertical = orientation === 'vertical' || orientation === 'both';

        switch (e.key) {
            case 'ArrowRight':
                if (!isHorizontal) return;
                e.preventDefault();
                navigate(1);
                break;
            case 'ArrowLeft':
                if (!isHorizontal) return;
                e.preventDefault();
                navigate(-1);
                break;
            case 'ArrowDown':
                if (!isVertical) return;
                e.preventDefault();
                navigate(1);
                break;
            case 'ArrowUp':
                if (!isVertical) return;
                e.preventDefault();
                navigate(-1);
                break;
            case 'Home': {
                e.preventDefault();
                const first = getNavigableItems();
                if (first.length > 0) setActiveItem(getItems(), first, first[0]);
                break;
            }
            case 'End': {
                e.preventDefault();
                const last = getNavigableItems();
                if (last.length > 0) setActiveItem(getItems(), last, last[last.length - 1]);
                break;
            }
            case 'Enter':
            case ' ': {
                e.preventDefault();
                const items = getItems();
                const active = useActiveDescendant
                    ? document.getElementById(container.getAttribute('aria-activedescendant') ?? '') as HTMLElement
                    : items.find(el => el === document.activeElement) ?? null;
                if (active) {
                    const idx = items.indexOf(active);
                    onSelect(active, idx);
                }
                break;
            }
            default:
                // Type-ahead: single printable character
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    handleTypeAhead(e.key);
                }
                return;
        }
    }

    // Click/pointerdown handler — sync tabindex when user clicks an item directly
    function handleClick(e: Event): void {
        const target = ownItem(e.target);
        if (!target || (skipDisabled && isItemDisabled(target))) return;
        const allItems = getItems();
        const navItems = getNavigableItems();
        setActiveItem(allItems, navItems, target);
    }

    container.addEventListener('keydown', handleKeydown);
    container.addEventListener('pointerdown', handleClick);

    return () => {
        container.removeEventListener('keydown', handleKeydown);
        container.removeEventListener('pointerdown', handleClick);
        if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
        if (pendingObserver) { pendingObserver.disconnect(); pendingObserver = null; }
    };
}
