// Grid menu — the small menus the grid opens from one of its buttons: the inline filter's operators
// and the toolbar's "+ Add Filter" columns.
//
// Div items with a click handler would be reachable only with a mouse: no role, no tab stop, no
// keys, and no Escape to close them. These follow the pattern the library's other menus
// follow (pdx-split-button): role="menu", focusGroup for the arrows, Home/End, type-ahead and
// Enter/Space, Escape back to the button, a click outside to close.

import { focusGroup, sanitizeUrl } from '@pdxui/core';
import type { Dispose } from '@pdxui/core';

/** `pdx-icon` the first time a menu item names an icon: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}

export interface GridMenuItem {
    label: string;
    /** The current choice of a menuitemradio menu. */
    checked?: boolean;
    /** pdx-icon name, drawn before the label. */
    icon?: string;
    /** Destructive styling. */
    danger?: boolean;
    /**
     * Makes the entry a LINK rather than a button, and that is not cosmetic: an item that calls
     * `window.open` cannot be middle-clicked, cannot be copied, and announces itself as a button.
     * The URL goes through `sanitizeUrl`, so a `javascript:` value from a server does not become a
     * link that runs it.
     */
    href?: string;
    /** `_blank` and the like; `rel="noopener"` travels with it. */
    target?: string;
    /**
     * The entry exists and this caller may not use it. `aria-disabled`, never the `disabled`
     * property: a disabled control leaves the tab order and takes its reason with it
     * (pdx-bulk-actions.ts:44). Selecting it does nothing and leaves the menu open, so the reason
     * stays readable.
     */
    disabled?: boolean;
    /** Why, read out with the entry. */
    disabledReason?: string;
    /** What it does. A link does not need one. */
    select?(): void;
}

export interface GridMenuOptions {
    /** The menu's accessible name. */
    label: string;
    /** `menuitemradio` items (one of them checked) instead of `menuitem`. */
    radio?: boolean;
    menuClass: string;
    itemClass: string;
    /** A title drawn above the items. The menu's name already says it: it is hidden from the tree. */
    title?: HTMLElement;
    /** Place the menu, already in the document, next to the button. */
    place(menu: HTMLElement, anchor: DOMRect): void;
}

/** Off screen, and reachable: the same block `pdx-bulk-actions` writes for the same reason. */
const HIDDEN_STYLE = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;'
    + 'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';

/** One per menu on the page, so two menus' reasons cannot share an id. */
let menuSeq = 0;

let openMenu: { anchor: HTMLElement; close(returnFocus: boolean): void } | null = null;

/** Close the open grid menu, if any, leaving focus where it is. */
export function closeGridMenu(): void {
    openMenu?.close(false);
}

/**
 * Open a menu from `anchor`, or close it if it is already open from there. Focus goes to the checked
 * item, or the first. Picking an item closes the menu and returns focus to the button before the
 * item's action runs, so an action that opens something else can take it from there.
 */
export function openGridMenu(anchor: HTMLElement, items: GridMenuItem[], opts: GridMenuOptions): void {
    const wasOpenHere = openMenu?.anchor === anchor;
    closeGridMenu();
    if (wasOpenHere) return;

    const menu = document.createElement('div');
    menu.className = opts.menuClass;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', opts.label);
    if (opts.title) {
        opts.title.setAttribute('aria-hidden', 'true');
        menu.appendChild(opts.title);
    }

    const role = opts.radio ? 'menuitemradio' : 'menuitem';
    const menuId = `pdx-dg-menu-${++menuSeq}`;
    const reasonEls: HTMLElement[] = [];
    const itemEls = items.map((item, i) => {
        // A link is an <a>: the element is what a middle click, a copy and a screen reader go by.
        const el = document.createElement(item.href ? 'a' : 'div');
        el.className = opts.itemClass;
        // Written out where it is set: the manifest reads the roles there.
        el.setAttribute('role', opts.radio ? 'menuitemradio' : 'menuitem');
        el.tabIndex = -1;
        if (item.href) {
            (el as HTMLAnchorElement).href = sanitizeUrl(item.href) ?? '#';
            if (item.target) { (el as HTMLAnchorElement).target = item.target; (el as HTMLAnchorElement).rel = 'noopener'; }
        }
        if (item.icon) {
            loadIcon();
            const ic = document.createElement('pdx-icon');
            ic.setAttribute('name', item.icon);
            ic.setAttribute('size', '15');
            el.appendChild(ic);
        }
        el.appendChild(document.createTextNode(item.label));
        if (item.danger) el.classList.add('pdx-dg-menu-danger');
        if (opts.radio) {
            el.setAttribute('aria-checked', String(!!item.checked));
            if (item.checked) el.classList.add('active');
        }
        if (item.disabled) {
            el.setAttribute('aria-disabled', 'true');
            if (item.disabledReason) {
                const why = document.createElement('span');
                why.id = `${menuId}-${i}-why`;
                why.setAttribute('style', HIDDEN_STYLE);
                why.textContent = item.disabledReason;
                // Beside the menu, not inside it: a `role="menu"` owns menu items, and a span in
                // there is a child axe reports as not allowed. It leaves with the menu.
                reasonEls.push(why);
                document.body.appendChild(why);
                el.setAttribute('aria-describedby', why.id);
            }
        }
        el.addEventListener('click', (e) => {
            // The mark is `aria-disabled`, so the click arrives. Refusing it here is what makes it
            // true rather than decorative — and the menu stays open, so the reason stays readable.
            if (item.disabled) { e.preventDefault(); return; }
            close(true);
            item.select?.();
        });
        menu.appendChild(el);
        return el;
    });

    menu.style.position = 'fixed';
    menu.style.zIndex = '1000';
    document.body.appendChild(menu);
    opts.place(menu, anchor.getBoundingClientRect());

    const disposeGroup: Dispose = focusGroup(menu, {
        selector: `[role="${role}"]`,
        orientation: 'vertical',
        wrap: true,
        typeAhead: true,
    });

    function onKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close(true);
        } else if (e.key === 'Tab') {
            // The menu is not a tab stop: Tab leaves it from the button, to the button's neighbour.
            close(true);
        }
    }

    function onPointerDownOutside(e: PointerEvent): void {
        const target = e.target as Node;
        // The button's own click toggles the menu: leave that to it.
        if (menu.contains(target) || anchor.contains(target)) return;
        close(false);
    }

    function close(returnFocus: boolean): void {
        if (openMenu?.anchor !== anchor) return;
        openMenu = null;
        disposeGroup();
        menu.removeEventListener('keydown', onKeydown);
        document.removeEventListener('pointerdown', onPointerDownOutside, true);
        menu.remove();
        for (const el of reasonEls) el.remove();
        anchor.setAttribute('aria-expanded', 'false');
        if (returnFocus && anchor.isConnected) anchor.focus();
    }

    menu.addEventListener('keydown', onKeydown);
    document.addEventListener('pointerdown', onPointerDownOutside, true);
    anchor.setAttribute('aria-expanded', 'true');
    openMenu = { anchor, close };

    const start = itemEls.find(el => el.getAttribute('aria-checked') === 'true') ?? itemEls[0];
    for (const el of itemEls) el.tabIndex = el === start ? 0 : -1;
    start?.focus();
}
