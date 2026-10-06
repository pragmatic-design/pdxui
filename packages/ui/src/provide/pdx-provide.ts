// pdx-provide — Generic cascading value provider (non-rendering).
// Blazor-style CascadingValue: wraps children and provides named values
// via hierarchical Context Protocol. Nearest ancestor wins.
//
// Single value:
//   <pdx-provide name="theme" :value="darkTheme">
//     <pdx-card /> <!-- inject('theme') gets darkTheme -->
//   </pdx-provide>
//
// Multiple values (pass object to :values):
//   <pdx-provide :values="{ theme: darkTheme, locale: 'it' }">
//     <pdx-card /> <!-- inject('theme'), inject('locale') -->
//   </pdx-provide>
//
// Scoped override (nested providers shadow outer ones):
//   <pdx-provide name="theme" :value="light">
//     <pdx-provide name="theme" :value="dark">
//       <!-- inject('theme') → dark (nearest wins) -->
//     </pdx-provide>
//   </pdx-provide>

import { component, html, provide } from '@pdxui/core';

/**
 * Makes a value available to everything it wraps, like Blazor's CascadingValue; when two provide
 * the same name, the nearest ancestor wins.
 */
component('pdx-provide', {
    props: {
        /** Context key name (for single value mode). */
        name: { type: String, default: '' },
        /** Value to provide (for single value mode). Reactive if signal. */
        value: { type: Object, default: null },
        /** Multiple values to provide (object of key→value). Takes priority over name/value. */
        values: { type: Object, default: null },
    },
    setup(ctx) {
        const _providedKeys = new Set<string>();

        // Track changes to name/value/values and re-provide
        ctx.track(() => {
            const name = ctx.name() as string;
            const value = ctx.value();
            const values = ctx.values() as Record<string, unknown> | null;

            // Multiple values mode
            if (values && typeof values === 'object') {
                for (const [key, val] of Object.entries(values)) {
                    provide(key, val, ctx.el);
                    _providedKeys.add(key);
                }
                return;
            }

            // Single value mode
            if (name) {
                provide(name, value, ctx.el);
                _providedKeys.add(name);
            }
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
