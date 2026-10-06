// pdx-badge — Notification badge with count, dot, overlay, and status modes.
// Maps to .pdx-badge, .pdx-badge-{variant}, .pdx-dot, .pdx-dot-{variant} CSS classes.
// Features: max overflow (99+), hideZero, dot mode, pulse animation, aria-live.

import { component, html } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';

/**
 * A notification badge that shows a count or a dot, on its own or overlaid on another element.
 */
component('pdx-badge', {
    props: {
        value: { type: String, default: '' },
        variant: { type: String, default: 'primary' },
        max: { type: Number, default: 99 },
        dot: { type: Boolean, default: false },
        pulse: { type: Boolean, default: false },
        hideZero: { type: Boolean, default: true },
        size: { type: String, default: '' },
        /** Shape: 'pill' (default, full radius) or 'square' (rounded rectangle). */
        shape: { type: String, default: 'pill' },
        /** What the badge means, read instead of its colour or its bare number: "Online", "3 unread messages". A dot without it is read as its variant ("success indicator"). */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        function display(): string {
            if (ctx.dot()) return '';
            const v = ctx.value() as string;
            const num = Number(v);
            if (!isNaN(num) && (ctx.max() as number) > 0 && num > (ctx.max() as number)) {
                return ctx.max() + '+';
            }
            return v;
        }

        function isHidden(): boolean {
            if (ctx.dot()) return false;
            const v = ctx.value() as string;
            return !!(ctx.hideZero() && (v === '' || v === '0'));
        }

        function cssClass(): string {
            if (ctx.dot()) {
                let cls = 'pdx-dot pdx-dot-' + ctx.variant();
                if (ctx.pulse()) cls += ' pdx-dot-pulse';
                return cls;
            }
            let cls = 'pdx-badge pdx-badge-' + ctx.variant();
            const s = ctx.size() as string;
            if (s) cls += ' pdx-badge-' + s;
            if (ctx.shape() === 'square') cls += ' pdx-badge-square';
            return cls;
        }

        // The label says what the badge means: without one, every presence dot reads "success
        // indicator". A dot with no label falls back to its variant word, and a counter to its own text.
        function accessibleName(): string | null {
            const label = ctx.label() as string;
            if (label) return label;
            return ctx.dot() ? format(uiString('badge', 'indicator'), { variant: ctx.variant() as string }) : null;
        }

        return { display, isHidden, cssClass, accessibleName };
    },
    render: (ctx) => html`
        <span
            :class="${ctx.cssClass}"
            :style="${() => ctx.isHidden() ? 'display:none' : ''}"
            role="status"
            aria-live="polite"
            :aria-label="${ctx.accessibleName}"
        >${ctx.display}</span>
    `,
});
