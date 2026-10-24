// pdx-badge — Notification badge with count, dot, overlay, and status modes.
// Maps to .pdx-badge, .pdx-badge-{variant}, .pdx-dot, .pdx-dot-{variant} CSS classes.
// Features: max overflow (99+), hideZero, dot mode, pulse animation, aria-live.

import { component, html } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';

/**
 * A notification badge that shows a count or a dot, on its own or overlaid on another element.
 */
component('pdx-badge', {
    // The axes feedback.css keys by (#631), reflected on the host; each value maps the class that draws
    // the same counter on a native badge. A dot draws its variant from the host alone, and on native
    // markup with its own `.pdx-dot-{variant}`. `md` and `pill` are the base look.
    variants: {
        /** primary (the default), secondary, success, danger, warning, info, muted (a dot's), outline, or outline with a colour. */
        variant: {
            primary: '.pdx-badge-primary', secondary: '.pdx-badge-secondary', success: '.pdx-badge-success',
            danger: '.pdx-badge-danger', warning: '.pdx-badge-warning', info: '.pdx-badge-info', muted: '.pdx-badge-muted',
            outline: '.pdx-badge-outline', 'outline-primary': '.pdx-badge-outline-primary',
            'outline-success': '.pdx-badge-outline-success', 'outline-danger': '.pdx-badge-outline-danger',
            'outline-warning': '.pdx-badge-outline-warning',
        },
        /** sm, md (the default) or lg. */
        size: { md: '.pdx-badge-md', sm: '.pdx-badge-sm', lg: '.pdx-badge-lg' },
        /** pill (the default, full radius) or square (a rounded rectangle). */
        shape: { pill: '.pdx-badge-pill', square: '.pdx-badge-square' },
    },
    props: {
        value: { type: String, default: '' },
        max: { type: Number, default: 99 },
        dot: { type: Boolean, default: false },
        pulse: { type: Boolean, default: false },
        hideZero: { type: Boolean, default: true },
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
                let cls = 'pdx-dot';
                if (ctx.pulse()) cls += ' pdx-dot-pulse';
                return cls;
            }
            return 'pdx-badge';
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
            data-part="root"
            :style="${() => ctx.isHidden() ? 'display:none' : ''}"
            role="status"
            aria-live="polite"
            :aria-label="${ctx.accessibleName}"
        >${ctx.display}</span>
    `,
});
