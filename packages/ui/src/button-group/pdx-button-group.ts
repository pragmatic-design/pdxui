// pdx-button-group — groups action buttons visually, CSS .pdx-btn-group, role="group".
// Selecting among buttons is pdx-toggle-group: the selection modes (mode="single"|"multiple") left this
// component in #286 (decision 51), and `pdx migrate` rewrites a group that used them.
// Propagates variant/size/disabled to child <pdx-button> elements.
// Uses host element directly (no wrapper div) — Light DOM requires it.

import { component, html, prop } from '@pdxui/core';

/**
 * Groups action buttons visually, and passes variant, size and disabled on to its buttons. To select
 * among buttons, use `pdx-toggle-group`.
 */
component('pdx-button-group', {
    props: {
        orientation: prop('horizontal'),
        variant: prop(''),
        size: prop(''),
        disabled: prop(false),
        /** The group's accessible name ("Text alignment"), set as `aria-label` on the group. */
        label: prop(''),
    },
    setup(ctx) {
        let labelled = false;

        // Apply CSS class, ARIA and propagation on host element
        ctx.track(() => {
            const el = ctx.el;
            const orient = ctx.orientation() as string;
            const variant = ctx.variant() as string;
            const size = ctx.size() as string;
            const disabled = ctx.disabled();

            // CSS class on host — own classes only, via classList: `className =` would wipe the
            // author's classes.
            el.classList.toggle('pdx-btn-group-vertical', orient === 'vertical');
            el.classList.toggle('pdx-btn-group', orient !== 'vertical');

            // The name goes where the role is — on the host. Without `label`, an author's aria-label
            // stays, which a `host` binding would remove: it is written here.
            const label = ctx.label() as string;
            if (label) { el.setAttribute('aria-label', label); labelled = true; }
            else if (labelled) { el.removeAttribute('aria-label'); labelled = false; }

            // Propagate props to children after render
            requestAnimationFrame(() => {
                const pdxButtons = el.querySelectorAll<HTMLElement>('pdx-button');
                for (const btn of pdxButtons) {
                    if (variant) btn.setAttribute('variant', variant);
                    if (size) btn.setAttribute('size', size);
                    if (disabled) btn.setAttribute('disabled', '');
                }
            });
        });

        return {};
    },
    // Its role and ARIA (#133, #291). No aria-orientation: a `group` may not carry it (axe's
    // aria-allowed-attr). Its classes, `pdx-btn-group` and `pdx-btn-group-vertical`, are the design
    // system's CSS-only classes, set in setup: a `host` binding writes the whole attribute, and would
    // wipe the author's classes. Written after `setup`, so its type is read.
    host: {
        role: 'group',
        ':aria-disabled': (ctx) => ctx.disabled() ? 'true' : null,
    },
    // Empty render — host element IS the group container, children projected directly
    render: () => html`<slot></slot>`,
});
