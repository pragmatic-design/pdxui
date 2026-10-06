// pdx-button — WC wrapper over Pragmatic CSS button classes.
// Adds: variant prop, loading state (aria-busy), disabled guard, icon slot.
// Maps variant names to .pdx-* CSS classes from the design system.

import { component, html, DEV } from '@pdxui/core';
import { guardDisabledClicks } from '../shared/disabled-click';
import { hasAccessibleName } from '../shared/accessible-name';

const VARIANT_MAP: Record<string, string> = {
    solid: 'pdx-primary',
    primary: 'pdx-primary',
    secondary: 'pdx-secondary',
    outline: 'pdx-outline',
    ghost: 'pdx-ghost',
    link: 'pdx-link',
    danger: 'pdx-danger',
    success: 'pdx-success',
    warning: 'pdx-warning',
    info: 'pdx-info',
};

/**
 * A button over the Pragmatic CSS button styles, with variants, sizes and a loading state.
 */
component('pdx-button', {
    props: {
        variant: { type: String, default: 'primary', enum: ['solid', 'primary', 'secondary', 'outline', 'ghost', 'link', 'danger', 'success', 'warning', 'info'] },
        // Five sizes, as buttons.css draws them (`[size]`).
        /** xs, sm, md (the default), lg or xl — the same scale as pdx-input and pdx-select. */
        size: { type: String, default: '', enum: ['xs', 'sm', 'md', 'lg', 'xl'] },
        disabled: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        type: { type: String, default: 'button', enum: ['button', 'submit', 'reset'] },
        full: { type: Boolean, default: false },
        /** Toggle mode: button maintains pressed/unpressed state */
        toggle: { type: Boolean, default: false },
        /** Pressed state for toggle buttons */
        pressed: { type: Boolean, default: false },
        /** The button's text, rendered inside its `<button>` after any slotted content (an icon). Set this — not `textContent`, which replaces the rendered `<button>` with bare text once the button is connected. */
        label: { type: String, default: '' },
        /** The accessible name of an icon-only button, forwarded to the inner `<button>`: `aria-label` on the host has no role to name. */
        ariaLabel: { type: String, default: '' },
        /** The id of an element whose text names the button, forwarded to the inner `<button>`. */
        ariaLabelledby: { type: String, default: '' },
    },
    setup(ctx) {
        let _pressed = false;

        function getClass(): string {
            const base = VARIANT_MAP[ctx.variant() as string] || 'pdx-primary';
            let cls = ctx.loading() ? `${base} pdx-loading` : base;
            if (ctx.toggle() && _pressed) cls += ' pdx-pressed';
            return cls;
        }

        function isDisabled(): boolean {
            return !!(ctx.disabled() || ctx.loading());
        }

        // Disabled or loading: the click stops at the host, before the app's @click.
        ctx.track(() => guardDisabledClicks(ctx.el, isDisabled));

        function onClick(e: Event) {
            if (isDisabled()) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            // Toggle mode: flip pressed state
            if (ctx.toggle()) {
                _pressed = !_pressed;
                const btn = ctx.el.querySelector('button');
                if (btn) {
                    btn.setAttribute('aria-pressed', String(_pressed));
                    btn.className = getClass();
                }
                ctx.emit('pdx-toggle', { pressed: _pressed }, { bubbles: false });
            }
        }

        // Propagate size/full/toggle to inner <button> via DOM (after render)
        ctx.track(() => {
            const s = ctx.size() as string;
            const f = ctx.full();
            const isToggle = ctx.toggle();
            const pressedProp = ctx.pressed();

            // Sync pressed from external prop (reactive — parent can control toggle state)
            if (isToggle && pressedProp !== undefined) {
                _pressed = !!pressedProp;
            }

            requestAnimationFrame(() => {
                const btn = ctx.el.querySelector('button');
                if (!btn) return;
                if (s) btn.setAttribute('size', s);
                else btn.removeAttribute('size');
                if (f) btn.setAttribute('full', '');
                else btn.removeAttribute('full');
                if (isToggle) {
                    btn.setAttribute('aria-pressed', String(_pressed));
                    btn.className = getClass();
                }
            });
        });

        // An icon-only button with no name renders fine and is announced "button": nothing else
        // would say so. Once, after the first frame, when the slot is projected.
        ctx.frame(() => {
            const btn = ctx.el.querySelector('button');
            if (!DEV || !btn || hasAccessibleName(btn)) return;
            console.warn('[pdx-button] a button with no text and no name is announced "button" alone: '
                + `give it aria-label (or aria-labelledby, or a label). ${ctx.el.outerHTML.slice(0, 120)}`);
        });

        return { getClass, isDisabled, onClick };
    },
    // The name goes on the element with the role: `aria-label` left on the host names nothing, and
    // an icon-only button would be read "button".
    render: (ctx) => html`
        <button
            :type=${() => ctx.type()}
            :class=${() => ctx.getClass()}
            :disabled=${() => ctx.isDisabled()}
            :aria-busy=${() => ctx.loading() ? 'true' : null}
            :aria-label=${() => (ctx.ariaLabel() as string) || null}
            :aria-labelledby=${() => (ctx.ariaLabelledby() as string) || null}
            @click=${ctx.onClick}
        ><slot></slot>${() => ctx.label()}</button>
    `,
});
