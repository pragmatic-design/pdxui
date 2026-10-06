// pdx-menubar — Horizontal menu bar (File | Edit | View ...) with dropdown submenus.
// Supports: nested submenus, checkbox/radio items, icons, shortcuts, mega menu panels,
// Arrow L/R between top-level items, Arrow Down to open, full WAI-ARIA menubar pattern.

import { component, html, signal, focusGroup } from '@pdxui/core';
// A menubar is painted by menu.css — the rules are named after the MENU, not after this
// component, so the import is easy to miss, and without it a page that renders a menubar has to
// load the whole library to paint it.
import '@pdxui/design/components/menu';
/** `pdx-icon` the first time an item names an icon: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}
import type { Dispose } from '@pdxui/core';
import type { MenuItem } from '../menu/pdx-menu';
import { sanitizeSVG } from '../shared/sanitize';
import { uiString, uiAttr} from '../shared/i18n';
import { warnMisshapenMenuItem } from '../shared/menu-item-shape';

export interface MenubarItem {
    /** Unique key */
    key: string;
    /** Display label */
    label: string;
    /** Dropdown items (regular menu) */
    children?: MenuItem[];
    /** Mega menu: HTML content string for rich panel */
    mega?: boolean;
    /** Mega menu column groups */
    megaColumns?: MegaColumn[];
    /** Disabled */
    disabled?: boolean;
}

export interface MegaColumn {
    title: string;
    items: MenuItem[];
}

/**
 * A horizontal menu bar whose entries open dropdown submenus, as in File, Edit, View.
 */
component('pdx-menubar', {
    props: {
        /** Top-level menu items */
        items: { type: Array, default: [] },
        /** Open mode: 'click' (default) opens on a click, and then the pointer moves between menus
         *  while one is open, as a desktop menubar does; 'hover' opens on mouseenter alone. */
        trigger: { type: String, default: 'click' },
    },
    setup(ctx) {
        const _activeKey = signal('');
        let _barEl: HTMLElement | null = null;
        let _panelEl: HTMLElement | null = null;
        let _focusDispose: Dispose | null = null;
        let _panelFocusDispose: Dispose | null = null;
        let _outsideHandler: ((e: MouseEvent) => void) | null = null;
        let _escHandler: ((e: KeyboardEvent) => void) | null = null;
        // _hasOpened tracking removed (was declared but never read)
        let _activeSubmenuKey = '';
        let _subMenuCloseTimer: ReturnType<typeof setTimeout> | null = null;
        let _barLeaveTimer: ReturnType<typeof setTimeout> | null = null;
        let _mouseInPanel = false;
        let _scrollHandler: (() => void) | null = null;
        let _built = false;
        // The menu the pointer opened by arriving on its item. The click that follows the hover is
        // the same gesture: it must not close the menu the hover has just opened. Only a menu that
        // was open before the pointer arrived is closed by a click.
        let _hoverOpenedKey = '';

        function getItems(): MenubarItem[] {
            return ctx.items() as MenubarItem[];
        }

        // ─── Open a top-level menu ───────────────────────────
        /** `focus`: the entry that takes focus — the first, or the last (ArrowUp on the item). */
        function openMenu(key: string, focus: 'first' | 'last' = 'first'): void {
            const items = getItems();
            const item = items.find(i => i.key === key);
            if (!item || item.disabled) return;
            if (_activeKey.peek() === key) return;

            closeMenu(false);
            _activeKey.set(key);
            // _hasOpened = true; (removed: was never read)

            // Highlight trigger
            if (_barEl) {
                _barEl.querySelectorAll('.pdx-menubar-trigger').forEach(t => {
                    t.classList.toggle('active', t.getAttribute('data-menubar-key') === key);
                    t.setAttribute('aria-expanded', t.getAttribute('data-menubar-key') === key ? 'true' : 'false');
                });
            }

            // Build panel
            if (_panelEl) _panelEl.remove();
            _panelEl = document.createElement('div');
            _panelEl.className = 'pdx-menubar-panel' + (item.mega ? ' pdx-menubar-mega' : '');
            _panelEl.setAttribute('role', 'menu');
            _panelEl.style.position = 'fixed';
            _panelEl.style.zIndex = '1000';
            _panelEl.style.background = 'var(--pdx-color-surface)';
            _panelEl.style.border = '1px solid var(--pdx-color-border)';
            _panelEl.style.borderRadius = 'var(--pdx-radius-md)';
            _panelEl.style.boxShadow = 'var(--pdx-shadow-lg)';

            if (item.mega && item.megaColumns?.length) {
                buildMegaPanel(item.megaColumns, _panelEl);
            } else if (item.children?.length) {
                _panelEl.classList.add('pdx-menu');
                _panelEl.style.minWidth = '200px';
                buildMenuItems(item.children, _panelEl);
            }

            document.body.appendChild(_panelEl);
            positionPanel(key);

            // Reposition on scroll/resize
            if (_scrollHandler) { window.removeEventListener('scroll', _scrollHandler, true); window.removeEventListener('resize', _scrollHandler); }
            _scrollHandler = () => positionPanel(key);
            window.addEventListener('scroll', _scrollHandler, { capture: true, passive: true });
            window.addEventListener('resize', _scrollHandler, { passive: true });

            // Track mouse in panel (for hover close delay)
            _panelEl.addEventListener('mouseenter', () => {
                _mouseInPanel = true;
                if (_barLeaveTimer) { clearTimeout(_barLeaveTimer); _barLeaveTimer = null; }
            });
            _panelEl.addEventListener('mouseleave', () => {
                _mouseInPanel = false;
                // Close after leaving panel (unless re-entering bar)
                _barLeaveTimer = setTimeout(() => {
                    if (!_mouseInPanel && _activeKey.peek()) {
                        closeMenu(false);
                    }
                }, 150);
            });

            // Panel keyboard
            _panelEl.addEventListener('keydown', onPanelKeydown);

            // Focus group for panel items
            if (_panelFocusDispose) _panelFocusDispose();
            _panelFocusDispose = focusGroup(_panelEl, {
                selector: '.pdx-menu-item:not([disabled])',
                orientation: 'vertical',
                wrap: true,
                typeAhead: true,
                onSelect: (el) => el.click(),
            });

            // Focus the first item, or the last
            requestAnimationFrame(() => focusPanelEntry(focus));

            // Click-outside
            setTimeout(() => {
                _outsideHandler = (e: MouseEvent) => {
                    const t = e.target as Node;
                    if (_barEl?.contains(t) || _panelEl?.contains(t)) return;
                    // Check submenus
                    const subs = document.querySelectorAll('[data-submenu-key]');
                    for (const s of subs) { if (s.contains(t)) return; }
                    closeMenu(true);
                };
                document.addEventListener('mousedown', _outsideHandler);
            }, 10);

            // Escape
            _escHandler = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (_activeSubmenuKey) {
                        closeSubmenu();
                        const trigger = _panelEl?.querySelector(`[data-menu-key="${_activeSubmenuKey}"]`) as HTMLElement;
                        if (trigger) trigger.focus();
                    } else {
                        closeMenu(true);
                        // Refocus the bar trigger
                        const trigger = _barEl?.querySelector(`[data-menubar-key="${key}"]`) as HTMLElement;
                        if (trigger) trigger.focus();
                    }
                }
            };
            document.addEventListener('keydown', _escHandler, true);
        }

        function focusPanelEntry(which: 'first' | 'last'): void {
            const entries = _panelEl?.querySelectorAll<HTMLElement>('.pdx-menu-item:not([disabled])');
            entries?.[which === 'last' ? entries.length - 1 : 0]?.focus();
        }

        function closeMenu(_resetHasOpened: boolean): void {
            const prevKey = _activeKey.peek();
            if (!prevKey) return;
            _activeKey.set('');
            _hoverOpenedKey = '';
            closeSubmenu();
            _mouseInPanel = false;
            if (_barLeaveTimer) { clearTimeout(_barLeaveTimer); _barLeaveTimer = null; }

            if (_barEl) {
                _barEl.querySelectorAll('.pdx-menubar-trigger').forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-expanded', 'false');
                });
            }
            if (_panelEl) { _panelEl.remove(); _panelEl = null; }
            if (_panelFocusDispose) { _panelFocusDispose(); _panelFocusDispose = null; }
            if (_outsideHandler) { document.removeEventListener('mousedown', _outsideHandler); _outsideHandler = null; }
            if (_escHandler) { document.removeEventListener('keydown', _escHandler, true); _escHandler = null; }
            if (_scrollHandler) { window.removeEventListener('scroll', _scrollHandler, true); window.removeEventListener('resize', _scrollHandler); _scrollHandler = null; }
            // if (resetHasOpened) _hasOpened = false; (removed: was never read)
        }

        function positionPanel(key: string): void {
            if (!_barEl || !_panelEl) return;
            const trigger = _barEl.querySelector(`[data-menubar-key="${key}"]`) as HTMLElement;
            if (!trigger) return;
            const tRect = trigger.getBoundingClientRect();

            _panelEl.style.visibility = 'hidden';
            _panelEl.style.display = '';
            const mRect = _panelEl.getBoundingClientRect();
            _panelEl.style.visibility = '';

            let top = tRect.bottom + 2;
            let left = tRect.left;

            // Flip up if overflow
            if (top + mRect.height > window.innerHeight - 8) top = tRect.top - mRect.height - 2;
            // Clamp horizontal
            if (left + mRect.width > window.innerWidth - 8) left = window.innerWidth - mRect.width - 8;
            if (left < 8) left = 8;

            _panelEl.style.top = top + 'px';
            _panelEl.style.left = left + 'px';
        }

        // ─── Build menu items (shared with pdx-menu logic) ──
        function buildMenuItems(items: MenuItem[], container: HTMLElement): void {
            for (const item of items) {
                warnMisshapenMenuItem('pdx-menubar', item);
                if (item.type === 'separator') {
                    const sep = document.createElement('hr');
                    sep.className = 'pdx-menu-separator';
                    sep.setAttribute('role', 'separator');
                    container.appendChild(sep);
                    continue;
                }
                if (item.type === 'label') {
                    const lbl = document.createElement('div');
                    lbl.className = 'pdx-menu-label';
                    lbl.setAttribute('role', 'presentation');
                    lbl.textContent = item.label;
                    container.appendChild(lbl);
                    continue;
                }

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pdx-menu-item';
                if (item.danger) btn.classList.add('pdx-menu-danger');
                if (item.type === 'submenu') btn.classList.add('pdx-menu-sub');
                btn.setAttribute('data-menu-key', item.key);
                btn.disabled = !!item.disabled;
                if (item.lang) btn.lang = item.lang;

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

                // EMPTY: menu.css draws the tick from `aria-checked`, and a ✓ written here as well
                // would be a second one — «✓✓».
                if (item.type === 'checkbox' || item.type === 'radio') {
                    const check = document.createElement('span');
                    check.className = 'pdx-menu-check';
                    btn.appendChild(check);
                }

                if (item.icon) {
                    if (item.icon.startsWith('<')) {
                        const icon = document.createElement('span');
                        icon.className = 'pdx-menu-icon';
                        icon.innerHTML = sanitizeSVG(item.icon);
                        btn.appendChild(icon);
                    } else {
                        loadIcon();
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

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    if (item.type === 'checkbox') {
                        item.checked = !item.checked;
                        btn.setAttribute('aria-checked', String(item.checked));
                        ctx.emit('pdx-check', { key: item.key, checked: item.checked, item });
                    } else if (item.type === 'radio') {
                        if (item.radioGroup) {
                            container.querySelectorAll(`[data-radio-group="${item.radioGroup}"]`).forEach(el => {
                                el.setAttribute('aria-checked', 'false');
                            });
                        }
                        item.checked = true;
                        btn.setAttribute('aria-checked', 'true');
                        ctx.emit('pdx-check', { key: item.key, checked: true, radioGroup: item.radioGroup, item });
                    } else if (item.type !== 'submenu') {
                        ctx.emit('pdx-select', { key: item.key, item });
                        closeMenu(false); // keep _hasOpened so hover still works
                    } else if (item.children?.length) {
                        // A click, and Enter or Space through `focusGroup`, open it with the focus on
                        // its first item (APG), as hover and ArrowRight do.
                        openSubmenu(btn, item);
                        requestAnimationFrame(() => {
                            const sub = document.querySelector(`[data-submenu-key="${item.key}"]`);
                            const first = sub?.querySelector('.pdx-menu-item:not([disabled])') as HTMLElement | null;
                            if (first) first.focus();
                        });
                    }
                });

                if (item.type === 'submenu' && item.children?.length) {
                    btn.addEventListener('mouseenter', () => openSubmenu(btn, item));
                    btn.addEventListener('mouseleave', () => scheduleSubmenuClose(item.key));
                }

                container.appendChild(btn);
            }
        }

        // ─── Mega menu panel ─────────────────────────────────
        function buildMegaPanel(columns: MegaColumn[], container: HTMLElement): void {
            const grid = document.createElement('div');
            grid.className = 'pdx-mega-grid';
            for (const col of columns) {
                const colEl = document.createElement('div');
                colEl.className = 'pdx-mega-column';
                const title = document.createElement('div');
                title.className = 'pdx-menu-label';
                title.textContent = col.title;
                colEl.appendChild(title);
                buildMenuItems(col.items, colEl);
                grid.appendChild(colEl);
            }
            container.appendChild(grid);
        }

        // ─── Submenu management ──────────────────────────────
        function openSubmenu(triggerBtn: HTMLElement, item: MenuItem): void {
            if (_subMenuCloseTimer) { clearTimeout(_subMenuCloseTimer); _subMenuCloseTimer = null; }
            if (_activeSubmenuKey && _activeSubmenuKey !== item.key) closeSubmenu();
            if (_activeSubmenuKey === item.key) return;
            _activeSubmenuKey = item.key;

            triggerBtn.setAttribute('aria-expanded', 'true');
            triggerBtn.classList.add('active');

            const sub = document.createElement('div');
            sub.className = 'pdx-menu pdx-menu-sub-panel';
            sub.setAttribute('role', 'menu');
            sub.setAttribute('data-submenu-key', item.key);
            sub.style.minWidth = '160px';
            buildMenuItems(item.children!, sub);

            // Style before measuring so layout is correct
            sub.style.position = 'fixed';
            sub.style.visibility = 'hidden';
            sub.style.zIndex = '1010';
            sub.style.background = 'var(--pdx-color-surface)';
            sub.style.border = '1px solid var(--pdx-color-border)';
            sub.style.borderRadius = 'var(--pdx-radius-md)';
            sub.style.boxShadow = 'var(--pdx-shadow-lg)';
            document.body.appendChild(sub);

            const btnRect = triggerBtn.getBoundingClientRect();
            const subRect = sub.getBoundingClientRect();
            let left = btnRect.right + 2;
            let top = btnRect.top;
            if (left + subRect.width > window.innerWidth - 8) left = btnRect.left - subRect.width - 2;
            if (top + subRect.height > window.innerHeight - 8) top = window.innerHeight - subRect.height - 8;
            if (top < 8) top = 8;

            sub.style.left = left + 'px';
            sub.style.top = top + 'px';
            sub.style.visibility = '';

            sub.addEventListener('mouseenter', () => {
                if (_subMenuCloseTimer) { clearTimeout(_subMenuCloseTimer); _subMenuCloseTimer = null; }
            });
            sub.addEventListener('mouseleave', () => scheduleSubmenuClose(item.key));
            closeSubmenuOnArrowLeft(sub, triggerBtn);

            focusGroup(sub, {
                selector: '.pdx-menu-item:not([disabled])',
                orientation: 'vertical', wrap: true, typeAhead: true,
                onSelect: (el) => el.click(),
            });
        }

        /**
         * ArrowLeft in a submenu closes it and puts focus back on its item (APG). The submenu lives on
         * <body>, outside the panel whose keydown handler switches menus: without its own handler the
         * key does nothing and both menus stay open.
         */
        function closeSubmenuOnArrowLeft(sub: HTMLElement, triggerBtn: HTMLElement): void {
            sub.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key !== 'ArrowLeft') return;
                e.preventDefault();
                e.stopPropagation();
                closeSubmenu();
                triggerBtn.focus();
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
            // The focus inside the panel about to go goes back to its item: a close the pointer caused
            // would drop it to <body> (as in pdx-menu). A focus elsewhere is left where it is.
            const hadFocus = !!sub?.contains(document.activeElement);
            if (sub) sub.remove();
            if (_panelEl) {
                const trigger = _panelEl.querySelector(`[data-menu-key="${_activeSubmenuKey}"]`) as HTMLElement | null;
                if (trigger) {
                    trigger.setAttribute('aria-expanded', 'false');
                    trigger.classList.remove('active');
                    if (hadFocus) trigger.focus();
                }
            }
            _activeSubmenuKey = '';
        }

        // ─── Panel keyboard ─────────────────────────────────
        function onPanelKeydown(e: KeyboardEvent): void {
            const items = getItems();
            const currentKey = _activeKey.peek();
            const idx = items.findIndex(i => i.key === currentKey);

            // Arrow Left/Right: switch to adjacent top-level menu
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const prev = idx > 0 ? items[idx - 1] : items[items.length - 1];
                if (prev && !prev.disabled) openMenu(prev.key);
            } else if (e.key === 'ArrowRight') {
                // If on a submenu item, open it
                const focused = _panelEl?.querySelector('.pdx-menu-item:focus') as HTMLElement;
                if (focused?.classList.contains('pdx-menu-sub')) {
                    const key = focused.getAttribute('data-menu-key') || '';
                    const item = findItemDeep(items, key);
                    if (item?.children?.length) {
                        openSubmenu(focused, item);
                        requestAnimationFrame(() => {
                            const sub = document.querySelector(`[data-submenu-key="${key}"]`);
                            const first = sub?.querySelector('.pdx-menu-item:not([disabled])') as HTMLElement;
                            if (first) first.focus();
                        });
                        return;
                    }
                }
                e.preventDefault();
                const next = idx < items.length - 1 ? items[idx + 1] : items[0];
                if (next && !next.disabled) openMenu(next.key);
            }
        }

        function findItemDeep(items: MenubarItem[], key: string): MenuItem | null {
            for (const item of items) {
                if (item.children) {
                    for (const child of item.children) {
                        if (child.key === key) return child;
                        if (child.children) {
                            const found = findInChildren(child.children, key);
                            if (found) return found;
                        }
                    }
                }
            }
            return null;
        }

        function findInChildren(items: MenuItem[], key: string): MenuItem | null {
            for (const item of items) {
                if (item.key === key) return item;
                if (item.children) { const f = findInChildren(item.children, key); if (f) return f; }
            }
            return null;
        }

        // ─── Build bar ──────────────────────────────────────
        /** One top-level item of the bar. The build and the rebuild on `items` share it. */
        function makeTrigger(item: MenubarItem): HTMLButtonElement {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pdx-menubar-trigger';
            btn.setAttribute('role', 'menuitem');
            btn.setAttribute('data-menubar-key', item.key);
            btn.setAttribute('aria-haspopup', 'menu');
            btn.setAttribute('aria-expanded', 'false');
            btn.textContent = item.label;
            btn.disabled = !!item.disabled;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (_activeKey.peek() !== item.key) { openMenu(item.key); return; }
                // The click ending the hover that opened this menu keeps it open.
                if (_hoverOpenedKey === item.key) { _hoverOpenedKey = ''; return; }
                closeMenu(false);
            });

            // The pointer. In `hover` it opens a menu on its own; in `click` — the default — it only moves between menus while one is already open, so crossing the bar
            // on the way elsewhere opens nothing.
            btn.addEventListener('mouseenter', () => {
                if (_barLeaveTimer) { clearTimeout(_barLeaveTimer); _barLeaveTimer = null; }
                if (item.disabled) return;
                const hover = (ctx.trigger() as string) === 'hover';
                if (!hover && !_activeKey.peek()) return;
                if (_activeKey.peek() === item.key) { _hoverOpenedKey = ''; return; }
                openMenu(item.key);
                if (hover && _activeKey.peek() === item.key) _hoverOpenedKey = item.key;
            });

            // ArrowDown opens the menu on its first entry, ArrowUp on its last (APG menubar), besides
            // Enter and Space.
            btn.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                e.preventDefault();
                const which = e.key === 'ArrowUp' ? 'last' : 'first';
                if (_activeKey.peek() === item.key) focusPanelEntry(which);
                else openMenu(item.key, which);
            });

            return btn;
        }

        ctx.track(() => {
            const items = ctx.items() as MenubarItem[];

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-menubar');

                    _barEl = document.createElement('div');
                    _barEl.className = 'pdx-menubar-bar';
                    _barEl.setAttribute('role', 'menubar');
                    uiAttr(_barEl, 'aria-label', () => uiString('menubar', 'label'));

                    for (const item of items) _barEl.appendChild(makeTrigger(item));

                    ctx.el.appendChild(_barEl);

                    // Bar-level mouseleave: close with delay when mouse leaves bar area
                    _barEl.addEventListener('mouseleave', () => {
                        if ((ctx.trigger() as string) === 'hover' && _activeKey.peek()) {
                            _barLeaveTimer = setTimeout(() => {
                                if (_activeKey.peek() && !_mouseInPanel) {
                                    closeMenu(false);
                                }
                            }, 300);
                        }
                    });

                    // Focus group for bar triggers
                    _focusDispose = focusGroup(_barEl, {
                        selector: '.pdx-menubar-trigger:not([disabled])',
                        orientation: 'horizontal',
                        wrap: true,
                        onSelect: (el) => {
                            const key = el.getAttribute('data-menubar-key') || '';
                            if (_activeKey.peek() === key) closeMenu(true);
                            else openMenu(key);
                        },
                    });
                });
                return;
            }

            // Rebuild on items change
            requestAnimationFrame(() => {
                if (_barEl) {
                    _barEl.innerHTML = '';
                    for (const item of items) _barEl.appendChild(makeTrigger(item));
                }
            });
        });

        // Cleanup
        ctx.track(() => {
            void ctx.items();
            return () => {
                closeMenu(true);
                if (_focusDispose) { _focusDispose(); _focusDispose = null; }
            };
        });

        ctx.expose({
            /** Open one top-level menu by key, focusing its first item (its last with 'last'). A disabled or unknown key opens nothing. */
            openMenu,
            /** Close the open menu and any submenu under it. The boolean it takes is not read. */
            closeMenu,
        });
        // @deprecated legacy handle — the certification manifests still call host.__menubar.openMenu();
        // remove once they migrate to the flattened host.openMenu()/closeMenu().
        (ctx.el as any).__menubar = { openMenu, closeMenu };
        return {};
    },
    render: () => html``,
});
