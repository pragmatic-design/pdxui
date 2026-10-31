// pdx-fab — Floating Action Button with advanced Speed Dial.
// Supports: direction (up/down/left/right), type (linear/circle/semi-circle/quarter-circle),
// tooltip labels, mask overlay, trigger (click/hover), animation stagger.

import { component, html, signal, event } from '@pdxui/core';
import { uiString } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/fab';
import '../icon/pdx-icon'; // rendered by this component, and registered by nobody else
// The icons it draws whatever its data, on the page with it rather than loaded a frame late (#47).
import { defineIcons } from '../icon/icon-map';
import iconPlus from '../icon/pragmatic/plus';
defineIcons({ plus: iconPlus });

export interface FabAction {
    key: string;
    label: string;
    icon: string;
}

/**
 * A floating action button that can open a speed dial of actions, in four directions and four layouts.
 */
component('pdx-fab', {
    events: {
        /**
         * The speed dial opened (`true`) or closed (`false`): its open state, read-only (#288). The
         * parent never writes it, so it is not a model, and `::open` on it is an error.
         */
        'open-change': event<{ value: boolean }>(),
        /** The button was pressed, on a FAB with no speed dial. */
        'pdx-click': event<Record<string, never>>(),
        /** An action of the speed dial was chosen. */
        'pdx-select': event<{ key: string; action: FabAction }>(),
    },
    // On the host as a custom state (#132, #288): fab.css draws the open dial, the turned icon and the
    // mask from it.
    states: ['open'],
    // The main button, the speed dial, an action, its label and the mask.
    parts: ['root', 'menu', 'item', 'label', 'mask'],
    // The axes fab.css keys by (#630), reflected on the host; a variant and a size map the class that
    // draws the same button on native markup. The position places the host itself.
    variants: {
        /** primary (the default), secondary or danger. */
        variant: { primary: '.pdx-fab-primary', secondary: '.pdx-fab-secondary', danger: '.pdx-fab-danger' },
        /** sm, md (the default) or lg. */
        size: { md: '.pdx-fab-md', sm: '.pdx-fab-sm', lg: '.pdx-fab-lg' },
        /** bottom-right (the default), bottom-left, top-right or top-left. */
        position: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
    },
    props: {
        /** Main button icon name */
        icon: { type: String, default: 'plus', iconName: true },
        /** Main button label (screen reader). Empty: the fab.label component string, «Actions». */
        label: { type: String, default: '' },
        /** Speed dial actions */
        actions: { type: Array, default: [] },
        /** Speed dial direction: up (default), down, left, right */
        direction: { type: String, default: 'up' },
        /** Speed dial layout: linear (default), circle, semi-circle, quarter-circle */
        type: { type: String, default: 'linear' },
        /** Show tooltip labels next to actions */
        showTooltip: { type: Boolean, default: true },
        /** Show mask overlay when open */
        mask: { type: Boolean, default: false },
        /** Trigger mode: click (default), hover */
        trigger: { type: String, default: 'click' },
    },
    setup(ctx) {
        const _open = signal(false);
        let _built = false;
        let _maskEl: HTMLElement | null = null;
        let _hoverCloseTimer: number | null = null;

        // Position circular actions relative to FAB button center
        function positionCircularActions(direction: string, layoutType: string): void {
            const fabBtn = ctx.el.querySelector('.pdx-fab') as HTMLElement;
            const dial = ctx.el.querySelector('.pdx-fab-dial') as HTMLElement;
            if (!fabBtn || !dial) return;

            const btnEls = Array.from(dial.querySelectorAll('.pdx-fab-action-wrap')) as HTMLElement[];
            if (!btnEls.length) return;

            const count = btnEls.length;
            const radius = 70;
            const btnSize = 40; // action button size
            const fabSize = fabBtn.offsetWidth || 56;

            // Angles in degrees (0 = right, 90 = down, -90 = up, 180 = left)
            let startAngle: number;
            let endAngle: number;

            if (layoutType === 'semi-circle') {
                // Full 180° arc centered on the direction
                if (direction === 'up') { startAngle = -180; endAngle = 0; }
                else if (direction === 'down') { startAngle = 0; endAngle = 180; }
                else if (direction === 'left') { startAngle = 90; endAngle = 270; }
                else { startAngle = -90; endAngle = 90; } // right
            } else if (layoutType === 'quarter-circle') {
                // 90° arc — one quadrant of the Cartesian plane centered on FAB
                // Supports compound directions: up-left, up-right, down-left, down-right
                // Fallback: up→up-left, down→down-right, left→down-left, right→up-right
                if (direction === 'up-left' || direction === 'up') { startAngle = -180; endAngle = -90; }
                else if (direction === 'up-right' || direction === 'right') { startAngle = -90; endAngle = 0; }
                else if (direction === 'down-right' || direction === 'down') { startAngle = 0; endAngle = 90; }
                else { startAngle = 90; endAngle = 180; } // down-left / left
            } else {
                // Full circle — evenly spaced
                startAngle = 0; endAngle = 360;
            }

            const totalAngle = endAngle - startAngle;
            const angleStep = count > 1
                ? totalAngle / (layoutType === 'circle' ? count : count - 1)
                : 0;

            // Position dial overlay centered on FAB
            dial.style.position = 'absolute';
            dial.style.left = '0';
            dial.style.top = '0';
            dial.style.right = '0';
            dial.style.bottom = '0';
            dial.style.display = 'block';
            dial.style.pointerEvents = 'none';

            // Get FAB position within container
            const containerRect = ctx.el.getBoundingClientRect();
            const fabRect = fabBtn.getBoundingClientRect();
            const fabCenterX = fabRect.left - containerRect.left + fabSize / 2;
            const fabCenterY = fabRect.top - containerRect.top + fabSize / 2;

            for (let idx = 0; idx < btnEls.length; idx++) {
                const angleDeg = startAngle + angleStep * idx;
                const angleRad = angleDeg * (Math.PI / 180);
                const posX = fabCenterX + Math.cos(angleRad) * radius - btnSize / 2;
                const posY = fabCenterY + Math.sin(angleRad) * radius - btnSize / 2;
                btnEls[idx].style.position = 'absolute';
                btnEls[idx].style.left = posX + 'px';
                btnEls[idx].style.top = posY + 'px';
            }
        }

        /** The main button's name: label, else fab.label. It names the menu too. */
        const fabName = (): string => (ctx.label() as string) || uiString('fab', 'label');
        ctx.track(() => {
            const n = fabName();
            ctx.el.querySelector('.pdx-fab')?.setAttribute('aria-label', n);
            ctx.el.querySelector('.pdx-fab-dial')?.setAttribute('aria-label', n);
        });

        // ─── Keyboard ───────────────────────────────
        // A closed dial is inert: its actions are shrunk and transparent but would still be tab
        // stops, so Shift+Tab from the FAB would land on an action nobody can see. Inert is set at once, not in
        // the frame that animates the dial, so a Tab that closes it moves on from the FAB.
        let _fabEl: HTMLButtonElement | null = null;
        let _dialEl: HTMLElement | null = null;

        function setOpen(v: boolean): void {
            const was = _open.peek();
            _open.set(v);
            _dialEl?.toggleAttribute('inert', !v);
            // Announced once, on a change: a hover's leave timer or a close() may repeat it.
            if (v !== was) {
                ctx.state('open', v);
                ctx.emit('open-change', { value: v });
            }
        }

        /** The actions nearest the FAB first. A linear dial going up or left sits before the FAB in
         *  the DOM, so its nearest action is the last one. */
        function outward(): HTMLElement[] {
            const items = _dialEl ? Array.from(_dialEl.querySelectorAll<HTMLElement>('.pdx-fab-action')) : [];
            const dir = ctx.direction() as string;
            const before = (ctx.type() as string) === 'linear' && (dir === 'up' || dir === 'left');
            return before ? items.reverse() : items;
        }

        /** [the arrow that moves away from the FAB, the one that comes back]. */
        function axisKeys(): [string, string] {
            const dir = (ctx.direction() as string).split('-')[0];
            if (dir === 'down') return ['ArrowDown', 'ArrowUp'];
            if (dir === 'left') return ['ArrowLeft', 'ArrowRight'];
            if (dir === 'right') return ['ArrowRight', 'ArrowLeft'];
            return ['ArrowUp', 'ArrowDown'];
        }

        function openFromKeyboard(): void {
            setOpen(true);
            outward()[0]?.focus();
        }

        /** Close; if focus was on an action, it goes back to the FAB (first, before the dial turns inert). */
        function closeToFab(): void {
            if (_dialEl?.contains(document.activeElement)) _fabEl?.focus();
            setOpen(false);
        }

        function onFabKeydown(e: KeyboardEvent): void {
            if (e.key === 'Enter' || e.key === ' ') {
                // Enter and Space are the button's click, cancelled here so it runs once: the
                // keyboard path moves focus into the dial, and a pointer click does not.
                e.preventDefault();
                if (_open.peek()) closeToFab();
                else openFromKeyboard();
            } else if (e.key === axisKeys()[0]) {
                e.preventDefault();
                if (_open.peek()) outward()[0]?.focus();
                else openFromKeyboard();
            }
        }

        function onDialKeydown(e: KeyboardEvent): void {
            const items = outward();
            const at = items.indexOf(document.activeElement as HTMLElement);
            const [away, back] = axisKeys();
            let next = -1;
            if (e.key === away) next = (at + 1) % items.length;
            else if (e.key === back) next = (at - 1 + items.length) % items.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = items.length - 1;
            else if (e.key === 'Tab') { closeToFab(); return; }   // not prevented: the Tab moves on from the FAB
            if (next < 0 || !items.length) return;
            e.preventDefault();
            items[next].focus();
        }

        ctx.track(() => {
            const iconName = ctx.icon() as string;
            const actions = ctx.actions() as FabAction[];
            const size = ctx.size() as string;
            const direction = ctx.direction() as string;
            const layoutType = ctx.type() as string;
            const showTooltip = ctx.showTooltip() as boolean;
            const useMask = ctx.mask() as boolean;
            const triggerMode = ctx.trigger() as string;

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-fab-container');

                    // Direction class for linear layout
                    ctx.el.classList.add('pdx-fab-dir-' + direction);

                    // Mask overlay
                    if (useMask) {
                        _maskEl = document.createElement('div');
                        _maskEl.className = 'pdx-fab-mask';
                        _maskEl.dataset.part = 'mask';
                        ctx.el.appendChild(_maskEl);
                    }

                    // Speed dial actions
                    if (actions.length) {
                        const dial = document.createElement('div');
                        dial.className = 'pdx-fab-dial pdx-fab-dial-' + layoutType;
                        dial.setAttribute('role', 'menu');
                        dial.dataset.part = 'menu';
                        dial.setAttribute('aria-label', fabName());
                        dial.toggleAttribute('inert', !_open.peek());
                        dial.addEventListener('keydown', onDialKeydown);
                        _dialEl = dial;

                        for (let idx = 0; idx < actions.length; idx++) {
                            const action = actions[idx];
                            const wrap = document.createElement('div');
                            wrap.className = 'pdx-fab-action-wrap';
                            wrap.style.transitionDelay = (idx * 30) + 'ms';

                            const btn = document.createElement('button');
                            btn.type = 'button';
                            btn.className = 'pdx-fab-action';
                            btn.setAttribute('aria-label', action.label);
                            btn.setAttribute('role', 'menuitem');
                            btn.dataset.part = 'item';

                            const ic = document.createElement('pdx-icon');
                            ic.setAttribute('name', action.icon);
                            ic.setAttribute('size', '18');
                            btn.appendChild(ic);

                            btn.addEventListener('click', () => {
                                ctx.emit('pdx-select', { key: action.key, action });
                                closeToFab();
                            });

                            wrap.appendChild(btn);

                            // Tooltip label
                            if (showTooltip && action.label) {
                                const tip = document.createElement('span');
                                tip.className = 'pdx-fab-tooltip';
                                tip.dataset.part = 'label';
                                tip.textContent = action.label;
                                wrap.appendChild(tip);
                            }

                            dial.appendChild(wrap);
                        }

                        ctx.el.appendChild(dial);
                    }

                    // Main FAB button
                    const fab = document.createElement('button');
                    fab.type = 'button';
                    fab.className = 'pdx-fab';
                    fab.setAttribute('data-part', 'root');
                    fab.setAttribute('aria-label', fabName());
                    fab.setAttribute('aria-haspopup', actions.length ? 'menu' : 'false');
                    fab.setAttribute('aria-expanded', 'false');

                    const ic = document.createElement('pdx-icon');
                    ic.className = 'pdx-fab-icon';
                    ic.setAttribute('name', iconName);
                    ic.setAttribute('size', size === 'lg' ? '28' : size === 'sm' ? '18' : '24');
                    fab.appendChild(ic);

                    fab.addEventListener('click', () => {
                        if (actions.length) {
                            setOpen(!_open.peek());
                        } else {
                            ctx.emit('pdx-click', {});
                        }
                    });
                    // Only a speed dial takes over Enter/Space: a plain FAB keeps its native click.
                    if (actions.length) fab.addEventListener('keydown', onFabKeydown);
                    _fabEl = fab;

                    // Hover trigger. The keyboard opens it the same way as a click-triggered one.
                    if (triggerMode === 'hover' && actions.length) {
                        ctx.el.addEventListener('mouseenter', () => {
                            if (_hoverCloseTimer) { clearTimeout(_hoverCloseTimer); _hoverCloseTimer = null; }
                            setOpen(true);
                        });
                        ctx.el.addEventListener('mouseleave', () => {
                            _hoverCloseTimer = window.setTimeout(() => setOpen(false), 200);
                        });
                    }

                    ctx.el.appendChild(fab);
                });
                return;
            }
        });

        // Click-outside and Escape handlers
        let _outsideHandler: ((e: MouseEvent) => void) | null = null;
        let _escHandler: ((e: KeyboardEvent) => void) | null = null;

        // Teardown on destroy: the else branch that removes the listeners
        // never runs if the component is unmounted while the dial is open.
        ctx.track(() => () => {
            if (_outsideHandler) { document.removeEventListener('mousedown', _outsideHandler); _outsideHandler = null; }
            if (_escHandler) { document.removeEventListener('keydown', _escHandler); _escHandler = null; }
        });

        // Toggle dial visibility + position circular actions
        let _circularPositioned = false;
        ctx.track(() => {
            const isOpen = _open();
            requestAnimationFrame(() => {
                // The open look — the dial, the turned icon, the mask — is fab.css's, from the host's
                // `:state(open)` (#288); the component sets no class for it.
                const dial = ctx.el.querySelector('.pdx-fab-dial');
                if (dial) dial.toggleAttribute('inert', !isOpen);

                // Position circular actions when first opened
                const lt = (ctx.type() as string);
                if (isOpen && !_circularPositioned && lt !== 'linear') {
                    _circularPositioned = true;
                    positionCircularActions(ctx.direction() as string, lt);
                }

                const mainFab = ctx.el.querySelector('.pdx-fab');
                if (mainFab) mainFab.setAttribute('aria-expanded', String(isOpen));

                // Click-outside to close
                if (isOpen) {
                    if (!_outsideHandler) {
                        _outsideHandler = (ev: MouseEvent) => {
                            if (!ctx.el.contains(ev.target as Node)) setOpen(false);
                        };
                        setTimeout(() => document.addEventListener('mousedown', _outsideHandler!), 10);
                    }
                    if (!_escHandler) {
                        _escHandler = (ev: KeyboardEvent) => {
                            if (ev.key === 'Escape') closeToFab();
                        };
                        document.addEventListener('keydown', _escHandler);
                    }
                } else {
                    if (_outsideHandler) { document.removeEventListener('mousedown', _outsideHandler); _outsideHandler = null; }
                    if (_escHandler) { document.removeEventListener('keydown', _escHandler); _escHandler = null; }
                }
            });
        });

        // The overlay verbs (#288): `open()` is `show()`.
        ctx.expose({
            show: () => setOpen(true),
            close: () => closeToFab(),
            toggle: () => { if (_open.peek()) closeToFab(); else setOpen(true); },
            get isOpen() { return _open() as boolean; },
        });

        return {};
    },
    render: () => html``,
});
