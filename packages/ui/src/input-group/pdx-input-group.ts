// pdx-input-group — Groups inputs, buttons, and addons with joined borders.
// Propagates size to children. Uses host element directly (Light DOM).
// Pattern: same approach as pdx-button-group.

import { component, html } from '@pdxui/core';

/**
 * Groups inputs, buttons and addons into one control with joined borders, passing its size and
 * disabled state to its children.
 */
component('pdx-input-group', {
    props: {
        size: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
    },
    setup(ctx) {
        ctx.track(() => {
            const el = ctx.el;
            const size = ctx.size() as string;
            const disabled = ctx.disabled();

            // CSS class on host — added, not assigned: `className =` would wipe the author's classes.
            el.classList.add('pdx-input-group');

            // Propagate size/disabled to children after render
            requestAnimationFrame(() => {
                // Two-way propagation: taking size/disabled off the group must
                // remove them from the children too.
                const applyGroupAttrs = (node: HTMLElement): void => {
                    if (size) node.setAttribute('size', size);
                    else node.removeAttribute('size');
                    if (disabled) node.setAttribute('disabled', '');
                    else node.removeAttribute('disabled');
                };
                // pdx-input children
                const inputs = el.querySelectorAll<HTMLElement>('pdx-input');
                for (const inp of inputs) applyGroupAttrs(inp);

                // pdx-button children
                const buttons = el.querySelectorAll<HTMLElement>('pdx-button');
                for (const btn of buttons) applyGroupAttrs(btn);

                // Native input/button children (CSS-only usage)
                const nativeInputs = el.querySelectorAll<HTMLElement>(':scope > input, :scope > button, :scope > select');
                for (const native of nativeInputs) {
                    if (size) native.setAttribute('size', size);
                    if (disabled) (native as HTMLInputElement).disabled = true;
                }
            });
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
