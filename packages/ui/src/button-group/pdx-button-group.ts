// pdx-button-group — groups buttons visually and optionally adds toggle selection.
// Two modes:
//   - Action group (default): visual grouping only, CSS .pdx-btn-group
//   - Toggle group (mode="single"|"multiple"): selection with keyboard nav + ARIA
// Propagates variant/size to child <pdx-button> elements.
// Uses host element directly (no wrapper div) — Light DOM requires it.

import { component, html, focusGroup } from '@pdxui/core';
import { setOwnProp } from '../shared/own-prop';

/**
 * Groups buttons, either visually as an action group or as a toggle group with single or multiple
 * selection, and passes variant, size and disabled on to its buttons.
 *
 * @fires pdx-change {string} - The detail is the value itself, not an object: the pressed button's `value` in single mode, every pressed value joined by `,` in multiple mode.
 */
component('pdx-button-group', {
    props: {
        mode: { type: String, default: 'none' },
        orientation: { type: String, default: 'horizontal' },
        variant: { type: String, default: '' },
        size: { type: String, default: '' },
        /**
         * The selection. `single`: the checked button's `value`. `multiple`: every pressed button's
         * `value`, joined by `,` — `"bold,italic"`. A button without `value` is identified by its text.
         */
        value: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        /** The group's accessible name ("Text alignment"), set as `aria-label` on the group. */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        let focusGroupDispose: (() => void) | null = null;
        let labelled = false;

        /** The buttons the group selects among: a `<pdx-button>`'s inner `<button>`, or a native one. */
        function getItems(): HTMLButtonElement[] {
            return Array.from(ctx.el.querySelectorAll<HTMLButtonElement>('button'));
        }

        function itemValue(btn: HTMLElement): string {
            const pdx = btn.closest('pdx-button');
            return pdx?.getAttribute('value') || btn.getAttribute('value') || (pdx ?? btn).textContent?.trim() || '';
        }

        /**
         * One ARIA pattern per mode, in full. `single` is an APG radio group: radios with
         * aria-checked, the tab stop on the checked one — not a radiogroup of aria-pressed toggle
         * buttons, which has no radio inside it (axe aria-required-children) and announces toggles. `multiple`
         * is a group of aria-pressed toggle buttons; no mode is an action group, left alone.
         */
        function syncItems(mode: string, selected: Set<string>): void {
            const items = getItems();
            for (const btn of items) {
                const on = selected.has(itemValue(btn));
                if (mode === 'single') {
                    btn.setAttribute('role', 'radio');
                    btn.setAttribute('aria-checked', on ? 'true' : 'false');
                    btn.removeAttribute('aria-pressed');
                } else {
                    if (btn.getAttribute('role') === 'radio') btn.removeAttribute('role');
                    btn.removeAttribute('aria-checked');
                    if (mode === 'multiple') btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                    else if (!btn.closest('pdx-button')?.hasAttribute('toggle')) btn.removeAttribute('aria-pressed');
                }
            }
            if (mode === 'single') {
                const enabled = items.filter((b) => !b.disabled);
                const stop = enabled.find((b) => selected.has(itemValue(b))) ?? enabled[0];
                for (const btn of items) btn.tabIndex = btn === stop ? 0 : -1;
            }
        }

        /**
         * In a radio group the arrows select what they reach. focusGroup has moved focus by the time
         * this runs (it is added after focusGroup's listener); a click on the reached radio selects it
         * through the same path a pointer takes.
         */
        function selectOnArrow(e: KeyboardEvent): void {
            if (ctx.mode() !== 'single') return;
            if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
            const focused = document.activeElement as HTMLButtonElement | null;
            if (!focused || !getItems().includes(focused) || focused.disabled) return;
            if (itemValue(focused) !== ctx.value()) focused.click();
        }

        function getSelectedSet(): Set<string> {
            const val = ctx.value() as string;
            if (!val) return new Set();
            return new Set(val.split(',').map(v => v.trim()).filter(Boolean));
        }

        function handleClick(e: Event) {
            const mode = ctx.mode() as string;
            if (mode === 'none') return;

            const target = e.target as HTMLElement;
            const pdxBtn = target.closest('pdx-button') as HTMLElement | null;
            const nativeBtn = target.closest('button') as HTMLElement | null;
            if (!pdxBtn && !nativeBtn) return;
            if (nativeBtn?.hasAttribute('disabled')) return;

            const btnValue = pdxBtn?.getAttribute('value') || nativeBtn?.getAttribute('value') || (pdxBtn || nativeBtn)!.textContent?.trim() || '';
            if (!btnValue) return;

            const selected = getSelectedSet();

            // The selection is written to `value` before the event: otherwise a click would
            // emit and leave every button as it was, unless a parent bound the value back.
            if (mode === 'single') {
                setOwnProp(ctx.el, 'value', btnValue);
                ctx.emit('pdx-change', btnValue);
            } else if (mode === 'multiple') {
                if (selected.has(btnValue)) {
                    selected.delete(btnValue);
                } else {
                    selected.add(btnValue);
                }
                const next = Array.from(selected).join(',');
                setOwnProp(ctx.el, 'value', next);
                ctx.emit('pdx-change', next);
            }
        }

        // Apply CSS class, ARIA, propagation, and focus group on host element
        ctx.track(() => {
            const el = ctx.el;
            const mode = ctx.mode() as string;
            const orient = ctx.orientation() as string;
            const variant = ctx.variant() as string;
            const size = ctx.size() as string;
            const disabled = ctx.disabled();
            const selected = getSelectedSet();

            // CSS class on host — own classes only, via classList: `className =` would wipe the
            // author's classes.
            el.classList.toggle('pdx-btn-group-vertical', orient === 'vertical');
            el.classList.toggle('pdx-btn-group', orient !== 'vertical');

            // ARIA on host
            // The roles written out where they are set: the manifest reads them there.
            el.setAttribute('role', mode === 'single' ? 'radiogroup' : 'group');
            // aria-orientation is allowed on radiogroup, NOT on role="group" (axe aria-allowed-attr).
            if (orient && mode === 'single') el.setAttribute('aria-orientation', orient);
            else el.removeAttribute('aria-orientation');
            if (disabled) {
                el.setAttribute('aria-disabled', 'true');
            } else {
                el.removeAttribute('aria-disabled');
            }
            // The name goes where the role is — on the host. Without `label`, an author's aria-label stays.
            const label = ctx.label() as string;
            if (label) { el.setAttribute('aria-label', label); labelled = true; }
            else if (labelled) { el.removeAttribute('aria-label'); labelled = false; }

            // Click handler on host — use addEventListener (onclick can be overwritten by template engine)
            el.removeEventListener('click', handleClick);
            el.addEventListener('click', handleClick);

            // Focus group for toggle modes
            if (focusGroupDispose) {
                focusGroupDispose();
                focusGroupDispose = null;
            }
            if (mode !== 'none') {
                focusGroupDispose = focusGroup(el, {
                    selector: 'button',
                    orientation: orient as 'horizontal' | 'vertical',
                    wrap: true,
                    onSelect: (btnEl) => { btnEl.click(); },
                });
            }
            // After focusGroup's own keydown listener, so focus has already moved.
            el.removeEventListener('keydown', selectOnArrow);
            el.addEventListener('keydown', selectOnArrow);

            // Propagate props to children after render
            requestAnimationFrame(() => {
                const pdxButtons = el.querySelectorAll<HTMLElement>('pdx-button');
                for (const btn of pdxButtons) {
                    if (variant) btn.setAttribute('variant', variant);
                    if (size) btn.setAttribute('size', size);
                    if (disabled) btn.setAttribute('disabled', '');
                }
                syncItems(mode, selected);
            });

            return () => {
                if (focusGroupDispose) {
                    focusGroupDispose();
                    focusGroupDispose = null;
                }
                el.removeEventListener('keydown', selectOnArrow);
            };
        });

        return {};
    },
    // Empty render — host element IS the group container, children projected directly
    render: () => html`<slot></slot>`,
});
