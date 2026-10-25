// pdx-textarea — Multi-line input with auto-resize, char/word count, sizes, states.
// Uses .pdx-input-wrap pattern for consistency with pdx-input.

import { component, event, html, signal, model } from '@pdxui/core';
import { submitThroughInnerField } from '../shared/inner-field';
import { dispatchCommit } from '../shared/commit-change';

/**
 * A multi-line text input with auto-resize, a character or word count and validation states.
 *
 * @csspart root - The frame: border, background and the states' colours.
 * @csspart input - The native `<textarea>`, the textbox a form submits.
 * @csspart footer - The row under the frame that holds the counts, with `show-count` or `word-count`.
 * @csspart count - The character count, with `show-count`.
 * @csspart word-count - The word count, with `word-count`.
 *
 * @cssstate invalid - `error` is set.
 * @cssstate success - `success` is set.
 * @cssstate warning - `warning` is set.
 * @cssstate disabled - `disabled` is set.
 * @cssstate readonly - `readonly` is set.
 * @cssstate loading - `loading` is set.
 * @cssstate over-limit - The text is longer than `maxlength`; the character count shows it.
 *
 * @alphaevent pdx-input
 * @alphaevent pdx-change
 * @alphadetail value $event.currentTarget.value
 * @alphacommit pdx-change
 */
component('pdx-textarea', {
    // Typing writes it (#479), and the write dispatches `value-change`, live. The commit, on blur, is the
    // inner textarea's native `change`, which bubbles to the host.
    models: { value: model<string>('', { form: true }) },
    events: {
        /** The textbox received focus. */
        'pdx-focus': event<void>(),
        /** The textbox lost focus. */
        'pdx-blur': event<void>(),
    },
    // The visual states, on the host as custom states (#132), as pdx-input's: the frame carries no
    // state class of its own.
    states: ['invalid', 'success', 'warning', 'disabled', 'readonly', 'loading', 'over-limit'],
    parts: ['root', 'input', 'footer', 'count', 'word-count'],
    // The axis inputs.css keys by (#627), reflected on the host; each value maps the class that draws
    // the same size on a native field. `md` is the base look, which no class adds to.
    variants: {
        /** xs, sm, md (the default), lg or xl — the same scale as pdx-input. */
        size: { md: '.pdx-input-md', xs: '.pdx-input-xs', sm: '.pdx-input-sm', lg: '.pdx-input-lg', xl: '.pdx-input-xl' },
    },
    props: {
        placeholder: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        readonly: { type: Boolean, default: false },
        required: { type: Boolean, default: false },
        rows: { type: Number, default: 3 },
        minRows: { type: Number, default: 0 },
        maxRows: { type: Number, default: 0 },
        maxlength: { type: Number, default: 0 },
        showCount: { type: Boolean, default: false },
        wordCount: { type: Boolean, default: false },
        resize: { type: String, default: 'vertical' },
        error: { type: Boolean, default: false },
        success: { type: Boolean, default: false },
        warning: { type: Boolean, default: false },
        name: { type: String, default: '' },
        ariaLabel: { type: String, default: '' },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    setup(ctx) {
        // The inner field submits; a form reset puts it and the model back to the mounted text (#135).
        submitThroughInnerField(ctx);
        // Looked up when needed: a setup-time capture runs before the template renders.
        const textareaEl = (): HTMLTextAreaElement | null => ctx.el.querySelector<HTMLTextAreaElement>('textarea');
        const liveValue = signal(ctx.value() as string || '');
        // Line height in px — measured once for autoresize calculations
        let lineHeight = 0;

        ctx.track(() => {
            ctx.state('invalid', !!ctx.error());
            ctx.state('success', !!ctx.success());
            ctx.state('warning', !!ctx.warning());
            ctx.state('disabled', !!ctx.disabled());
            ctx.state('readonly', !!ctx.readonly());
            ctx.state('loading', !!ctx.loading());
            ctx.state('over-limit', isOverCount());
        });

        function getResize(): string {
            // Auto-resize mode disables manual resize handle
            if (ctx.minRows() || ctx.maxRows()) return 'none';
            return ctx.resize() as string || 'vertical';
        }

        function autoResize(ta: HTMLTextAreaElement) {
            const min = ctx.minRows() as number;
            const max = ctx.maxRows() as number;
            if (!min && !max) return;

            if (!lineHeight) {
                const cs = getComputedStyle(ta);
                lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
            }

            // Reset to measure real scrollHeight
            ta.style.height = 'auto';
            let target = ta.scrollHeight;

            if (min && lineHeight) {
                const minH = min * lineHeight;
                if (target < minH) target = minH;
            }
            if (max && lineHeight) {
                const maxH = max * lineHeight;
                if (target > maxH) {
                    target = maxH;
                    ta.style.overflowY = 'auto';
                } else {
                    ta.style.overflowY = 'hidden';
                }
            } else {
                ta.style.overflowY = 'hidden';
            }

            ta.style.height = target + 'px';
        }

        function onInput(e: Event) {
            const ta = e.target as HTMLTextAreaElement;
            liveValue.set(ta.value);
            autoResize(ta);
            ctx.value.set(ta.value);
        }

        function onFocus() { ctx.emit('pdx-focus'); }
        function onBlur() { ctx.emit('pdx-blur'); }

        function onWrapClick(e: Event) {
            const target = e.target as HTMLElement;
            if (target.tagName === 'TEXTAREA') return;
            textareaEl()?.focus();
        }

        ctx.track(() => {
            const propVal = ctx.value() as string;
            // '' is a legitimate reset: a truthy guard would ignore it and leave the char/word count
            // stale while the DOM empties.
            if (propVal != null) liveValue.set(propVal);

            // Initial auto-resize — the signals are read here, the textarea in the frame, where it
            // exists (read here, it is null and the first resize never runs).
            if (ctx.minRows() || ctx.maxRows()) {
                requestAnimationFrame(() => {
                    const ta = textareaEl();
                    if (ta) autoResize(ta);
                });
            }
        });

        function charCountText(): string {
            const len = (liveValue() as string).length;
            const max = ctx.maxlength() as number;
            if (max > 0) return len + '/' + max;
            return '' + len;
        }

        function wordCountText(): string {
            const text = (liveValue() as string).trim();
            if (!text) return '0 words';
            const count = text.split(/\s+/).length;
            return count + (count === 1 ? ' word' : ' words');
        }

        function isOverCount(): boolean {
            const max = ctx.maxlength() as number;
            if (max <= 0) return false;
            return (liveValue() as string).length > max;
        }

        // The inner <textarea> submits — it carries `name` and the value verbatim. The host does not send it
        // a second time.

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            // A commit no typing produced: the model's write, then the native change a commit makes.
            clear() {
                liveValue.set('');
                const ta = textareaEl();
                if (ta) ta.value = '';
                ctx.value.set('');
                dispatchCommit(ta);
            },
            /** Select the whole text, so the next keystroke replaces it. Does not focus first. */
            selectText() { (ctx.el.querySelector('input,textarea') as HTMLInputElement)?.select(); },
        });

        return { getResize, onInput, onFocus, onBlur, onWrapClick, charCountText, wordCountText };
    },
    render: (ctx) => html`
        <div class="pdx-input-wrap pdx-textarea-wrap" data-part="root" @click="${ctx.onWrapClick}" style="height:auto;min-height:auto">
            <textarea
                class="pdx-input"
                data-part="input"
                :value="${ctx.value}"
                placeholder="${ctx.placeholder}"
                :disabled="${ctx.disabled}"
                :readonly="${ctx.readonly}"
                :required="${ctx.required}"
                rows="${ctx.rows}"
                :maxlength="${() => {
                    const ml = ctx.maxlength() as number;
                    return ml > 0 ? ml : null;
                }}"
                :name="${ctx.name}"
                :aria-label="${() => ctx.ariaLabel() || null}"
                :aria-invalid="${() => ctx.error() ? 'true' : null}"
                :aria-required="${() => ctx.required() ? 'true' : null}"
                :aria-busy="${() => ctx.loading() ? 'true' : null}"
                :style="${() => 'resize:' + ctx.getResize() + ';width:100%'}"
                @input="${ctx.onInput}"
                @focus="${ctx.onFocus}"
                @blur="${ctx.onBlur}"
            ></textarea>
        </div>
        ${() => {
            const show = ctx.showCount();
            const word = ctx.wordCount();
            if (!show && !word) return '';
            return html`<div class="pdx-textarea-footer" data-part="footer">
                ${() => word ? html`<span class="pdx-input-count" data-part="word-count">${ctx.wordCountText}</span>` : html`<span></span>`}
                ${() => show ? html`<span class="pdx-input-count" data-part="count">${ctx.charCountText}</span>` : ''}
            </div>`;
        }}
    `,
});
