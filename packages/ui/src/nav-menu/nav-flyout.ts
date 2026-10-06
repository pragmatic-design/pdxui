// The flyout of a collapsed pdx-nav-menu.
//
// `collapsed` hides every label and does not build a group's children in place, so in an 80px rail
// a second level needs another way in. The flyout is the group opened BESIDE its icon: a heading
// with the parent's label, and the children with theirs. On <body>, fixed, and placed only after it
// is styled — measured before, a block there is as wide as the body. Never hidden while measured:
// see `open`.

import type { NavMenuItem } from './pdx-nav-menu';
import { NAV_ENTRY } from './nav-keys';

export interface NavFlyoutHost {
    /** The menu's id prefix, for the flyout's id and the entry's `aria-controls`. */
    uid: string;
    /** Draw entries WITH their labels into a container — the menu is collapsed, the flyout is not. */
    build(items: NavMenuItem[], container: HTMLElement): void;
    entryByKey(key: string): HTMLElement | null;
    focusEntry(el: HTMLElement): void;
}

export interface NavFlyout {
    id(key: string): string;
    open(anchor: HTMLElement, item: NavMenuItem): void;
    /** `returnFocus`: Escape and ArrowLeft put the focus back on the entry that opened it. */
    close(returnFocus: boolean): void;
    isOpen(): boolean;
    isOpenFor(key: string): boolean;
    focusFirst(): void;
    /** Focus the entry with this key inside the open flyout. */
    focusKey(key: string): void;
    /** The group open now, and the key of the entry in it that holds the focus — or null. */
    focused(): { group: string; key: string } | null;
    /** Focus an entry of the menu without its focus opening the flyout again. */
    giveBack(anchor: HTMLElement): void;
    scheduleClose(): void;
    /** While the focus is handed back to the entry, its focus must not open the flyout again. */
    returningFocus(): boolean;
}

export function createNavFlyout(host: NavFlyoutHost): NavFlyout {
    let el: HTMLElement | null = null;
    let openKey = '';
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    let returning = false;

    const id = (key: string): string => `${host.uid}-flyout-${key}`;

    function cancelClose(): void {
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    }

    function scheduleClose(): void {
        cancelClose();
        closeTimer = setTimeout(() => close(false), 200);
    }

    /** A press or the focus anywhere but the flyout and the entry that opened it ends it. */
    function onOutside(e: Event): void {
        const t = e.target as Node;
        if (el?.contains(t)) return;
        if (host.entryByKey(openKey)?.contains(t)) return;
        close(false);
    }

    function onKeydown(e: KeyboardEvent): void {
        if (!el) return;
        const entries = [...el.querySelectorAll<HTMLElement>(NAV_ENTRY)]
            .filter((x) => x.getAttribute('aria-disabled') !== 'true');
        const current = (e.target as HTMLElement).closest?.(NAV_ENTRY) as HTMLElement | null;
        const at = current ? entries.indexOf(current) : -1;
        switch (e.key) {
            case 'ArrowDown': entries[Math.min(at + 1, entries.length - 1)]?.focus(); break;
            case 'ArrowUp': entries[Math.max(at - 1, 0)]?.focus(); break;
            case 'Home': entries[0]?.focus(); break;
            case 'End': entries[entries.length - 1]?.focus(); break;
            case 'Escape':
            case 'ArrowLeft':
                close(true);
                break;
            case ' ':
                if (current?.localName !== 'a') return;
                current.click();
                break;
            default:
                return;
        }
        e.preventDefault();
        e.stopPropagation();
    }

    function open(anchor: HTMLElement, item: NavMenuItem): void {
        cancelClose();
        if (openKey === item.key && el) return;
        close(false);

        const fly = document.createElement('div');
        fly.className = 'pdx-nav-flyout pdx-nav';
        fly.id = id(item.key);
        fly.setAttribute('role', 'group');
        fly.setAttribute('aria-label', item.label);
        const title = document.createElement('div');
        title.className = 'pdx-nav-flyout-title pdx-nav-heading';
        title.textContent = item.label;
        fly.appendChild(title);
        host.build(item.children ?? [], fly);
        // Reached by ArrowRight from the entry, not by Tab: the menu stays ONE Tab stop.
        for (const e of fly.querySelectorAll<HTMLElement>(NAV_ENTRY)) e.tabIndex = -1;

        // Fixed BEFORE it is measured, and never hidden to be measured: nothing paints inside this
        // task, so there is no flash to hide — and `.pdx-nav-item` transitions `all`, so entries shown
        // from `visibility: hidden` still compute `hidden` in this task and drop the focus() that
        // ArrowRight gives the first of them right after.
        fly.style.position = 'fixed';
        document.body.appendChild(fly);
        const a = anchor.getBoundingClientRect();
        const f = fly.getBoundingClientRect();
        let left = a.right + 4;
        if (left + f.width > window.innerWidth - 8) left = Math.max(8, a.left - f.width - 4);
        let top = a.top;
        if (top + f.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - f.height - 8);
        fly.style.left = left + 'px';
        fly.style.top = top + 'px';

        fly.addEventListener('keydown', onKeydown);        fly.addEventListener('pointerenter', cancelClose);
        fly.addEventListener('pointerleave', scheduleClose);
        el = fly;
        openKey = item.key;
        anchor.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', onOutside, true);
        document.addEventListener('focusin', onOutside, true);
    }

    function close(returnFocus: boolean): void {
        cancelClose();
        if (!el) return;
        const key = openKey;
        el.remove();
        el = null;
        openKey = '';
        document.removeEventListener('pointerdown', onOutside, true);
        document.removeEventListener('focusin', onOutside, true);
        const anchor = host.entryByKey(key);
        anchor?.setAttribute('aria-expanded', 'false');
        if (returnFocus && anchor) giveBack(anchor);
    }

    function giveBack(anchor: HTMLElement): void {
        returning = true;
        host.focusEntry(anchor);
        returning = false;
    }

    function focusFirst(): void {
        el?.querySelector<HTMLElement>(`:is(${NAV_ENTRY}):not([aria-disabled="true"])`)?.focus();
    }

    function focusKey(key: string): void {
        el?.querySelector<HTMLElement>(`:is(${NAV_ENTRY})[data-nav-key="${CSS.escape(key)}"]`)?.focus();
    }

    function focused(): { group: string; key: string } | null {
        const active = document.activeElement;
        if (!el || !active || !el.contains(active)) return null;
        const key = (active as HTMLElement).closest?.(NAV_ENTRY)?.getAttribute('data-nav-key');
        return key ? { group: openKey, key } : null;
    }

    return {
        id,
        open,
        close,
        isOpen: () => el !== null,
        isOpenFor: (key) => el !== null && openKey === key,
        focusFirst,
        focusKey,
        focused,
        giveBack,
        scheduleClose,
        returningFocus: () => returning,
    };
}
