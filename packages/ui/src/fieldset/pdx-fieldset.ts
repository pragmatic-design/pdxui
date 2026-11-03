// pdx-fieldset — Semantic form group with native <fieldset>+<legend>.
// Bordered/filled/plain variants, collapsible, disabled propagation, invalid+error.

import { component, html, generatedId, model } from '@pdxui/core';
import { uiString } from '../shared/i18n';

/**
 * A semantic form group on the native fieldset and legend, collapsible, with disabled propagation
 * and an error state.
 *
 * @cssstate invalid - `invalid`, or an `error` is set: the border turns to the danger colour.
 * @cssstate collapsed - `collapsed`: the content is hidden and the chevron turned.
 * @cssstate collapsible - `collapsible`: the legend holds the toggle.
 * @cssstate disabled - `disabled`: every control inside is disabled, by the native fieldset.
 *
 * @csspart root - The native `<fieldset>`.
 * @csspart legend - The `<legend>`: the text and, when collapsible, the toggle.
 * @csspart toggle - The collapse button in the legend.
 * @csspart description - The description under the legend, with `description`.
 * @csspart content - The slotted controls.
 * @csspart error - The error message, with `error`; it is the fieldset's description.
 *
 * @alphaevent toggle
 * @alphadetail collapsed $event.detail.value
 */
component('pdx-fieldset', {
    // The axes forms.css keys by (#632), reflected on the host; each value maps the class that draws
    // the same fieldset on native markup. `bordered` and `md` are the base look.
    variants: {
        /** bordered (the default), filled or plain. */
        variant: { bordered: '.pdx-fieldset-bordered', filled: '.pdx-fieldset-filled', plain: '.pdx-fieldset-plain' },
        /** sm, md (the default) or lg. */
        size: { md: '.pdx-fieldset-md', sm: '.pdx-fieldset-sm', lg: '.pdx-fieldset-lg' },
    },
    props: {
        legend: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        invalid: { type: Boolean, default: false },
        error: { type: String, default: '' },
        description: { type: String, default: '' },
        collapsible: { type: Boolean, default: false },
    },
    // `collapsed` is a model (#293): the toggle writes it, and `collapsed-change` replaces the `toggle`
    // event, the name of a native one. A parent's write announces nothing.
    models: {
        /** Whether a collapsible fieldset is collapsed. */
        collapsed: model<boolean>(false, { type: Boolean }),
    },
    states: ['invalid', 'collapsed', 'collapsible', 'disabled'],
    parts: ['root', 'legend', 'toggle', 'description', 'content', 'error'],
    setup(ctx) {
        let legendEl: HTMLElement | null = null;
        let contentEl: HTMLElement | null = null;
        let errorEl: HTMLElement | null = null;
        let descEl: HTMLElement | null = null;
        let toggleEl: HTMLElement | null = null;
        // The toggle is a chevron with no text. It is named by the legend and points at the content
        // it shows and hides; with no legend it takes the registered string. Without either, a
        // screen reader would say only "button, expanded".
        const uid = generatedId('pdx-fieldset');
        const legendId = `${uid}-legend`;
        const contentId = `${uid}-content`;
        const descId = `${uid}-desc`;
        const errorId = `${uid}-error`;

        function toggle() {
            if (!ctx.collapsible()) return;
            ctx.collapsed.set(!ctx.collapsed.peek());
        }

        ctx.track(() => {
            ctx.state('invalid', !!ctx.invalid() || !!(ctx.error() as string));
            ctx.state('collapsed', !!ctx.collapsed());
            ctx.state('collapsible', !!ctx.collapsible());
            ctx.state('disabled', !!ctx.disabled());
        });

        // Imperative DOM approach — read signals first (creates subscriptions),
        // then apply to DOM in rAF (ensures template is rendered)
        ctx.track(() => {
            // Read all signals synchronously to subscribe
            const leg = ctx.legend() as string;
            const desc = ctx.description() as string;
            const err = ctx.error() as string;
            const isCollapsible = ctx.collapsible();
            const isCollapsed = !!ctx.collapsed();
            const isDisabled = !!ctx.disabled();
            const toggleName = uiString('fieldset', 'toggle'); // read here: a locale loaded later reaches it

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
                    if (descEl) descEl.id = descId;
                    if (errorEl) errorEl.id = errorId;
                }

                // The native attribute is the whole mechanism: a disabled fieldset disables every
                // form control inside it (its first legend excepted, so the collapse toggle still
                // works) and is exposed as disabled.
                fs.disabled = isDisabled;

                // A2: the group is described by its description and its error message, while each
                // is shown. A `group` may not carry aria-invalid (axe's aria-allowed-attr); the
                // message says it, and the controls inside say their own.
                const describedBy = [desc && descId, err && errorId].filter(Boolean).join(' ');
                if (describedBy) fs.setAttribute('aria-describedby', describedBy);
                else fs.removeAttribute('aria-describedby');

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

        return { toggle };
    },
    render: (ctx: any) => html`
        <fieldset class="pdx-fieldset" data-part="root">
            <legend class="pdx-legend" data-part="legend">
                <span class="pdx-legend-text"></span>
                <button type="button" class="pdx-fieldset-toggle" data-part="toggle" @click="${ctx.toggle}" style="display:none" tabindex="0">
                    <svg class="pdx-fieldset-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
            </legend>
            <div class="pdx-fieldset-description" data-part="description" style="display:none"></div>
            <div class="pdx-fieldset-content" data-part="content">
                <slot></slot>
            </div>
            <div class="pdx-fieldset-error" data-part="error" role="alert" style="display:none"></div>
        </fieldset>
    `,
});
