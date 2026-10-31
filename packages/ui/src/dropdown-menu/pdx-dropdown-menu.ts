// pdx-dropdown-menu — Button trigger that opens a floating menu.
//
// The LIST is pdx-menu's. This component owns what a menu BUTTON is: the trigger, where
// the menu opens, opening and closing it, and where the focus goes. It builds no copy of the menu
// of its own — items, submenus, keys: two copies drift apart.

import '@pdxui/design/components/menu'; // the dropdown's rules live in the MENU's file
import '../menu/pdx-menu';
import { component, html, signal, onDestroy, generatedId, slot, snippetOrSlot, event } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import type { MenuItem } from '../menu/pdx-menu';
import { sanitizeSVG } from '../shared/sanitize';
import { anchorControl } from '../shared/anchor-control';
import { uiString, uiAttr} from '../shared/i18n';
import { warnMisshapenMenuItem } from '../shared/menu-item-shape';
import { onPressOutside } from '../shared/press-outside';

/** The pdx-menu this component opens: its props and its API, as the dropdown uses them. */
interface MenuHost extends HTMLElement {
    items: MenuItem[];
    open: boolean;
    minWidth: number;
    menuId: string;
    menuClass: string;
    renderItem: SlotFunction | null;
    closeSubmenu(): void;
}

/**
 * A button that opens a floating menu built from an `items` array, navigable from the keyboard and
 * closed by an outside click or Escape.
 *
 * @slot trigger - The menu button, when it is not this component's own: an avatar, a chip. The element
 *   placed here gets `aria-haspopup`, `aria-expanded`, `aria-controls` while open, the keys (click,
 *   ArrowDown/ArrowUp, and Enter/Space when it is not a native button) and the focus back on close.
 *   `label`, `icon`, `variant` and `size` are for the built-in button, and are ignored with it.
 * @slot item - Renders one menu entry: a snippet `item(item)`, or the scoped slot, which receives `{ item, key, type }` (`type` is the item's type, `'item'` when unset).
 */
component('pdx-dropdown-menu', {
    events: {
        /**
         * The menu opened (`true`) or closed (`false`): its open state, read-only (#288). The parent
         * never writes it, so it is not a model, and `::open` on it is an error.
         */
        'open-change': event<{ value: boolean }>(),
        /** An entry was chosen: the menu's own event, re-dispatched on this element. */
        'pdx-select': event<{ key: string; item: MenuItem }>(),
        /** A checkbox or radio entry changed: the menu's own event, re-dispatched on this element. */
        'pdx-check': event<{ key: string; checked: boolean; radioGroup?: string; item: MenuItem }>(),
    },
    // On the host as a custom state (#132, #288).
    states: ['open'],
    // The built-in menu button. A `trigger` slot's element is the author's, and the menu is
    // pdx-menu's, with its own parts.
    parts: ['trigger'],
    props: {
        items: { type: Array, default: [] },
        label: { type: String, default: '' },
        variant: { type: String, default: 'outline' },
        size: { type: String, default: 'sm' },
        icon: { type: String, default: '', iconName: true },
        placement: { type: String, default: 'bottom-start' },
        disabled: { type: Boolean, default: false },
        minWidth: { type: Number, default: 200 },
    },
    // The item a snippet receives is the app's, from `items` (#651): the editor infers `T`.
    generics: { T: { extends: '{ key?: string; label?: string; type?: string }', from: 'items' } },
    // A parent's `@snippet` sets these, positional arguments; the alpha scoped slot stays (#491).
    slots: {
        // pdx-menu's, which draws it: an entry or a submenu's, less what the menu draws itself.
        item: slot<(item: Exclude<T | (T extends { children?: readonly (infer C)[] } ? C | (C extends { children?: readonly (infer D)[] } ? D : never) : never), { type: 'separator' | 'label' | 'submenu' }>) => Node>(),
    },
    setup(ctx) {
        const _open = signal(false);
        const _menuId = generatedId('pdx-dropdown-menu');
        function getItemSlot(): SlotFunction | null {
            return snippetOrSlot(ctx, 'item', (s) => [s.item]) ?? null;
        }
        let _triggerEl: HTMLElement | null = null;
        /** True when the trigger is the author's (the `trigger` slot), not the button built here. */
        let _slotted = false;
        let _menuEl: MenuHost | null = null;
        let _scrollHandler: (() => void) | null = null;
        /** Removes the press-outside listener, added when the menu opens (#427). */
        let _outsideDispose: (() => void) | null = null;
        let _escHandler: ((e: KeyboardEvent) => void) | null = null;
        /** The element that had the focus when the menu opened: it gets it back on close. */
        let _returnFocus: HTMLElement | null = null;

        // ─── The menu ────────────────────────────────────────
        /**
         * A menu element for ONE opening: built in open(), removed in close(). Not in the document
         * while closed, so N dropdowns on a page leave no N panels on <body>; and a new one each
         * time, because a component taken out of the document is destroyed and remounts from its
         * props anyway (`PdxElement.disconnectedCallback`).
         */
        function buildMenu(): MenuHost {
            const menu = document.createElement('pdx-menu') as MenuHost;
            // The PANEL is the element that is role="menu" — the id, the min-width
            // and `.pdx-dropdown-menu-panel` are on it; this host only places it.
            menu.menuClass = 'pdx-dropdown-menu-panel';
            menu.menuId = _menuId;
            menu.minWidth = ctx.minWidth() as number;
            menu.renderItem = getItemSlot();
            menu.items = ctx.items() as MenuItem[];
            // Its events, as this element's: the menu lives on <body>, where a listener on the
            // dropdown would never hear them.
            // The details are written out field by field: the manifest reads an event's shape from
            // the object `emit` is given, and a forwarded `e.detail` has none it can read.
            menu.addEventListener('pdx-select', (e) => {
                e.stopPropagation();
                const d = (e as CustomEvent<{ key: string; item: MenuItem }>).detail;
                ctx.emit('pdx-select', { key: d.key, item: d.item });
            });
            menu.addEventListener('pdx-check', (e) => {
                e.stopPropagation();
                const d = (e as CustomEvent<{ key: string; checked: boolean; radioGroup?: string; item: MenuItem }>).detail;
                ctx.emit('pdx-check', { key: d.key, checked: d.checked, radioGroup: d.radioGroup, item: d.item });
            });
            // A chosen entry, and Escape inside it: the menu closes itself and says so with
            // `open-change` `{ value: false }` (#288); the dropdown takes it away.
            menu.addEventListener('open-change', (e) => {
                if (!(e as CustomEvent<{ value: boolean }>).detail.value) close();
            });
            return menu;
        }

        // ─── Open / Close ────────────────────────────────────
        /** `focus`: the item that takes focus — the first, or the last (ArrowUp on the trigger). */
        function open(focus: 'first' | 'last' = 'first'): void {
            if (_open.peek() || !_triggerEl) return;
            // Where the focus goes back on close: what had it now — an invoker that is not the trigger
            // (`command="--show"`), or the trigger itself — and the trigger when nothing had it.
            const before = document.activeElement;
            _returnFocus = before instanceof HTMLElement && before !== document.body ? before : null;
            _menuEl = buildMenu();
            _open.set(true);
            ctx.state('open', true);
            ctx.emit('open-change', { value: true });
            _triggerEl.setAttribute('aria-expanded', 'true');
            // Only while open: the menu leaves the document when it closes.
            _triggerEl.setAttribute('aria-controls', _menuId);

            _menuEl.open = true;
            // Hidden until it is placed with its real size, two frames on: placed now, it has none,
            // and an `end` placement would put it off the screen for those frames.
            _menuEl.style.visibility = 'hidden';
            document.body.appendChild(_menuEl);
            positionMenu();

            _scrollHandler = () => positionMenu();
            window.addEventListener('scroll', _scrollHandler, { capture: true, passive: true });
            window.addEventListener('resize', _scrollHandler, { passive: true });

            // pdx-menu puts the focus on its first item when it opens; the last is ours to ask for.
            // Two frames: the menu builds in one and focuses in the next.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                // Placed again now that the list is drawn: measured at append, it had no size yet.
                positionMenu();
                if (_menuEl) _menuEl.style.visibility = '';
                const enabled = _menuEl?.querySelectorAll<HTMLElement>(':scope > [role="menu"] > .pdx-menu-item:not([disabled])');
                // A reader who already moved to another entry keeps their place: pulled back, the
                // ArrowRight they pressed on a submenu's entry would land on another one. The
                // first entry is where pdx-menu's own opening puts the focus, so it is not a move; a
                // submenu is drawn on <body>, so being in one is.
                const active = document.activeElement;
                const moved = !!active && active !== enabled?.[0]
                    && (!!_menuEl?.contains(active) || !!active.closest?.('[data-submenu-key]'));
                if (moved) return;
                const target = enabled?.[focus === 'last' ? enabled.length - 1 : 0];
                if (target && _open.peek()) target.focus();
            }));

            // Click-outside
            _outsideDispose = onPressOutside({
                inside: (t) => !!(_triggerEl?.contains(t) || _menuEl?.contains(t) || (t as Element).closest?.('[data-submenu-key]')),
                outside: () => close(),
            });

            // Escape closes. Tab closes too (APG menu button) and is NOT prevented: close() puts focus
            // back on the trigger first, so the browser's Tab moves on from the menu button. Escape
            // inside an open SUBMENU is the submenu's: it closes that one and stays in the menu.
            _escHandler = (e: KeyboardEvent) => {
                const inSubmenu = (e.target as Element | null)?.closest?.('[data-submenu-key]');
                if (e.key === 'Escape' && !inSubmenu) { e.preventDefault(); e.stopPropagation(); close(); }
                else if (e.key === 'Tab') close();
            };
            document.addEventListener('keydown', _escHandler, true);
        }

        function close(): void {
            if (!_open.peek()) return;
            _open.set(false);

            if (_triggerEl) { _triggerEl.setAttribute('aria-expanded', 'false'); _triggerEl.removeAttribute('aria-controls'); }
            if (_menuEl) { _menuEl.closeSubmenu?.(); _menuEl.remove(); _menuEl = null; }
            _outsideDispose?.(); _outsideDispose = null;
            if (_escHandler) { document.removeEventListener('keydown', _escHandler, true); _escHandler = null; }
            if (_scrollHandler) { window.removeEventListener('scroll', _scrollHandler, true); window.removeEventListener('resize', _scrollHandler); _scrollHandler = null; }
            (_returnFocus?.isConnected ? _returnFocus : _triggerEl)?.focus();
            _returnFocus = null;
            ctx.state('open', false);
            ctx.emit('open-change', { value: false });
        }

        function toggle(): void {
            if (isDisabled()) return;
            _open.peek() ? close() : open();
        }

        function positionMenu(): void {
            if (!_triggerEl || !_menuEl) return;
            const tRect = _triggerEl.getBoundingClientRect();
            const placement = ctx.placement() as string;
            _menuEl.style.position = 'fixed';
            _menuEl.style.zIndex = '1000';

            // Measured hidden, and left as it was: still hidden while the opening places it.
            const shown = _menuEl.style.visibility;
            _menuEl.style.visibility = 'hidden';
            const mRect = _menuEl.getBoundingClientRect();
            _menuEl.style.visibility = shown;

            let top = 0, left = 0;
            if (placement.startsWith('bottom')) {
                top = tRect.bottom + 4;
                left = placement.includes('end') ? tRect.right - mRect.width : tRect.left;
            } else if (placement.startsWith('top')) {
                top = tRect.top - mRect.height - 4;
                left = placement.includes('end') ? tRect.right - mRect.width : tRect.left;
            }
            if (top + mRect.height > window.innerHeight - 8 && placement.startsWith('bottom')) top = tRect.top - mRect.height - 4;
            if (top < 8 && placement.startsWith('top')) top = tRect.bottom + 4;
            if (left + mRect.width > window.innerWidth - 8) left = window.innerWidth - mRect.width - 8;
            if (left < 8) left = 8;

            _menuEl.style.top = top + 'px';
            _menuEl.style.left = left + 'px';
        }

        // ─── Build once, then follow the props ───────────────
        let _built = false;
        ctx.track(() => {
            const items = ctx.items() as MenuItem[];
            const label = ctx.label() as string;
            const iconHtml = ctx.icon() as string;
            const variant = ctx.variant() as string;
            const size = ctx.size() as string;
            const disabled = ctx.disabled() as boolean;
            const minWidth = ctx.minWidth() as number;
            // A mis-shaped item is said when the items ARRIVE, not when the menu first opens: the
            // list is built on open, and a menu nobody opens would never warn.
            // Once per item object, shared with pdx-menu, so the opening does not say it again.
            for (const item of items) warnMisshapenMenuItem('pdx-dropdown-menu', item);

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    // The author's trigger, projected where the render's <slot> was. Without one the
                    // empty <slot> goes, so the default dropdown's DOM is the button alone, as before.
                    const slotted = ctx.el.querySelector<HTMLElement>(':scope > [slot="trigger"]');
                    ctx.el.querySelector(':scope > slot[name="trigger"]')?.remove();
                    if (slotted) {
                        _slotted = true;
                        _triggerEl = anchorControl(slotted);
                        adoptTrigger(_triggerEl, disabled);
                    } else {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.dataset.part = 'trigger';
                        button.className = `pdx-${variant}`;
                        if (size) button.setAttribute('size', size);
                        if (disabled) button.disabled = true;
                        _triggerEl = button;
                        updateTriggerLabel(label, iconHtml);
                        ctx.el.appendChild(button);
                    }
                    _triggerEl.setAttribute('aria-haspopup', 'menu');
                    _triggerEl.setAttribute('aria-expanded', 'false');
                    _triggerEl.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
                    _triggerEl.addEventListener('keydown', (e) => {
                        if (_open.peek() || isDisabled()) return;
                        if (e.key === 'ArrowDown') { e.preventDefault(); open('first'); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); open('last'); }
                        // A native button turns Enter and Space into a click; anything else does not.
                        else if (!isNativeButton(_triggerEl) && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault(); open('first');
                        }
                    });
                });
                return;
            }

            requestAnimationFrame(() => {
                if (_triggerEl && _slotted) {
                    setTriggerDisabled(_triggerEl, disabled);
                } else if (_triggerEl) {
                    (_triggerEl as HTMLButtonElement).disabled = disabled;
                    updateTriggerLabel(label, iconHtml);
                }
                if (_menuEl) {
                    _menuEl.minWidth = minWidth;
                    _menuEl.items = items;
                }
            });
        });

        function isDisabled(): boolean {
            return (ctx.disabled() as boolean) || (_triggerEl as HTMLButtonElement | null)?.disabled === true;
        }

        /** An author's element made into the menu button: a tab stop and a role when it has none. */
        function adoptTrigger(el: HTMLElement, disabled: boolean): void {
            if (!isNativeButton(el)) {
                if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
                if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
            }
            setTriggerDisabled(el, disabled);
        }

        function setTriggerDisabled(el: HTMLElement, disabled: boolean): void {
            if (isNativeButton(el)) { el.disabled = disabled; return; }
            if (disabled) el.setAttribute('aria-disabled', 'true');
            else el.removeAttribute('aria-disabled');
        }

        function updateTriggerLabel(label: string, iconProp: string): void {
            if (!_triggerEl) return;
            _triggerEl.innerHTML = '';
            // Icon: raw HTML (starts with '<') or an icon NAME → pdx-icon, loaded the first time one
            // is named: a dropdown with a text trigger never pays for the icon set.
            if (iconProp) {
                if (iconProp.startsWith('<')) {
                    const span = document.createElement('span');
                    span.className = 'pdx-menu-trigger-icon';
                    span.innerHTML = sanitizeSVG(iconProp);
                    _triggerEl.appendChild(span);
                } else {
                    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
                    const ic = document.createElement('pdx-icon');
                    ic.setAttribute('name', iconProp);
                    ic.setAttribute('size', '16');
                    _triggerEl.appendChild(ic);
                }
            }
            if (label) {
                _triggerEl.appendChild(document.createTextNode(' ' + label + ' '));
            } else if (iconProp) {
                uiAttr(_triggerEl, 'aria-label', () => uiString('dropdown-menu', 'label'));
            }
            // Chevron
            const chev = document.createElement('span');
            chev.className = 'pdx-dropdown-chevron';
            chev.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            _triggerEl.appendChild(chev);
        }

        // Teardown on DESTROY only: a track that read a prop would run this on the prop's change and
        // leave the menu dead.
        onDestroy(() => close());

        // The overlay verbs (#288): `open()` is `show()`, and the alpha handle `__dropdownMenu` is gone.
        ctx.expose({
            show() { open('first'); },
            close,
            toggle,
            get isOpen() { return _open() as boolean; },
        });
        return {};
    },
    // The trigger slot only: the menu itself is built on <body> when it opens.
    render: () => html`<slot name="trigger"></slot>`,
});

function isNativeButton(el: HTMLElement | null): el is HTMLButtonElement {
    return el instanceof HTMLButtonElement;
}

/** The item a snippet receives, the app's (#651): the editor infers it from `:items`. */
type T = { key?: string; label?: string; type?: string };
