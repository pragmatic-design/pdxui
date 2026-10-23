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
 *
 * @fires pdx-action-error {{ error }} - When the `action`'s `execute` rejects. The error is the one
 * the action keeps on its `error()`; the button is idle again.
 */
component('pdx-button', {
    // The axes its stylesheet keys by (#512), reflected on the host; each value maps the selector that
    // draws the same look on a native <button>. Five sizes, the same scale as pdx-input and pdx-select.
    variants: {
        /** Visual variant. */
        variant: {
            primary: '.pdx-primary', solid: '.pdx-primary', secondary: '.pdx-secondary', outline: '.pdx-outline',
            ghost: '.pdx-ghost', link: '.pdx-link', danger: '.pdx-danger', success: '.pdx-success',
            warning: '.pdx-warning', info: '.pdx-info',
        },
        /** xs, sm, md (the default), lg or xl — the same scale as pdx-input and pdx-select. */
        size: { md: '[size="md"]', xs: '[size="xs"]', sm: '[size="sm"]', lg: '[size="lg"]', xl: '[size="xl"]' },
    },
    props: {
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
        /** A write the button runs: anything with `execute(arg?)` and `pending()` — a `mutation()`. A click calls `execute(actionArg)`; while `pending()` the button shows loading, and refuses clicks unless the action's `concurrency` is `'coalesce'` or `'parallel'`, so a double click sends one write. */
        action: { type: Object, default: null },
        /** The value a click passes to `action.execute`. */
        actionArg: { type: Object, default: null },
    },
    setup(ctx) {
        let _pressed = false;

        type Action = { execute: (arg?: unknown) => unknown; pending: () => boolean; concurrency?: string };

        /** The `action`, if it has the shape: an `execute` to call and a `pending` to read. */
        function action(): Action | null {
            const a = ctx.action() as { execute?: unknown; pending?: unknown } | null;
            return a && typeof a.execute === 'function' && typeof a.pending === 'function'
                ? a as Action
                : null;
        }

        /** Busy: `loading` set, or the action's write in flight. */
        function isBusy(): boolean {
            return !!(ctx.loading() || action()?.pending());
        }

        /**
         * Whether the pending action refuses another click (#500): under `'queue'` and `'drop'` a click
         * while it is pending would wait or be dropped, so the button refuses it; under `'coalesce'`
         * and `'parallel'` the action takes it, and the button stays clickable while it shows loading.
         */
        function refusesWhilePending(): boolean {
            const a = action();
            if (!a?.pending()) return false;
            return a.concurrency !== 'coalesce' && a.concurrency !== 'parallel';
        }

        function getClass(): string {
            const base = VARIANT_MAP[ctx.variant() as string] || 'pdx-primary';
            let cls = isBusy() ? `${base} pdx-loading` : base;
            if (ctx.toggle() && _pressed) cls += ' pdx-pressed';
            return cls;
        }

        function isDisabled(): boolean {
            return !!(ctx.disabled() || ctx.loading() || refusesWhilePending());
        }

        /**
         * Runs the action. A refusal stays where `mutation()` puts it, on `error()`, for the form to
         * show — and is announced as `pdx-action-error`, so the button holds the promise it started
         * instead of leaving an unhandled rejection behind every failed save.
         */
        function runAction(): void {
            const a = action();
            if (!a) return;
            Promise.resolve(a.execute(ctx.actionArg())).then(undefined, (error: unknown) => {
                ctx.emit('pdx-action-error', { error });
            });
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
            runAction();
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
                if (s !== 'md') btn.setAttribute('size', s);
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

        return { getClass, isBusy, isDisabled, onClick };
    },
    // The name goes on the element with the role: `aria-label` left on the host names nothing, and
    // an icon-only button would be read "button".
    render: (ctx) => html`
        <button
            data-part="root"
            :type=${() => ctx.type()}
            :class=${() => ctx.getClass()}
            :disabled=${() => ctx.isDisabled()}
            :aria-busy=${() => ctx.isBusy() ? 'true' : null}
            :aria-label=${() => (ctx.ariaLabel() as string) || null}
            :aria-labelledby=${() => (ctx.ariaLabelledby() as string) || null}
            @click=${ctx.onClick}
        ><slot></slot>${() => ctx.label()}</button>
    `,
});
