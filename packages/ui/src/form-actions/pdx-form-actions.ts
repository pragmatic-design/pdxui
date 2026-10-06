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
 */
component('pdx-form-actions', {
    props: {
        /** Submit button label. Uses i18n registry default if not set. */
        submitLabel: { type: String, default: '' },
        /** Reset button label. Set to 'none' to hide. Uses i18n registry default if not set. */
        resetLabel: { type: String, default: '' },
        /** Alignment: 'start' | 'center' | 'end' | 'between'. Default: 'end'. */
        align: { type: String, default: 'end' },
        /** Show loading spinner on submit button while submitting. */
        showLoading: { type: Boolean, default: true },
    },
    setup(ctx) {
        // Looked up when read, and kept once found: set up before its <pdx-form>, a one-time lookup
        // at setup would never find it. See tryUseForm(from).
        let _form: Form<any> | undefined;
        const form = (): Form<any> | undefined => _form ??= tryUseForm(ctx.el) as Form<any> | undefined;

        function isSubmitting(): boolean { return form()?.submitting() ?? false; }
        function isDisabled(): boolean { return form()?.submitting() ?? false; }
        function isDirty(): boolean { return form()?.dirty() ?? false; }
        function onReset(): void { form()?.reset(); }

        function wrapClass(): string {
            let cls = 'pdx-form-actions';
            const align = ctx.align() as string;
            if (align) cls += ' pdx-form-actions-' + align;
            return cls;
        }

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

        return { isSubmitting, isDisabled, isDirty, onReset, wrapClass, submitText, resetText };
    },
    render: (ctx) => html`
        <div :class="${ctx.wrapClass}">
            <slot>
                ${() => ctx.resetText() ? html`
                    <button type="reset" class="pdx-ghost"
                            :disabled="${ctx.isDisabled}">
                        ${ctx.resetText}
                    </button>
                ` : ''}
                <button type="submit" class="pdx-primary"
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
