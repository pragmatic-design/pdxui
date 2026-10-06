// pdx-spinner — Loading indicator with spinner, dots, and bar variants.
// Sizes: xs(12) sm(16) md(24) lg(32) xl(48). Color: inherits currentColor.
// Customizable: --pdx-spinner-speed, --pdx-spinner-thickness CSS variables.
// Accessibility: role="status" + aria-live="polite" + visible label option.

import { uiString } from '../shared/i18n';
import { component, html } from '@pdxui/core';
// The bar variant is painted by progress.css: without it the bar renders nothing on a page that
// loads no other progress. The dots are .pdx-dot, in the base layer every page loads.
import '@pdxui/design/components/progress';

const SIZES: Record<string, string> = { xs: '12px', sm: '16px', md: '24px', lg: '32px', xl: '48px' };

// Inject keyframe once
if (typeof document !== 'undefined' && !document.getElementById('pdx-spin-kf')) {
    const s = document.createElement('style');
    s.id = 'pdx-spin-kf';
    s.textContent = '@keyframes pdx-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
}

/**
 * A loading indicator, drawn as a spinner, dots or a bar.
 */
component('pdx-spinner', {
    props: {
        variant: { type: String, default: 'spinner' },
        size: { type: String, default: 'md' },
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
    setup(ctx) {
        function px(): string { return SIZES[ctx.size() as string] || '24px'; }
        function svgStyle(): string { return 'animation:pdx-spin var(--pdx-spinner-speed, 1s) linear infinite'; }
        function containerStyle(): string { return 'display:inline-flex;align-items:center;justify-content:center;width:' + px() + ';height:' + px(); }
        return { px, svgStyle, containerStyle };
    },
    render: (ctx) => html`
        <span role="status" aria-live="polite" :aria-label="${() => (ctx.label() as string) || uiString('spinner', 'loading')}" style="display:inline-flex;align-items:center;gap:var(--pdx-space-xs,6px);flex-direction:column">
            <span :style="${ctx.containerStyle}">
                ${() => {
                    const v = ctx.variant();
                    const s = ctx.px();
                    if (v === 'dots') return html`<span style="display:flex;gap:3px"><span class="pdx-dot pdx-dot-primary pdx-dot-pulse"></span><span class="pdx-dot pdx-dot-primary pdx-dot-pulse"></span><span class="pdx-dot pdx-dot-primary pdx-dot-pulse"></span></span>`;
                    // The indeterminate class belongs on the TRACK, as in pdx-progress and the docs:
                    // on the bar it matches no rule, and the bar never slides.
                    if (v === 'bar') return html`<span class="pdx-progress pdx-progress-indeterminate" :style="${() => 'width:' + s}"><span class="pdx-progress-bar"></span></span>`;
                    return html`<svg viewBox="0 0 24 24" fill="none" :style="${ctx.svgStyle}" width="${s}" height="${s}"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="var(--pdx-spinner-thickness, 3)" stroke-linecap="round" stroke-dasharray="31.4 31.4" /></svg>`;
                }}
            </span>
            ${() => ctx.showLabel() ? html`<span style="font-size:var(--pdx-text-xs);color:var(--pdx-color-muted)">${() => (ctx.label() as string) || uiString('spinner', 'loading')}</span>` : ''}
        </span>
    `,
});
