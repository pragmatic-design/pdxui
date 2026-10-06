// pdx-split-button — Button with primary action + dropdown arrow for secondary actions.
// Left side: primary action (click). Right side: chevron that opens a dropdown menu.
// Reuses menu rendering pattern from pdx-dropdown-menu.

import { component, html, signal, focusGroup, onDestroy } from '@pdxui/core';
import type { Dispose } from '@pdxui/core';
import type { MenuItem } from '../menu/pdx-menu';
import { sanitizeSVG } from '../shared/sanitize';
import { uiString } from '../shared/i18n';
import { warnMisshapenMenuItem } from '../shared/menu-item-shape';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/split-button';
// Its menu items are `.pdx-menu-item`, drawn by menu.css — 25.6px tall instead of 32 without it.
import '@pdxui/design/components/menu';
/** `pdx-icon` the first time the button or an item names an icon: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}

/**
 * A primary action button with a dropdown arrow that opens the secondary actions.
 */
component('pdx-split-button', {
    props: {
        /** Primary button label */
        label: { type: String, default: '' },
        /** Primary button icon name */
        icon: { type: String, default: '' },
        /** Dropdown menu items */
        items: { type: Array, default: [] },
        /** Variant: primary, secondary, outline, ghost, danger */
        variant: { type: String, default: 'primary' },
        /** Size: xs, sm, md, lg */
        size: { type: String, default: 'sm' },
        /** Loading state (spinner on primary) */
        loading: { type: Boolean, default: false },
        /** Disable entire button */
        disabled: { type: Boolean, default: false },
        /** Accessible name for the dropdown trigger (chevron has no visible text). Empty: the
         *  split-button.menu component string, «More actions» in English. */
        menuLabel: { type: String, default: '' },
    },
    setup(ctx) {
        const _open = signal(false);
        let _built = false;
        let _panelEl: HTMLElement | null = null;
        let _primaryEl: HTMLButtonElement | null = null;
        let _arrowEl: HTMLButtonElement | null = null;
        let _outsideHandler: ((e: MouseEvent) => void) | null = null;
        let _escHandler: ((e: KeyboardEvent) => void) | null = null;
        let _focusDispose: Dispose | null = null;
        let _scrollHandler: (() => void) | null = null;

        /** The arrow's name: menuLabel, else split-button.menu. */
        const menuName = (): string => (ctx.menuLabel() as string) || uiString('split-button', 'menu');
        ctx.track(() => {
            const n = menuName();
            if (_arrowEl) _arrowEl.setAttribute('aria-label', n);
        });

        function buildMenuItems(items: MenuItem[], container: HTMLElement): void {
            container.innerHTML = '';
            for (const item of items) {
                warnMisshapenMenuItem('pdx-split-button', item);
                if (item.type === 'separator') {
                    const sep = document.createElement('hr');
                    sep.className = 'pdx-menu-sep';
                    container.appendChild(sep);
                    continue;
                }

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pdx-menu-item';
                if (item.danger) btn.classList.add('pdx-menu-danger');
                btn.setAttribute('role', 'menuitem');
                btn.setAttribute('data-menu-key', item.key);
                btn.disabled = !!item.disabled;
                if (item.lang) btn.lang = item.lang;

                if (item.icon) {
                    if (item.icon.startsWith('<')) {
                        const iconSpan = document.createElement('span');
                        iconSpan.className = 'pdx-menu-icon';
                        iconSpan.innerHTML = sanitizeSVG(item.icon);
                        btn.appendChild(iconSpan);
                    } else {
                        loadIcon();
                        const iconEl = document.createElement('pdx-icon');
                        iconEl.className = 'pdx-menu-icon';
                        iconEl.setAttribute('name', item.icon);
                        iconEl.setAttribute('size', '16');
                        btn.appendChild(iconEl);
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
                    ctx.emit('pdx-select', { key: item.key, item });
                    close();
                });

                container.appendChild(btn);
            }
        }

        function positionPanel(): void {
            if (!_panelEl) return;
            const btnRect = ctx.el.getBoundingClientRect();
            const panelRect = _panelEl.getBoundingClientRect();
            let finalLeft = btnRect.left;
            let finalTop = btnRect.bottom + 2;

            if (finalLeft + panelRect.width > window.innerWidth) finalLeft = window.innerWidth - panelRect.width - 4;
            if (finalTop + panelRect.height > window.innerHeight) finalTop = btnRect.top - panelRect.height - 2;

            _panelEl.style.left = finalLeft + 'px';
            _panelEl.style.top = finalTop + 'px';
        }

        /** The one place the open state changes, and the arrow's aria-expanded with it, so open()
         *  and close() never leave the attribute at its build-time 'false': a screen reader would
         *  hear an open menu as closed. */
        function setOpen(v: boolean): void {
            _open.set(v);
            _arrowEl?.setAttribute('aria-expanded', String(v));
        }

        function open(): void {
            if (_open.peek() || !_panelEl || !_arrowEl) return;
            setOpen(true);

            if (!_panelEl.isConnected) document.body.appendChild(_panelEl);

            const items = ctx.items() as MenuItem[];
            buildMenuItems(items, _panelEl);

            _panelEl.style.display = '';
            _panelEl.style.position = 'fixed';
            _panelEl.style.zIndex = '1000';
            _panelEl.style.minWidth = '160px';

            // Position below the split button
            const btnRect = ctx.el.getBoundingClientRect();
            _panelEl.style.visibility = 'hidden';
            _panelEl.style.left = btnRect.left + 'px';
            _panelEl.style.top = (btnRect.bottom + 2) + 'px';

            requestAnimationFrame(() => {
                if (!_panelEl) return;
                positionPanel();
                _panelEl!.style.visibility = '';

                const first = _panelEl!.querySelector('[role="menuitem"]:not(:disabled)') as HTMLElement;
                if (first) first.focus();

                if (_focusDispose) _focusDispose();
                _focusDispose = focusGroup(_panelEl!, {
                    orientation: 'vertical', wrap: true,
                    selector: '[role="menuitem"]:not(:disabled)',
                });
            });

            // Reposition on scroll/resize
            _scrollHandler = () => positionPanel();
            window.addEventListener('scroll', _scrollHandler, { capture: true, passive: true });
            window.addEventListener('resize', _scrollHandler, { passive: true });

            setTimeout(() => {
                _outsideHandler = (ev: MouseEvent) => {
                    if (ctx.el.contains(ev.target as Node) || _panelEl?.contains(ev.target as Node)) return;
                    close();
                };
                document.addEventListener('mousedown', _outsideHandler);
            }, 10);

            _escHandler = (ev: KeyboardEvent) => {
                if (ev.key === 'Escape') { ev.preventDefault(); close(); }
            };
            document.addEventListener('keydown', _escHandler, true);
        }

        function close(): void {
            if (!_open.peek()) return;
            setOpen(false);
            if (_panelEl) { _panelEl.style.display = 'none'; _panelEl.remove(); }
            if (_outsideHandler) { document.removeEventListener('mousedown', _outsideHandler); _outsideHandler = null; }
            if (_escHandler) { document.removeEventListener('keydown', _escHandler, true); _escHandler = null; }
            if (_scrollHandler) { window.removeEventListener('scroll', _scrollHandler, true); window.removeEventListener('resize', _scrollHandler); _scrollHandler = null; }
            if (_focusDispose) { _focusDispose(); _focusDispose = null; }
            _arrowEl?.focus();
        }

        function toggle(): void {
            _open.peek() ? close() : open();
        }

        // ─── Build ───────────────────────────────────────────
        ctx.track(() => {
            const label = ctx.label() as string;
            const iconName = ctx.icon() as string;
            const variant = ctx.variant() as string;
            const size = ctx.size() as string;
            const loading = ctx.loading() as boolean;
            const disabled = ctx.disabled() as boolean;

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-split-button');

                    const group = document.createElement('div');
                    group.className = 'pdx-split-button-group';

                    // Primary button
                    _primaryEl = document.createElement('button');
                    _primaryEl.type = 'button';
                    _primaryEl.className = `pdx-${variant} pdx-split-primary`;
                    if (size) _primaryEl.setAttribute('size', size);

                    if (iconName) {
                        loadIcon();
                        const iconEl = document.createElement('pdx-icon');
                        iconEl.setAttribute('name', iconName);
                        iconEl.setAttribute('size', size === 'xs' ? '14' : '16');
                        _primaryEl.appendChild(iconEl);
                    }

                    if (label) {
                        _primaryEl.appendChild(document.createTextNode(iconName ? ' ' + label : label));
                    }

                    _primaryEl.disabled = disabled || loading;
                    _primaryEl.addEventListener('click', () => {
                        if (disabled || loading) return;
                        ctx.emit('pdx-click', {});
                    });

                    group.appendChild(_primaryEl);

                    // Arrow/dropdown button
                    _arrowEl = document.createElement('button');
                    _arrowEl.type = 'button';
                    _arrowEl.className = `pdx-${variant} pdx-split-arrow`;
                    if (size) _arrowEl.setAttribute('size', size);
                    _arrowEl.setAttribute('aria-haspopup', 'menu');
                    _arrowEl.setAttribute('aria-expanded', 'false');
                    // Chevron-only trigger: needs an accessible name (WCAG 4.1.2 / axe button-name).
                    _arrowEl.setAttribute('aria-label', menuName());
                    _arrowEl.innerHTML = '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
                    _arrowEl.disabled = disabled;
                    _arrowEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (disabled) return;
                        toggle();
                    });

                    group.appendChild(_arrowEl);
                    ctx.el.appendChild(group);

                    // Dropdown panel — NOT attached to the body while closed: that left an orphan
                    // panel per instance, polluting document-wide selectors and leaking DOM.
                    // Attached in open(), removed in close()/onDestroy.
                    _panelEl = document.createElement('div');
                    _panelEl.className = 'pdx-split-button-panel pdx-menu';
                    _panelEl.setAttribute('role', 'menu');
                    _panelEl.style.display = 'none';
                });
                return;
            }

            // Update on prop changes
            requestAnimationFrame(() => {
                if (_primaryEl) _primaryEl.disabled = disabled || loading;
                if (_arrowEl) _arrowEl.disabled = disabled;
            });
        });

        // Teardown on DESTROY only, not in a track reading ctx.disabled(): toggling `disabled`
        // would re-run it and remove the panel for good (the build track is `if(!_built)` and
        // never rebuilds). Disabled state is handled by the build track above.
        onDestroy(() => {
            close();
            if (_panelEl) { _panelEl.remove(); _panelEl = null; }
        });

        return {};
    },
    render: () => html``,
});
