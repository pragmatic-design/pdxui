// pdx-input — Wrapper-based input with prefix/suffix, clearable, sizes, states.
// Uses .pdx-input-wrap pattern: border on wrapper, not on input.
// Foundation for all specialized inputs (number, password, search, masked, date).

import { component, event, html, model } from '@pdxui/core';
import { submitThroughInnerField } from '../shared/inner-field';
import { uiString } from '../shared/i18n';
import { dispatchCommit } from '../shared/commit-change';

// Password-manager (LastPass/1Password/Dashlane/…) overlay icons are noise on most fields
// (search, quantities, codes). We suppress them by DEFAULT and only opt in when the field
// declares a credential intent via the standard `autocomplete` token (or type=password).
// This keeps the opt-in standards-aligned: `autocomplete="username"` re-enables managers.
const PM_AUTOCOMPLETE_TOKENS = new Set([
    'username', 'email', 'current-password', 'new-password', 'one-time-code',
]);
function allowsPasswordManager(type: string, autocomplete: string): boolean {
    return type === 'password' || PM_AUTOCOMPLETE_TOKENS.has(autocomplete.trim());
}

/**
 * A text input with prefix and suffix content, a clear button and loading and validation states,
 * and the base of the specialized inputs.
 *
 * @slot prefix - Content inside the input's frame, before the text (an icon, a unit, a currency sign).
 * @slot suffix - Content inside the input's frame, after the text.
 *
 * @csspart root - The frame: border, background and the states' colours.
 * @csspart input - The native `<input>`, the textbox a form submits.
 * @csspart prefix - The `prefix` text, when set.
 * @csspart suffix - The `suffix` text, when set.
 * @csspart clear - The clear button, while `clearable` and neither `disabled` nor `readonly`.
 * @csspart spinner - The loading spinner, a `role="status"`, while `loading`.
 * @csspart count - The character count, with `show-count`.
 *
 * @cssstate invalid - `error` is set.
 * @cssstate success - `success` is set.
 * @cssstate warning - `warning` is set.
 * @cssstate disabled - `disabled` is set.
 * @cssstate readonly - `readonly` is set.
 * @cssstate loading - `loading` is set.
 * @cssstate over-limit - The text is longer than `maxlength`; the count shows it.
 *
 * @alphaevent pdx-input
 * @alphaevent pdx-change
 * @alphadetail value $event.currentTarget.value
 * @alphacommit pdx-change
 */
component('pdx-input', {
    // Typing writes it (#479), and the write dispatches `value-change`, live. The commit, on blur or
    // Enter, is the inner input's native `change`, which bubbles to the host.
    models: { value: model<string>('', { form: true }) },
    events: {
        /** The textbox received focus. */
        'pdx-focus': event<void>(),
        /** The textbox lost focus. */
        'pdx-blur': event<void>(),
        /** The clear button emptied the field, after its `value-change`. */
        'pdx-clear': event<void>(),
    },
    // The visual states, on the host as custom states (#132): a theme styles `pdx-input:state(invalid)`,
    // and the design CSS draws the frame from them. The frame carries no state class of its own.
    states: ['invalid', 'success', 'warning', 'disabled', 'readonly', 'loading', 'over-limit'],
    parts: ['root', 'input', 'prefix', 'suffix', 'clear', 'spinner', 'count'],
    // The axis inputs.css keys by (#627), reflected on the host; each value maps the class that draws
    // the same size on a native field. `md` is the base look, which no class adds to.
    variants: {
        /** xs, sm, md (the default), lg or xl — the same scale as pdx-button. */
        size: { md: '.pdx-input-md', xs: '.pdx-input-xs', sm: '.pdx-input-sm', lg: '.pdx-input-lg', xl: '.pdx-input-xl' },
    },
    props: {
        // `date` and `time` are the native input's, and a date field in a form is ordinary: the
        // enum lists them so the validator does not warn about `<pdx-input type="date">` on a page
        // where it works. `<pdx-date-picker>` remains the component
        // for a calendar, a format and a locale — this is the plain field.
        type: { type: String, default: 'text', enum: ['text', 'email', 'password', 'number', 'tel', 'url', 'search', 'date', 'time'] },
        placeholder: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        readonly: { type: Boolean, default: false },
        required: { type: Boolean, default: false },
        error: { type: Boolean, default: false },
        success: { type: Boolean, default: false },
        warning: { type: Boolean, default: false },
        clearable: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        name: { type: String, default: '' },
        maxlength: { type: Number, default: 0 },
        showCount: { type: Boolean, default: false },
        autofocus: { type: Boolean, default: false },
        autocomplete: { type: String, default: '' },
        inputmode: { type: String, default: '' },
        ariaLabel: { type: String, default: '' },
        /** Prefix text (e.g. "$", "https://"). For icons use slot. */
        prefix: { type: String, default: '' },
        /** Suffix text (e.g. "kg", ".com"). For icons use slot. */
        suffix: { type: String, default: '' },
    },
    setup(ctx) {
        // The inner field submits; a form reset puts it and the model back to the mounted text (#135).
        submitThroughInnerField(ctx);
        // The inner input, looked up when it is needed. Cached from a setup-time track, which runs
        // before the template renders, it would be null, and never looked up again while `value`
        // stays put — Clear would leave the text, autofocus and a click on the frame focus nothing.
        const inputEl = (): HTMLInputElement | null => ctx.el.querySelector<HTMLInputElement>('input.pdx-input');
        // `value` is the live value and the model: the user's typing is written to it, so the
        // count, the clear button and FormData read it — there is no private copy to drift.

        ctx.track(() => {
            ctx.state('invalid', !!ctx.error());
            ctx.state('success', !!ctx.success());
            ctx.state('warning', !!ctx.warning());
            ctx.state('disabled', !!ctx.disabled());
            ctx.state('readonly', !!ctx.readonly());
            ctx.state('loading', !!ctx.loading());
            ctx.state('over-limit', isOverCount());
        });

        function onInput(e: Event) {
            ctx.value.set((e.target as HTMLInputElement).value);
        }

        function onFocus() { ctx.emit('pdx-focus'); }
        function onBlur() { ctx.emit('pdx-blur'); }

        // A commit no typing produced: the model's write, then the native change a commit makes.
        function onClear() {
            if (ctx.disabled() || ctx.readonly()) return;
            const input = inputEl();
            if (input) {
                input.value = '';
                input.focus();
            }
            ctx.value.set('');
            dispatchCommit(input);
            ctx.emit('pdx-clear');
        }

        function onWrapClick(e: Event) {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') return;
            inputEl()?.focus();
        }

        // Signal first, DOM in the frame: the input does not exist yet when setup runs.
        ctx.track(() => {
            if (!ctx.autofocus()) return;
            requestAnimationFrame(() => inputEl()?.focus());
        });

        function countText(): string {
            const max = ctx.maxlength() as number;
            const len = String(ctx.value() ?? '').length;
            if (max > 0) return len + '/' + max;
            return '' + len;
        }

        function isOverCount(): boolean {
            const max = ctx.maxlength() as number;
            if (max <= 0) return false;
            return String(ctx.value() ?? '').length > max;
        }

        // The form value is the inner <input>'s own: it carries `name`, holds the value verbatim, and
        // keeps its form ownership for autofill and password managers. The host submits nothing of
        // its own, or the same text would go twice (`i = init, init`).

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() { onClear(); },
            /** Select the whole text, so the next keystroke replaces it. Does not focus first. */
            selectText() { (ctx.el.querySelector('input,textarea') as HTMLInputElement)?.select(); },
        });

        return { onInput, onFocus, onBlur, onClear, onWrapClick, countText };
    },
    render: (ctx) => html`
        <div class="pdx-input-wrap" data-part="root" @click="${ctx.onWrapClick}">
            ${() => ctx.prefix() ? html`<span class="pdx-input-prefix" data-part="prefix">${ctx.prefix}</span>` : ''}
            <slot name="prefix"></slot>
            <input
                class="pdx-input"
                data-part="input"
                type="${ctx.type}"
                :value="${ctx.value}"
                placeholder="${ctx.placeholder}"
                :disabled="${ctx.disabled}"
                :readonly="${ctx.readonly}"
                :required="${ctx.required}"
                :name="${ctx.name}"
                :maxlength="${() => {
                    const ml = ctx.maxlength() as number;
                    return ml > 0 ? ml : null;
                }}"
                :autofocus="${ctx.autofocus}"
                :autocomplete="${() => {
                    const ac = ctx.autocomplete() as string;
                    if (ac) return ac;
                    // No explicit token + no PM intent → 'off' (also nudges managers away).
                    return allowsPasswordManager(ctx.type() as string, '') ? undefined : 'off';
                }}"
                :data-lpignore="${() => allowsPasswordManager(ctx.type() as string, ctx.autocomplete() as string) ? null : 'true'}"
                :data-1p-ignore="${() => allowsPasswordManager(ctx.type() as string, ctx.autocomplete() as string) ? null : ''}"
                :data-form-type="${() => allowsPasswordManager(ctx.type() as string, ctx.autocomplete() as string) ? null : 'other'}"
                :inputmode="${() => ctx.inputmode() || undefined}"
                :aria-label="${() => ctx.ariaLabel() || undefined}"
                :aria-invalid="${() => ctx.error() ? 'true' : null}"
                :aria-required="${() => ctx.required() ? 'true' : null}"
                :aria-busy="${() => ctx.loading() ? 'true' : null}"
                @input="${ctx.onInput}"
                @focus="${ctx.onFocus}"
                @blur="${ctx.onBlur}"
            />
            ${() => ctx.clearable() && !ctx.disabled() && !ctx.readonly()
                ? html`<button class="pdx-input-clear pdx-input-suffix-interactive" data-part="clear" type="button" :aria-label="${() => uiString('input', 'clear')}" tabindex="-1" @click="${ctx.onClear}">\u00d7</button>`
                : ''}
            ${() => ctx.loading()
                ? html`<span class="pdx-input-loading" data-part="spinner" role="status" :aria-label="${() => uiString('input', 'loading')}"></span>`
                : ''}
            <slot name="suffix"></slot>
            ${() => ctx.suffix() ? html`<span class="pdx-input-suffix" data-part="suffix">${ctx.suffix}</span>` : ''}
        </div>
        ${() => ctx.showCount()
            ? html`<div class="pdx-input-count" data-part="count">${ctx.countText}</div>`
            : ''}
    `,
});
