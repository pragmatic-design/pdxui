// pdx-menu — Popup menu with items, submenus, checkbox/radio, keyboard nav, typeahead.
// Data-driven: pass `items` array. Auto-generates ARIA, keyboard nav, submenu positioning.
// Used by pdx-dropdown-menu and pdx-context-menu as the rendering engine.

import { component, html, signal, focusGroup } from '@pdxui/core';
import type { Dispose, SlotFunction } from '@pdxui/core';
import { sanitizeSVG } from '../shared/sanitize';
import { warnMisshapenMenuItem } from '../shared/menu-item-shape';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/menu';

export interface MenuItem {
    /** Unique key for the item */
    key: string;
    /** Display label */
    label: string;
    /** Item type */
    type?: 'item' | 'checkbox' | 'radio' | 'separator' | 'label' | 'submenu';
    /** Icon HTML or text (prepended) */
    icon?: string;
    /** Keyboard shortcut display text (e.g. "Ctrl+C") */
    shortcut?: string;
    /** Disabled state */
    disabled?: boolean;
    /** Danger/destructive styling */
    danger?: boolean;
    /** Checked state for checkbox/radio */
    checked?: boolean;
    /** Radio group name — items with same group are mutually exclusive */
    radioGroup?: string;
    /** Sub-menu items */
    children?: MenuItem[];
    /** Custom CSS class */
    className?: string;
    /**
     * The language the label is written in, when it is not the page's — a language picker's
     * «Italiano» — written as `lang` on the item so a screen reader pronounces it (WCAG 3.1.2).
     */
    lang?: string;
}

/**
 * A menu drawn in place from a list of items, with checkbox and radio items, submenus and keyboard
 * navigation, shown while it is open.
 *
 * @slot item - Scoped — renders one menu entry. Receives `{ item, key, type }` (`type` is the item's type, `'item'` when unset).
 */
component('pdx-menu', {
    props: {
        /** Menu items (data-driven) */
        items: { type: Array, default: [] },
        /** Open state */
        open: { type: Boolean, default: false },
        /** Minimum width */
        minWidth: { type: Number, default: 180 },
        /** The id of the element that is `role="menu"`, for a trigger's `aria-controls`. */
        menuId: { type: String, default: '' },
        /**
         * Classes added to the element that is `role="menu"`: the dropdown's panel is that element,
         * and `.pdx-dropdown-menu-panel` is what apps and the certification select it by.
         */
        menuClass: { type: String, default: '' },
        /**
         * Draws one entry, as the `item` slot does: `({ item, key, type }) => Node`. For a menu built
         * from script — `pdx-dropdown-menu` hands its own `item` slot on through it.
         */
        renderItem: { type: Function, default: null },
    },
    setup(ctx) {
        const _menuEl = signal<HTMLElement | null>(null);
        let _focusDispose: Dispose | null = null;
        let _subMenuCloseTimer: ReturnType<typeof setTimeout> | null = null;
        let _activeSubmenuKey = '';
        /** The items the menu on screen was drawn from: the same array again is no reason to rebuild. */
        let _builtFrom: MenuItem[] | null = null;
        let _scrollHandler: (() => void) | null = null;
        let _bound = false;

        // Slot — read lazily (_projectSlots runs after setup)
        function getItemSlot(): SlotFunction | undefined {
            return ((ctx as any).__slots?.['item'] ?? ctx.renderItem() ?? undefined) as SlotFunction | undefined;
        }

        // ─── Build menu DOM ──────────────────────────────────
        function buildMenu(items: MenuItem[], isSubmenu = false): HTMLElement {
            const menu = document.createElement('div');
            menu.className = 'pdx-menu' + (isSubmenu ? ' pdx-menu-sub-panel' : '');
            menu.setAttribute('role', 'menu');
            const menuId = ctx.menuId() as string;
            const menuClass = ctx.menuClass() as string;
            if (!isSubmenu) {
                if (menuId) menu.id = menuId;
                if (menuClass) menu.classList.add(...menuClass.split(/\s+/).filter(Boolean));
            }
            menu.style.minWidth = (ctx.minWidth() as number) + 'px';

            for (const item of items) {
                warnMisshapenMenuItem('pdx-menu', item);
                if (item.type === 'separator') {
                    const sep = document.createElement('hr');
                    sep.className = 'pdx-menu-separator';
                    sep.setAttribute('role', 'separator');
                    menu.appendChild(sep);
                    continue;
                }

                if (item.type === 'label') {
                    const lbl = document.createElement('div');
                    lbl.className = 'pdx-menu-label';
                    lbl.setAttribute('role', 'presentation');
                    lbl.textContent = item.label;
                    menu.appendChild(lbl);
                    continue;
                }

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pdx-menu-item';
                if (item.danger) btn.classList.add('pdx-menu-danger');
                if (item.className) btn.classList.add(item.className);
                if (item.type === 'submenu') btn.classList.add('pdx-menu-sub');
                btn.setAttribute('data-menu-key', item.key);
                btn.disabled = !!item.disabled;
                if (item.lang) btn.lang = item.lang;

                // ARIA role based on type
                if (item.type === 'checkbox') {
                    btn.setAttribute('role', 'menuitemcheckbox');
                    btn.setAttribute('aria-checked', String(!!item.checked));
                } else if (item.type === 'radio') {
                    btn.setAttribute('role', 'menuitemradio');
                    btn.setAttribute('aria-checked', String(!!item.checked));
                    if (item.radioGroup) btn.setAttribute('data-radio-group', item.radioGroup);
                } else {
                    btn.setAttribute('role', 'menuitem');
                }

                if (item.type === 'submenu' && item.children?.length) {
                    btn.setAttribute('aria-haspopup', 'menu');
                    btn.setAttribute('aria-expanded', 'false');
                }

                // Check indicator for checkbox/radio. EMPTY: menu.css draws the tick from
                // `aria-checked`, and a ✓ written here as well would be a second one — «✓✓».
                if (item.type === 'checkbox' || item.type === 'radio') {
                    const check = document.createElement('span');
                    check.className = 'pdx-menu-check';
                    btn.appendChild(check);
                }

                // Content: slot > default (icon + label + shortcut)
                const itemSlot = getItemSlot();
                if (itemSlot && item.type !== 'submenu') {
                    const content = itemSlot({ item, key: item.key, type: item.type || 'item' });
                    btn.appendChild(content instanceof DocumentFragment ? content : content);
                } else {
                    if (item.icon) {
                        // Raw SVG, or an icon NAME (`icon: 'copy'`). `pdx-icon` is loaded
                        // the first time a name is met: a menu of SVG icons never pays for it.
                        if (item.icon.startsWith('<')) {
                            const icon = document.createElement('span');
                            icon.className = 'pdx-menu-icon';
                            icon.innerHTML = sanitizeSVG(item.icon);
                            btn.appendChild(icon);
                        } else {
                            if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
                            const icon = document.createElement('pdx-icon');
                            icon.className = 'pdx-menu-icon';
                            icon.setAttribute('name', item.icon);
                            icon.setAttribute('size', '16');
                            btn.appendChild(icon);
                        }
                    }

                    const labelSpan = document.createElement('span');
                    labelSpan.className = 'pdx-menu-item-label';
                    labelSpan.textContent = item.label;
                    btn.appendChild(labelSpan);

                    if (item.shortcut) {
                        const sc = document.createElement('span');
                        sc.className = 'pdx-menu-shortcut';
                        sc.textContent = item.shortcut;
                        btn.appendChild(sc);
                    }
                }

                // Click handler. The item is read by KEY at the click: an array patched in place
                // leaves this button standing under a newer object than the one it was
                // drawn from, and the event must carry that one.
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const now = currentItem(item);
                    if (now.disabled) return;

                    if (now.type === 'checkbox') {
                        handleCheckbox(now, btn);
                    } else if (now.type === 'radio') {
                        handleRadio(now, btn, menu);
                    } else if (now.type === 'submenu') {
                        // A click, and Enter or Space through `focusGroup`'s onSelect, open it with the
                        // focus on its first item (APG), not only hover and ArrowRight.
                        if (now.children?.length) openSubmenuAndFocus(btn, now);
                    } else {
                        ctx.emit('pdx-select', { key: now.key, item: now });
                        closeAll();
                    }
                });

                // Submenu hover behavior
                if (item.type === 'submenu' && item.children?.length) {
                    btn.addEventListener('mouseenter', () => openSubmenu(btn, currentItem(item)));
                    btn.addEventListener('mouseleave', () => scheduleSubmenuClose(item.key));
                }

                menu.appendChild(btn);
            }

            return menu;
        }

        // ─── Checkbox toggle ─────────────────────────────────
        function handleCheckbox(item: MenuItem, btn: HTMLElement): void {
            item.checked = !item.checked;
            // The tick follows `aria-checked` in menu.css.
            btn.setAttribute('aria-checked', String(item.checked));
            ctx.emit('pdx-check', { key: item.key, checked: item.checked, item });
        }

        // ─── Radio toggle ────────────────────────────────────
        function handleRadio(item: MenuItem, btn: HTMLElement, menu: HTMLElement): void {
            // Uncheck siblings in same radio group
            if (item.radioGroup) {
                menu.querySelectorAll(`[data-radio-group="${item.radioGroup}"]`).forEach(el => {
                    el.setAttribute('aria-checked', 'false');
                });
            }
            item.checked = true;
            // The tick follows `aria-checked` in menu.css.
            btn.setAttribute('aria-checked', 'true');
            ctx.emit('pdx-check', { key: item.key, checked: true, radioGroup: item.radioGroup, item });
        }

        // ─── Submenu management ──────────────────────────────
        function openSubmenu(triggerBtn: HTMLElement, item: MenuItem): void {
            if (_subMenuCloseTimer) { clearTimeout(_subMenuCloseTimer); _subMenuCloseTimer = null; }

            // Close any other open submenu
            if (_activeSubmenuKey && _activeSubmenuKey !== item.key) {
                closeSubmenu();
            }

            if (_activeSubmenuKey === item.key) return;
            _activeSubmenuKey = item.key;

            triggerBtn.setAttribute('aria-expanded', 'true');
            triggerBtn.classList.add('active');

            const subPanel = buildMenu(item.children!, true);
            subPanel.setAttribute('data-submenu-key', item.key);

            // Position submenu to the right of trigger. Fixed and hidden BEFORE it is measured: in the
            // flow at the end of <body> it is a block as wide as the body, so the flip below would
            // always fire and open the submenu off the left edge of the screen.
            subPanel.style.position = 'fixed';
            subPanel.style.visibility = 'hidden';
            document.body.appendChild(subPanel);
            const btnRect = triggerBtn.getBoundingClientRect();
            const subRect = subPanel.getBoundingClientRect();
            let left = btnRect.right + 2;
            let top = btnRect.top;

            // Flip if overflows viewport right
            if (left + subRect.width > window.innerWidth - 8) {
                left = btnRect.left - subRect.width - 2;
            }
            // Clamp vertical
            if (top + subRect.height > window.innerHeight - 8) {
                top = window.innerHeight - subRect.height - 8;
            }
            if (top < 8) top = 8;

            subPanel.style.left = left + 'px';
            subPanel.style.top = top + 'px';
            subPanel.style.visibility = '';
            subPanel.style.zIndex = '1010';
            subPanel.style.background = 'var(--pdx-color-surface)';
            subPanel.style.border = '1px solid var(--pdx-color-border)';
            subPanel.style.borderRadius = 'var(--pdx-radius-md)';
            subPanel.style.boxShadow = 'var(--pdx-shadow-lg)';

            // Reposition submenu on scroll/resize
            if (_scrollHandler) { window.removeEventListener('scroll', _scrollHandler, true); window.removeEventListener('resize', _scrollHandler); }
            _scrollHandler = () => {
                const sub = document.querySelector(`[data-submenu-key="${item.key}"]`) as HTMLElement;
                if (!sub) return;
                const bRect = triggerBtn.getBoundingClientRect();
                const sRect = sub.getBoundingClientRect();
                let l = bRect.right + 2;
                let t = bRect.top;
                if (l + sRect.width > window.innerWidth - 8) l = bRect.left - sRect.width - 2;
                if (t + sRect.height > window.innerHeight - 8) t = window.innerHeight - sRect.height - 8;
                if (t < 8) t = 8;
                sub.style.left = l + 'px';
                sub.style.top = t + 'px';
            };
            window.addEventListener('scroll', _scrollHandler, { capture: true, passive: true });
            window.addEventListener('resize', _scrollHandler, { passive: true });

            // Keep submenu open when hovering it
            subPanel.addEventListener('mouseenter', () => {
                if (_subMenuCloseTimer) { clearTimeout(_subMenuCloseTimer); _subMenuCloseTimer = null; }
            });
            subPanel.addEventListener('mouseleave', () => scheduleSubmenuClose(item.key));
            // ArrowLeft and Escape close the submenu and return to its item (APG). The submenu lives
            // on <body>, outside the host whose keydown handler knows them, so it handles them here.
            // The item is looked up by KEY in the menu as it is now, not the button captured here:
            // a menu whose items were set again while the submenu was open has drawn new buttons,
            // and focusing the old, detached one sends the focus nowhere.
            subPanel.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'Escape') return;
                e.preventDefault();
                e.stopPropagation();
                closeSubmenu();
                const current = _menuEl()?.querySelector(`[data-menu-key="${item.key}"]`) as HTMLElement | null;
                (current ?? triggerBtn).focus();
            });

            // Focus group for submenu keyboard nav
            focusGroup(subPanel, {
                selector: '.pdx-menu-item:not([disabled])',
                orientation: 'vertical',
                wrap: true,
                typeAhead: true,
                onSelect: (el) => el.click(),
            });
        }

        /**
         * An opening's focus, on the first enabled entry — unless the reader moved into the menu, or
         * one of its submenus (on <body>), WHILE it opened: pulled back to the first entry, the
         * ArrowRight they pressed on a submenu's entry would land on another one. `before` is
         * the focus when the opening began; a focus left inside from an earlier opening is not a move.
         */
        function focusFirstUnlessMoved(menu: HTMLElement, before: Element | null): void {
            const active = document.activeElement;
            const moved = active !== before && !!active && (menu.contains(active) || !!active.closest?.('[data-submenu-key]'));
            if (moved) return;
            (menu.querySelector('.pdx-menu-item:not([disabled])') as HTMLElement | null)?.focus();
        }

        /**
         * Open a submenu and move the focus to its first enabled item — what ArrowRight, Enter and
         * Space do. Unless the reader moved into it before the frame: the first item would take the
         * focus back, and their Enter would pick it.
         */
        function openSubmenuAndFocus(triggerBtn: HTMLElement, item: MenuItem): void {
            const before = document.activeElement;
            openSubmenu(triggerBtn, item);
            requestAnimationFrame(() => {
                const sub = document.querySelector(`[data-submenu-key="${item.key}"]`) as HTMLElement | null;
                if (sub) focusFirstUnlessMoved(sub, before);
            });
        }

        function scheduleSubmenuClose(key: string): void {
            _subMenuCloseTimer = setTimeout(() => {
                if (_activeSubmenuKey === key) closeSubmenu();
            }, 150);
        }

        function closeSubmenu(): void {
            if (!_activeSubmenuKey) return;
            const sub = document.querySelector(`[data-submenu-key="${_activeSubmenuKey}"]`);
            // The focus inside the panel about to go goes back to its item. A close the POINTER
            // caused — leaving the submenu — moves no focus otherwise, and it falls to <body>, where the
            // menu's keys, Escape included, reach nobody. A focus elsewhere is left where it is.
            const hadFocus = !!sub?.contains(document.activeElement);
            if (sub) sub.remove();
            if (hadFocus) (_menuEl()?.querySelector(`[data-menu-key="${_activeSubmenuKey}"]`) as HTMLElement | null)?.focus();
            if (_scrollHandler) { window.removeEventListener('scroll', _scrollHandler, true); window.removeEventListener('resize', _scrollHandler); _scrollHandler = null; }
            // Reset trigger button state
            const menuEl = _menuEl();
            if (menuEl) {
                const trigger = menuEl.querySelector(`[data-menu-key="${_activeSubmenuKey}"]`);
                if (trigger) {
                    trigger.setAttribute('aria-expanded', 'false');
                    trigger.classList.remove('active');
                }
            }
            _activeSubmenuKey = '';
        }

        function closeAll(): void {
            closeSubmenu();
            ctx.emit('pdx-close', {}, { bubbles: false });
        }

        // ─── Arrow Right/Left for submenu keyboard nav ──────
        function onKeydown(e: KeyboardEvent): void {
            const menuEl = _menuEl();
            if (!menuEl) return;

            if (e.key === 'ArrowRight') {
                const focused = menuEl.querySelector('.pdx-menu-item:focus') as HTMLElement;
                if (focused?.classList.contains('pdx-menu-sub')) {
                    e.preventDefault();
                    const key = focused.getAttribute('data-menu-key') || '';
                    const items = ctx.items() as MenuItem[];
                    const item = findItem(items, key);
                    if (item?.children?.length) openSubmenuAndFocus(focused, item);
                }
            }

            if (e.key === 'ArrowLeft') {
                if (_activeSubmenuKey) {
                    e.preventDefault();
                    const key = _activeSubmenuKey;
                    closeSubmenu();
                    // Refocus the parent trigger
                    const trigger = menuEl.querySelector(`[data-menu-key="${key}"]`) as HTMLElement;
                    if (trigger) trigger.focus();
                }
            }

            if (e.key === 'Escape') {
                if (_activeSubmenuKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    const key = _activeSubmenuKey;
                    closeSubmenu();
                    const trigger = menuEl.querySelector(`[data-menu-key="${key}"]`) as HTMLElement;
                    if (trigger) trigger.focus();
                } else {
                    closeAll();
                }
            }
        }

        /** The object the menu holds for this item NOW: the newest array's, after a patch in place. */
        function currentItem(item: MenuItem): MenuItem {
            return (_builtFrom && findItem(_builtFrom, item.key)) || item;
        }

        // ─── Update in place ─────────────────────
        /**
         * Two arrays draw the same elements when only `checked`, `disabled` or a label differ: same
         * keys in the same order, same types, groups, icons, shortcuts, classes and languages, and
         * children of the same shape. A label drawn by the `item` slot is the slot's to draw, so with
         * a slot a changed label is a change of shape.
         */
        function sameShape(a: MenuItem[], b: MenuItem[], slotted: boolean): boolean {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                const x = a[i], y = b[i];
                if (x.key !== y.key || (x.type ?? 'item') !== (y.type ?? 'item') || x.radioGroup !== y.radioGroup
                    || x.icon !== y.icon || x.shortcut !== y.shortcut || !!x.danger !== !!y.danger
                    || x.className !== y.className || x.lang !== y.lang) return false;
                if (slotted && x.label !== y.label) return false;
                if (!sameShape(x.children ?? [], y.children ?? [], slotted)) return false;
            }
            return true;
        }

        /** Write what may change into the elements `buildMenu` drew, one element per item, in order. */
        function patchMenu(menu: HTMLElement, items: MenuItem[]): void {
            const nodes = menu.children;
            items.forEach((item, i) => {
                const node = nodes[i] as HTMLElement | undefined;
                if (!node || item.type === 'separator') return;
                if (item.type === 'label') { node.textContent = item.label; return; }
                (node as HTMLButtonElement).disabled = !!item.disabled;
                if (item.type === 'checkbox' || item.type === 'radio') node.setAttribute('aria-checked', String(!!item.checked));
                const label = node.querySelector(':scope > .pdx-menu-item-label');
                if (label) label.textContent = item.label;
            });
        }

        function findItem(items: MenuItem[], key: string): MenuItem | null {
            for (const item of items) {
                if (item.key === key) return item;
                if (item.children) {
                    const found = findItem(item.children, key);
                    if (found) return found;
                }
            }
            return null;
        }

        // ─── Main reactive track ─────────────────────────────
        ctx.track(() => {
            const items = ctx.items() as MenuItem[];
            const isOpen = ctx.open() as boolean;

            if (!_bound) {
                _bound = true;
                // ctx.frame, here and in the items track: a setup a move destroyed does not build
                // again.
                ctx.frame(() => {
                    if (!items.length) return;

                    const menu = buildMenu(items);
                    _builtFrom = items;
                    _menuEl.set(menu);
                    ctx.el.appendChild(menu);

                    // Keyboard handlers
                    ctx.el.addEventListener('keydown', onKeydown);

                    // Focus group for main menu
                    _focusDispose = focusGroup(menu, {
                        selector: '.pdx-menu-item:not([disabled])',
                        orientation: 'vertical',
                        wrap: true,
                        typeAhead: true,
                        onSelect: (el) => el.click(),
                    });

                    // Initial visibility
                    ctx.el.style.display = isOpen ? '' : 'none';

                    // Focus first item when opened
                    if (isOpen) {
                        const before = document.activeElement;
                        requestAnimationFrame(() => focusFirstUnlessMoved(menu, before));
                    }
                });
            }
        });

        // Teardown on destroy only, not the cleanup of the track above, which reads `open`: that
        // cleanup runs the first time `open` changes, would remove the arrow keys and the
        // Escape/ArrowRight handler, and the track builds nothing again — a menu opened after mount
        // could not be driven from the keyboard.
        ctx.track(() => () => {
            ctx.el.removeEventListener('keydown', onKeydown);
            if (_focusDispose) { _focusDispose(); _focusDispose = null; }
            closeSubmenu();
        });

        // React to open prop changes
        ctx.track(() => {
            const isOpen = ctx.open() as boolean;
            if (!_bound) return;

            const before = document.activeElement;
            requestAnimationFrame(() => {
                ctx.el.style.display = isOpen ? '' : 'none';
                if (isOpen) {
                    const menuEl = _menuEl();
                    if (menuEl) focusFirstUnlessMoved(menuEl, before);
                } else {
                    closeSubmenu();
                }
            });
        });

        // React to items changes (rebuild menu)
        ctx.track(() => {
            const items = ctx.items() as MenuItem[];
            if (!_bound || !items.length) return;

            ctx.frame(() => {
                // The menu on screen was drawn from these very items: nothing to rebuild. On mount both
                // tracks run in the same turn, and this one would build the menu a SECOND time from the
                // same array — under load, after a reader has already moved the focus into it.
                if (items === _builtFrom) return;
                const oldMenu = _menuEl();
                // Same keys, same shape: the elements under the pointer stay, and so does the focus.
                // A radio that moved is not a reason to draw the menu again.
                if (oldMenu && _builtFrom && sameShape(_builtFrom, items, !!getItemSlot())) {
                    patchMenu(oldMenu, items);
                    if (_activeSubmenuKey) {
                        const sub = document.querySelector<HTMLElement>(`[data-submenu-key="${_activeSubmenuKey}"]`);
                        const parent = findItem(items, _activeSubmenuKey);
                        if (sub && parent?.children) patchMenu(sub, parent.children);
                    }
                    _builtFrom = items;
                    return;
                }
                // The item holding the focus goes with the old menu: its key comes back in the new one.
                // A rebuild under an open menu would drop the focus to <body>, where Escape reaches
                // nobody — the same lookup by key the submenu's return makes.
                const focusedKey = oldMenu?.contains(document.activeElement)
                    ? (document.activeElement as HTMLElement).getAttribute('data-menu-key')
                    : null;
                if (oldMenu) oldMenu.remove();
                if (_focusDispose) { _focusDispose(); _focusDispose = null; }

                const menu = buildMenu(items);
                _builtFrom = items;
                _menuEl.set(menu);
                ctx.el.appendChild(menu);
                if (focusedKey) (menu.querySelector(`[data-menu-key="${focusedKey}"]`) as HTMLElement | null)?.focus();

                _focusDispose = focusGroup(menu, {
                    selector: '.pdx-menu-item:not([disabled])',
                    orientation: 'vertical',
                    wrap: true,
                    typeAhead: true,
                    onSelect: (el) => el.click(),
                });
            });
        });

        // Expose API
        ctx.expose({
            /** Close the submenu and emit `pdx-close` on the menu itself. */
            closeAll,
            /** Close only the open submenu, leaving the menu itself open. */
            closeSubmenu,
        });

        return {};
    },
    render: () => html``,
});
