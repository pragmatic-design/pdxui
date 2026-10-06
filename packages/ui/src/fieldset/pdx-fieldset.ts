// pdx-fieldset — Semantic form group with native <fieldset>+<legend>.
// Bordered/filled/plain variants, collapsible, disabled propagation, invalid+error.

import { component, html, signal } from '@pdxui/core';
import { uiString } from '../shared/i18n';

/** Instance counter for the ids that tie the toggle to the legend and the content. */
let _fieldsetSeq = 0;

/**
 * A semantic form group on the native fieldset and legend, collapsible, with disabled propagation
 * and an error state.
 */
component('pdx-fieldset', {
    props: {
        legend: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        invalid: { type: Boolean, default: false },
        error: { type: String, default: '' },
        description: { type: String, default: '' },
        variant: { type: String, default: 'bordered' },
        size: { type: String, default: '' },
        collapsible: { type: Boolean, default: false },
        collapsed: { type: Boolean, default: false },
    },
    setup(ctx) {
        const _collapsed = signal(false);
        let legendEl: HTMLElement | null = null;
        let contentEl: HTMLElement | null = null;
        let errorEl: HTMLElement | null = null;
        let descEl: HTMLElement | null = null;
        let toggleEl: HTMLElement | null = null;
        // The toggle is a chevron with no text. It is named by the legend and points at the content
        // it shows and hides; with no legend it takes the registered string. Without either, a
        // screen reader would say only "button, expanded".
        const uid = ++_fieldsetSeq;
        const legendId = `pdx-fieldset-${uid}-legend`;
        const contentId = `pdx-fieldset-${uid}-content`;

        ctx.track(() => {
            const ext = ctx.collapsed() as boolean;
            _collapsed.set(!!ext);
        });

        function toggle() {
            if (!ctx.collapsible()) return;
            _collapsed.set(!_collapsed());
            ctx.emit('toggle', { collapsed: _collapsed() });
        }

        // Imperative DOM approach — read signals first (creates subscriptions),
        // then apply to DOM in rAF (ensures template is rendered)
        ctx.track(() => {
            // Read all signals synchronously to subscribe
            const leg = ctx.legend() as string;
            const desc = ctx.description() as string;
            const err = ctx.error() as string;
            const v = ctx.variant() as string;
            const s = ctx.size() as string;
            const isInvalid = ctx.invalid() || !!err;
            const isCollapsible = ctx.collapsible();
            const isCollapsed = _collapsed();
            const isDisabled = !!ctx.disabled();
            const toggleName = uiString('fieldset', 'toggle'); // read here: a locale loaded later reaches it

            let cls = 'pdx-fieldset';
            if (v && v !== 'bordered') cls += ' pdx-fieldset-' + v;
            if (s) cls += ' pdx-fieldset-' + s;
            if (isInvalid) cls += ' pdx-fieldset-invalid';
            if (isCollapsed) cls += ' pdx-fieldset-collapsed';
            if (isCollapsible) cls += ' pdx-fieldset-collapsible';

            // Apply to DOM asynchronously (template rendered by then)
            requestAnimationFrame(() => {
                const el = ctx.el;
                const fs = el.querySelector('fieldset');
                if (!fs) return;

                // Acquire DOM references once
                if (!legendEl) {
                    legendEl = fs.querySelector('.pdx-legend');
                    contentEl = fs.querySelector('.pdx-fieldset-content');
                    errorEl = fs.querySelector('.pdx-fieldset-error');
                    descEl = fs.querySelector('.pdx-fieldset-description');
                    toggleEl = fs.querySelector('.pdx-fieldset-toggle');
                    const textSpan = legendEl?.querySelector('.pdx-legend-text');
                    if (textSpan) textSpan.id = legendId;
                    if (contentEl) contentEl.id = contentId;
                }

                fs.className = cls;
                // The native attribute is the whole mechanism: a disabled fieldset disables every
                // form control inside it (its first legend excepted, so the collapse toggle still
                // works) and is exposed as disabled.
                fs.disabled = isDisabled;

                if (legendEl) {
                    const textSpan = legendEl.querySelector('.pdx-legend-text');
                    if (textSpan) textSpan.textContent = leg;
                    // The toggle lives in the legend: hiding an empty legend hid the only way to
                    // collapse a collapsible fieldset without one.
                    legendEl.style.display = leg || isCollapsible ? '' : 'none';
                }
                if (toggleEl) {
                    toggleEl.style.display = isCollapsible ? '' : 'none';
                    toggleEl.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
                    toggleEl.setAttribute('aria-controls', contentId);
                    if (leg) {
                        toggleEl.setAttribute('aria-labelledby', legendId);
                        toggleEl.removeAttribute('aria-label');
                    } else {
                        // An empty legend is hidden: pointing at it would leave the toggle unnamed.
                        toggleEl.removeAttribute('aria-labelledby');
                        toggleEl.setAttribute('aria-label', toggleName);
                    }
                }
                if (contentEl) {
                    contentEl.style.display = isCollapsed ? 'none' : '';
                }
                if (descEl) {
                    descEl.textContent = desc;
                    descEl.style.display = desc ? '' : 'none';
                }
                if (errorEl) {
                    errorEl.textContent = err;
                    errorEl.style.display = err ? '' : 'none';
                }
            });
        });

        return { toggle, _collapsed };
    },
    render: (ctx: any) => html`
        <fieldset class="pdx-fieldset">
            <legend class="pdx-legend">
                <span class="pdx-legend-text"></span>
                <button type="button" class="pdx-fieldset-toggle" @click="${ctx.toggle}" style="display:none" tabindex="0">
                    <svg class="pdx-fieldset-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
            </legend>
            <div class="pdx-fieldset-description" style="display:none"></div>
            <div class="pdx-fieldset-content">
                <slot></slot>
            </div>
            <div class="pdx-fieldset-error" role="alert" style="display:none"></div>
        </fieldset>
    `,
});
