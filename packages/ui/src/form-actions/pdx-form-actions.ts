// pdx-form-actions — Submit/reset bar that reads state from the nearest form context.
// Labels are localizable via setComponentStrings('form-actions', { submit: '...', reset: '...' }).
// To hide the reset button, set resetLabel="none".

import { component, html, tryUseForm, registerComponentStrings, getComponentString } from '@pdxui/core';
import type { Form } from '@pdxui/core';
// This component's styles live in form.css — written where the
// container is rather than where the component is. Imported explicitly so they travel anyway.
import '@pdxui/design/components/form';

// Register default English strings (overridable via setComponentStrings/setLocaleStrings)
registerComponentStrings('form-actions', {
    submit: 'Submit',
    reset: 'Reset',
});

/**
 * The submit and reset button bar of a form, wired to the form it sits in, with configurable
 * labels, alignment and a loading state.
 *
 * @cssstate submitting - The form it sits in is submitting; its buttons are disabled meanwhile.
 *
 * @csspart root - The bar.
 * @csspart reset - The reset button, unless `reset-label="none"`.
 * @csspart submit - The submit button.
 */
component('pdx-form-actions', {
    props: {
        /** Submit button label. Uses i18n registry default if not set. */
        submitLabel: { type: String, default: '' },
        /** Reset button label. Set to 'none' to hide. Uses i18n registry default if not set. */
        resetLabel: { type: String, default: '' },
        /** Show loading spinner on submit button while submitting. */
        showLoading: { type: Boolean, default: true },
    },
    // The bar's alignment is an axis reflected on the host, which form.css draws (#293); each value
    // maps the class a native bar carries.
    variants: {
        /** Where the buttons sit: end (the default), start, center, or apart. */
        align: { end: '.pdx-form-actions-end', start: '.pdx-form-actions-start', center: '.pdx-form-actions-center', between: '.pdx-form-actions-between' },
    },
    states: ['submitting'],
    parts: ['root', 'reset', 'submit'],
    setup(ctx) {
        // Looked up when read, and kept once found: set up before its <pdx-form>, a one-time lookup
        // at setup would never find it. See tryUseForm(from).
        let _form: Form<any> | undefined;
        const form = (): Form<any> | undefined => _form ??= tryUseForm(ctx.el) as Form<any> | undefined;

        function isSubmitting(): boolean { return form()?.submitting() ?? false; }
        function isDisabled(): boolean { return form()?.submitting() ?? false; }
        function isDirty(): boolean { return form()?.dirty() ?? false; }
        function onReset(): void { form()?.reset(); }

        ctx.track(() => { ctx.state('submitting', isSubmitting()); });

        // i18n: prop overrides registry. Empty string = use registry. 'none' = hide.
        const _submitDefault = getComponentString('form-actions', 'submit');
        const _resetDefault = getComponentString('form-actions', 'reset');

        function submitText(): string {
            const prop = ctx.submitLabel() as string;
            return prop || _submitDefault();
        }

        function resetText(): string {
            const prop = ctx.resetLabel() as string;
            if (prop === 'none') return '';
            return prop || _resetDefault();
        }

        return { isSubmitting, isDisabled, isDirty, onReset, submitText, resetText };
    },
    render: (ctx) => html`
        <div class="pdx-form-actions" data-part="root">
            <slot>
                ${() => ctx.resetText() ? html`
                    <button type="reset" class="pdx-ghost" data-part="reset"
                            :disabled="${ctx.isDisabled}">
                        ${ctx.resetText}
                    </button>
                ` : ''}
                <button type="submit" class="pdx-primary" data-part="submit"
                        :disabled="${ctx.isDisabled}">
                    ${() => ctx.isSubmitting() && ctx.showLoading()
                        ? html`<span class="pdx-spinner pdx-spinner-sm"></span> `
                        : ''}
                    ${ctx.submitText}
                </button>
            </slot>
        </div>
    `,
});
