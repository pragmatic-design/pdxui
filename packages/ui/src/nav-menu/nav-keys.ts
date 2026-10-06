// pdx-nav-menu from the keyboard.
//
// The APG disclosure navigation with a roving tabindex: ONE Tab stop for the whole menu, the arrows
// inside it, so Tab does not walk every entry one by one. Its own module
// because it is its own responsibility: the component builds the entries, this moves between them.

import type { NavMenuItem } from './pdx-nav-menu';
import type { NavFlyout } from './nav-flyout';

/** What the keyboard moves between: the entries, and the headings that fold a group. */
export const NAV_ENTRY = '.pdx-nav-item, .pdx-nav-heading-toggle';

export interface NavKeysHost {
    /** The menu's `<nav>`, once built. */
    nav(): HTMLElement | null;
    activeKey(): string;
    toggleGroup(key: string): void;
    itemByKey(key: string): NavMenuItem | null;
    /** A getter: the flyout is created with this module's functions, after it. */
    flyout(): NavFlyout;
}

export interface NavKeys {
    applyRoving(): void;
    focusEntry(el: HTMLElement | null | undefined): void;
    entryByKey(key: string): HTMLElement | null;
    onKeydown(e: KeyboardEvent): void;
    onFocusin(e: FocusEvent): void;
}

export function createNavKeys(host: NavKeysHost): NavKeys {
    /** The entry that holds the Tab stop: the last one focused, else the active one. */
    let focusKey = '';

    /** The entries a reader can reach now: rendered (a closed group's children are not) and enabled. */
    function reachable(): HTMLElement[] {
        const nav = host.nav();
        if (!nav) return [];
        return [...nav.querySelectorAll<HTMLElement>(NAV_ENTRY)]
            .filter((e) => e.getAttribute('aria-disabled') !== 'true');
    }

    function entryByKey(key: string): HTMLElement | null {
        return host.nav()?.querySelector<HTMLElement>(`:is(${NAV_ENTRY})[data-nav-key="${CSS.escape(key)}"]`) ?? null;
    }

    /** Every entry out of the Tab order but one. */
    function applyRoving(): void {
        const nav = host.nav();
        if (!nav) return;
        for (const e of nav.querySelectorAll<HTMLElement>(NAV_ENTRY)) e.tabIndex = -1;
        const open = reachable();
        const stop = open.find((e) => e.getAttribute('data-nav-key') === focusKey)
            ?? open.find((e) => e.getAttribute('data-nav-key') === host.activeKey())
            ?? open[0];
        if (stop) stop.tabIndex = 0;
    }

    function focusEntry(el: HTMLElement | null | undefined): void {
        if (!el) return;
        focusKey = el.getAttribute('data-nav-key') ?? '';
        applyRoving();
        el.focus();
    }

    function onKeydown(e: KeyboardEvent): void {
        const nav = host.nav();
        const current = (e.target as HTMLElement).closest?.(NAV_ENTRY) as HTMLElement | null;
        if (!nav || !current || !nav.contains(current)) return;
        const key = current.getAttribute('data-nav-key') ?? '';
        const open = reachable();
        const at = open.indexOf(current);
        const expanded = current.getAttribute('aria-expanded');
        const flyout = host.flyout();

        switch (e.key) {
            case 'ArrowDown': focusEntry(open[Math.min(at + 1, open.length - 1)]); break;
            case 'ArrowUp': focusEntry(open[Math.max(at - 1, 0)]); break;
            case 'Home': focusEntry(open[0]); break;
            case 'End': focusEntry(open[open.length - 1]); break;
            case 'ArrowRight':
                if (current.hasAttribute('data-nav-flyout')) {
                    // Collapsed: into the group's flyout, on its first entry.
                    const item = host.itemByKey(key);
                    if (item) flyout.open(current, item);
                    flyout.focusFirst();
                } else if (expanded === 'false') { host.toggleGroup(key); focusEntry(entryByKey(key)); }
                else if (expanded === 'true') {
                    const group = document.getElementById(current.getAttribute('aria-controls') ?? '');
                    const first = group ? reachable().find((x) => group.contains(x)) : undefined;
                    focusEntry(first);
                } else return;
                break;
            case 'Escape':
                if (!flyout.isOpen()) return;
                flyout.close(true);
                break;
            case 'ArrowLeft':
                if (current.hasAttribute('data-nav-flyout')) {
                    if (!flyout.isOpen()) return;
                    flyout.close(true);
                } else if (expanded === 'true') { host.toggleGroup(key); focusEntry(entryByKey(key)); }
                else {
                    const group = current.closest('.pdx-nav-group, .pdx-nav-section');
                    if (!group?.id) return;
                    focusEntry(nav.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(group.id)}"]`));
                }
                break;
            case ' ':
                // A button activates on Space natively; a link does not, and Space scrolls instead.
                if (current.localName !== 'a') return;
                current.click();
                break;
            default:
                return;
        }
        e.preventDefault();
    }

    /** A click or a Tab into the menu moves the Tab stop with the focus. */
    function onFocusin(e: FocusEvent): void {
        const current = (e.target as HTMLElement).closest?.(NAV_ENTRY) as HTMLElement | null;
        if (!current || current.tabIndex === 0) return;
        focusKey = current.getAttribute('data-nav-key') ?? '';
        applyRoving();
    }

    return { applyRoving, focusEntry, entryByKey, onKeydown, onFocusin };
}
