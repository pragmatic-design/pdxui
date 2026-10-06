// pdx-context-menu — Right-click context menu with cursor-following positioning.
// Wraps target content. Right-click (or long-press mobile) opens a floating menu at cursor.
// Items support icons, shortcuts, submenus, checkbox/radio, disabled, danger.
// Dynamic items: pass a function to generate items based on the clicked target.

import { component, html, signal, focusGroup, onDestroy } from '@pdxui/core';
import type { Dispose, SlotFunction } from '@pdxui/core';
import type { MenuItem } from '../menu/pdx-menu';
import { sanitizeSVG } from '../shared/sanitize';
import { uiString, uiAttr} from '../shared/i18n';
import { warnMisshapenMenuItem } from '../shared/menu-item-shape';
// Its items are `.pdx-menu-item`, drawn by menu.css: without it they would be styled only where some
// other component had brought the sheet.
import '@pdxui/design/components/menu';
/** `pdx-icon` the first time an item names an icon: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}

/**
 * A right-click menu that opens at the cursor, and also on a long press on mobile or Shift+F10 from
 * the keyboard.
 *
 * @slot item - Scoped — renders one menu entry. Receives `{ item, key, type }` (`type` is the item's type, `'item'` when unset).
 */
component('pdx-context-menu', {
    props: {
        /** Menu items (static array or function returning items) */
        items: { type: Array, default: [] },
        /** Disabled — prevents context menu from opening */
        disabled: { type: Boolean, default: false },
        /** Min width of the menu panel */
        minWidth: { type: Number, default: 180 },
    },
    setup(ctx) {
        const _open = signal(false);
        function getItemSlot(): SlotFunction | undefined {
            return (ctx as any).__slots?.['item'] as SlotFunction | undefined;
        }
        let _panelEl: HTMLElement | null = null;
        let _outsideHandler: ((e: MouseEvent) => void) | null = null;
        let _escHandler: ((e: KeyboardEvent) => void) | null = null;
        let _focusDispose: Dispose | null = null;
        let _scrollHandler: (() => void) | null = null;
        let _built = false;
        // The element focused inside the trigger area when the menu opened from the keyboard. Closing
        // hides the focused item, and focus would fall to <body>; it goes back here instead.
        let _opener: HTMLElement | null = null;

        // ─── Build menu items into container ─────────────────
        function buildMenuItems(items: MenuItem[], container: HTMLElement): void {
            container.innerHTML = '';
            for (const item of items) {
                warnMisshapenMenuItem('pdx-context-menu', item);
                if (item.type === 'separator') {
                    const sep = document.createElement('hr');
                    sep.className = 'pdx-menu-sep';
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
                if (item.className) btn.classList.add(item.className);
                btn.setAttribute('data-menu-key', item.key);
                btn.disabled = !!item.disabled;
                if (item.lang) btn.lang = item.lang;

                if (item.type === 'checkbox') {
                    btn.setAttribute('role', 'menuitemcheckbox');
                    btn.setAttribute('aria-checked', String(!!item.checked));
                } else if (item.type === 'radio') {
                    btn.setAttribute('role', 'menuitemradio');
                    btn.setAttribute('aria-checked', String(!!item.checked));
                } else {
                    btn.setAttribute('role', 'menuitem');
                }

                // Check indicator. EMPTY, and on every checkbox/radio item so the labels line up:
                // menu.css draws the tick from `aria-checked`, and a \u2713 written here as well would
                // be a second one.
                if (item.type === 'checkbox' || item.type === 'radio') {
                    const check = document.createElement('span');
                    check.className = 'pdx-menu-check';
                    btn.appendChild(check);
                }

                // Content: slot > default (icon + label + shortcut)
                const itemSlot = getItemSlot();
                if (itemSlot) {
                    const content = itemSlot({ item, key: item.key, type: item.type || 'item' });
                    btn.appendChild(content instanceof DocumentFragment ? content : content);
                } else {
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
                }

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    ctx.emit('pdx-select', { key: item.key, item });
                    close();
                });

                container.appendChild(btn);
            }
        }

        // ─── Open at cursor position ─────────────────────────
        function openAt(clientX: number, clientY: number): void {
            if (!_panelEl) return;
            _open.set(true);
            const focused = document.activeElement;
            _opener = focused instanceof HTMLElement && ctx.el.contains(focused) ? focused : null;

            const items = ctx.items() as MenuItem[];
            buildMenuItems(items, _panelEl);

            _panelEl.style.display = '';
            _panelEl.style.position = 'fixed';
            _panelEl.style.zIndex = '1020';
            _panelEl.style.minWidth = (ctx.minWidth() as number) + 'px';

            // Position at cursor, then flip if overflows viewport
            _panelEl.style.visibility = 'hidden';
            _panelEl.style.left = clientX + 'px';
            _panelEl.style.top = clientY + 'px';

            requestAnimationFrame(() => {
                if (!_panelEl) return;
                const rect = _panelEl.getBoundingClientRect();
                let finalX = clientX;
                let finalY = clientY;

                if (finalX + rect.width > window.innerWidth) finalX = window.innerWidth - rect.width - 4;
                if (finalY + rect.height > window.innerHeight) finalY = window.innerHeight - rect.height - 4;
                if (finalX < 0) finalX = 4;
                if (finalY < 0) finalY = 4;

                _panelEl!.style.left = finalX + 'px';
                _panelEl!.style.top = finalY + 'px';
                _panelEl!.style.visibility = '';

                // Focus first item
                const first = _panelEl!.querySelector('[role="menuitem"]:not(:disabled)') as HTMLElement;
                if (first) first.focus();

                // Focus group for keyboard nav
                if (_focusDispose) _focusDispose();
                _focusDispose = focusGroup(_panelEl!, {
                    orientation: 'vertical',
                    wrap: true,
                    selector: '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled), [role="menuitemradio"]:not(:disabled)',
                });
            });

            // Click outside → close
            setTimeout(() => {
                _outsideHandler = (ev: MouseEvent) => {
                    if (_panelEl && !_panelEl.contains(ev.target as Node)) close();
                };
                document.addEventListener('mousedown', _outsideHandler);
            }, 10);

            // Scroll/resize → close (cursor-following menu loses context after scroll)
            _scrollHandler = () => close();
            window.addEventListener('scroll', _scrollHandler, { capture: true, passive: true });
            window.addEventListener('resize', _scrollHandler, { passive: true });

            // Escape → close
            _escHandler = (ev: KeyboardEvent) => {
                if (ev.key === 'Escape') { ev.preventDefault(); close(); }
            };
            document.addEventListener('keydown', _escHandler, true);
        }

        function close(): void {
            if (!_open.peek()) return;
            _open.set(false);
            // Read before hiding: a hidden element loses focus. Only a menu that held focus gives it
            // back — a click elsewhere closes the menu and keeps focus where the user clicked.
            const hadFocus = !!_panelEl && _panelEl.contains(document.activeElement);
            if (_panelEl) _panelEl.style.display = 'none';
            if (hadFocus && _opener?.isConnected) _opener.focus();
            _opener = null;
            if (_outsideHandler) { document.removeEventListener('mousedown', _outsideHandler); _outsideHandler = null; }
            if (_escHandler) { document.removeEventListener('keydown', _escHandler, true); _escHandler = null; }
            if (_scrollHandler) { window.removeEventListener('scroll', _scrollHandler, true); window.removeEventListener('resize', _scrollHandler); _scrollHandler = null; }
            if (_focusDispose) { _focusDispose(); _focusDispose = null; }
        }

        function destroy(): void {
            close();
            if (_panelEl) {
                _panelEl.remove();
                _panelEl = null;
            }
        }

        // ─── Build ───────────────────────────────────────────
        // No reactive reads here → runs once. The handlers below read ctx.disabled() at event
        // time, so disabled changes take effect without re-running (and without tearing the
        // panel down, which a tracked `void ctx.disabled()` + `return destroy` would do).
        ctx.track(() => {
            if (!_built) {
                _built = true;
                requestAnimationFrame(() => {
                    ctx.el.style.display = 'contents';

                    // Create panel (appended to body for correct z-index)
                    _panelEl = document.createElement('div');
                    _panelEl.className = 'pdx-context-menu-panel pdx-menu';
                    _panelEl.setAttribute('role', 'menu');
                    uiAttr(_panelEl, 'aria-label', () => uiString('context-menu', 'label'));
                    _panelEl.style.display = 'none';
                    document.body.appendChild(_panelEl);

                    // Right-click handler — reads disabled() at event time, not closure time
                    ctx.el.addEventListener('contextmenu', (e: Event) => {
                        if (ctx.disabled()) return;
                        const me = e as MouseEvent;
                        me.preventDefault();
                        close();
                        openAt(me.clientX, me.clientY);
                    });

                    // Long-press for mobile (500ms)
                    let _longPressTimer: number | null = null;
                    let _longPressPos = { x: 0, y: 0 };
                    ctx.el.addEventListener('pointerdown', (e: Event) => {
                        if (ctx.disabled()) return;
                        const pe = e as PointerEvent;
                        if (pe.pointerType !== 'touch') return;
                        _longPressPos = { x: pe.clientX, y: pe.clientY };
                        _longPressTimer = window.setTimeout(() => {
                            openAt(_longPressPos.x, _longPressPos.y);
                        }, 500);
                    });
                    ctx.el.addEventListener('pointerup', () => {
                        if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
                    });
                    ctx.el.addEventListener('pointermove', (e: Event) => {
                        const pe = e as PointerEvent;
                        if (_longPressTimer && (Math.abs(pe.clientX - _longPressPos.x) > 10 || Math.abs(pe.clientY - _longPressPos.y) > 10)) {
                            clearTimeout(_longPressTimer); _longPressTimer = null;
                        }
                    });

                    // Keyboard triggers: Shift+F10 and the ContextMenu key, on a focusable element
                    // inside the area — an area with nothing focusable cannot be opened this way.
                    ctx.el.addEventListener('keydown', (e: Event) => {
                        if (ctx.disabled()) return;
                        const ke = e as KeyboardEvent;
                        if ((ke.key === 'F10' && ke.shiftKey) || ke.key === 'ContextMenu') {
                            ke.preventDefault();
                            const rect = (ke.target as HTMLElement).getBoundingClientRect();
                            openAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
                        }
                    });
                });
            }
        });

        // Teardown on destroy only (not on prop change).
        onDestroy(destroy);

        ctx.expose({ open: openAt, close });

        return {};
    },
    render: () => html`<slot></slot>`,
});
