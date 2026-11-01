// pdx-spinner — Loading indicator with spinner, dots, and bar variants.
// Sizes: xs(12) sm(16) md(24) lg(32) xl(48). Color: inherits currentColor.
// Customizable: --pdx-spinner-speed, --pdx-spinner-thickness CSS variables.
// Accessibility: role="status" + aria-live="polite" + visible label option.

import { uiString } from '../shared/i18n';
import { component, html } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more: the indicator's sizes and the ring's keyframe.
import '@pdxui/design/components/spinner';
// The bar variant is painted by progress.css: without it the bar renders nothing on a page that
// loads no other progress. The dots are .pdx-dot, in the base layer every page loads.
import '@pdxui/design/components/progress';

/**
 * A loading indicator, drawn as a spinner, dots or a bar.
 *
 * @csspart root - The status (`role="status"`), named by the label.
 * @csspart indicator - The ring, the dots or the bar.
 * @csspart label - The visible label, with `show-label`.
 */
component('pdx-spinner', {
    // The axis spinner.css keys by (#291), reflected on the host: it draws the indicator at the sizes
    // it had inline.
    variants: {
        /** xs (12px), sm (16px), md (24px, the default), lg (32px) or xl (48px). */
        size: ['md', 'xs', 'sm', 'lg', 'xl'],
    },
    parts: ['root', 'indicator', 'label'],
    props: {
        /**
         * spinner (the default, a ring), dots or bar. A prop, not a variant: it picks what the
         * component renders, and spinner.css has nothing to key by it (decision 51's reasoning for
         * pdx-button-group's own props).
         */
        variant: { type: String, default: 'spinner' },
        /**
         * The accessible name. Empty means "use the translated default" — a prop default cannot be
         * a literal here, because the spinners the LIBRARY builds have no author to pass one: a
         * pdx-list puts a pdx-block-ui over itself while its source loads, and nothing on that path
         * reaches the spinner inside it. An app in Italian would be left with an English "Loading"
         * it could not override.
         */
        label: { type: String, default: '' },
        showLabel: { type: Boolean, default: false },
    },
    setup() {
        return {};
    },
    // `pdx-spinner-status` is how pdx.reset sees the element and what is inside it, and keeps a page's
    // bare `span { border }` off them (#413); spinner.css draws the pieces by their parts.
    render: (ctx) => html`
        <span class="pdx-spinner-status" data-part="root" role="status" aria-live="polite" :aria-label="${() => (ctx.label() as string) || uiString('spinner', 'loading')}">
            <span data-part="indicator">
                ${() => {
                    const v = ctx.variant();
                    if (v === 'dots') return html`<span class="pdx-spinner-dots"><span class="pdx-dot pdx-dot-primary pdx-dot-pulse"></span><span class="pdx-dot pdx-dot-primary pdx-dot-pulse"></span><span class="pdx-dot pdx-dot-primary pdx-dot-pulse"></span></span>`;
                    // The indeterminate class belongs on the TRACK, as in pdx-progress and the docs:
                    // on the bar it matches no rule, and the bar never slides.
                    if (v === 'bar') return html`<span class="pdx-progress pdx-progress-indeterminate"><span class="pdx-progress-bar"></span></span>`;
                    return html`<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="var(--pdx-spinner-thickness, 3)" stroke-linecap="round" stroke-dasharray="31.4 31.4" /></svg>`;
                }}
            </span>
            ${() => ctx.showLabel() ? html`<span data-part="label">${() => (ctx.label() as string) || uiString('spinner', 'loading')}</span>` : ''}
        </span>
    `,
});
