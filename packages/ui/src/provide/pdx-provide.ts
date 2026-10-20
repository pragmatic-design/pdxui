// pdx-provide — Generic cascading value provider (non-rendering).
// Blazor-style CascadingValue: wraps children and provides values under context tokens (#495), via
// the hierarchical Context Protocol. Nearest ancestor wins.
//
// A token is declared once, in a module: `export const Theme = context<string>('theme');`
//
// Single value:
//   <pdx-provide :token="Theme" :value="darkTheme">
//     <pdx-card /> <!-- inject(Theme, el) gets darkTheme -->
//   </pdx-provide>
//
// Multiple values (a Map of token → value):
//   <pdx-provide :values="new Map([[Theme, darkTheme], [Locale, 'it']])">
//     <pdx-card /> <!-- inject(Theme, el), inject(Locale, el) -->
//   </pdx-provide>
//
// Scoped override (nested providers shadow outer ones):
//   <pdx-provide :token="Theme" :value="light">
//     <pdx-provide :token="Theme" :value="dark">
//       <!-- inject(Theme, el) → dark (nearest wins) -->
//     </pdx-provide>
//   </pdx-provide>

import { component, html, provide } from '@pdxui/core';
import type { Context } from '@pdxui/core';

/**
 * Makes a value available to everything it wraps, like Blazor's CascadingValue, under a context
 * token; when two provide the same token, the nearest ancestor wins.
 */
component('pdx-provide', {
    props: {
        /** The context token the value is provided under (single value mode): `context<T>('name')`. */
        token: { type: Object, default: null },
        /** Value to provide (for single value mode). Reactive if signal. */
        value: { type: Object, default: null },
        /** Multiple values, a `Map` of token → value. Takes priority over token/value. */
        values: { type: Object, default: null },
    },
    setup(ctx) {
        // Track changes to token/value/values and re-provide
        ctx.track(() => {
            const token = ctx.token() as Context<unknown> | null;
            const value = ctx.value();
            const values = ctx.values() as Map<Context<unknown>, unknown> | null;

            // Multiple values mode
            if (values instanceof Map) {
                for (const [key, val] of values) provide(key, val, ctx.el);
                return;
            }

            // Single value mode
            if (token) provide(token, value, ctx.el);
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
