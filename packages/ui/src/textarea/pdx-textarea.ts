// pdx-textarea — Multi-line input with auto-resize, char/word count, sizes, states.
// Uses .pdx-input-wrap pattern for consistency with pdx-input.

import { component, html, signal } from '@pdxui/core';
import { setOwnProp } from '../shared/own-prop';

/**
 * A multi-line text input with auto-resize, a character or word count and validation states.
 */
component('pdx-textarea', {
    formAssociated: true,
    props: {
        value: { type: String, default: '' },
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
        size: { type: String, default: '' },
        error: { type: Boolean, default: false },
        success: { type: Boolean, default: false },
        warning: { type: Boolean, default: false },
        name: { type: String, default: '' },
        ariaLabel: { type: String, default: '' },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    setup(ctx) {
        // Looked up when needed: a setup-time capture runs before the template renders.
        const textareaEl = (): HTMLTextAreaElement | null => ctx.el.querySelector<HTMLTextAreaElement>('textarea');
        const liveValue = signal(ctx.value() as string || '');
        // Line height in px — measured once for autoresize calculations
        let lineHeight = 0;

        function wrapClass(): string {
            let cls = 'pdx-input-wrap pdx-textarea-wrap';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-input-' + s;
            if (ctx.disabled()) cls += ' disabled';
            if (ctx.readonly()) cls += ' readonly';
            if (ctx.error()) cls += ' error';
            if (ctx.success()) cls += ' success';
            if (ctx.warning()) cls += ' warning';
            return cls;
        }

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
            setOwnProp(ctx.el, 'value', ta.value);
            ctx.emit('pdx-input', { value: ta.value });
        }

        function onChange(e: Event) {
            const val = (e.target as HTMLTextAreaElement).value;
            setOwnProp(ctx.el, 'value', val);
            ctx.emit('pdx-change', { value: val });
        }

        function onFocus() { ctx.emit('pdx-focus'); }
        function onBlur() { ctx.emit('pdx-blur'); }

        function onWrapClick(e: Event) {
            const target = e.target as HTMLElement;
            if (target.tagName === 'TEXTAREA') return;
            textareaEl()?.focus();
        }

        ctx.track(() => {
            const el = ctx.el;

            if (ctx.loading()) el.setAttribute('aria-busy', 'true');
            else el.removeAttribute('aria-busy');

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
            clear() {
                liveValue.set('');
                const ta = textareaEl();
                if (ta) ta.value = '';
                (ctx.el as any).value = '';
                ctx.emit('pdx-change', { value: '' });
            },
            /** Select the whole text, so the next keystroke replaces it. Does not focus first. */
            selectText() { (ctx.el.querySelector('input,textarea') as HTMLInputElement)?.select(); },
        });

        return { wrapClass, getResize, onInput, onChange, onFocus, onBlur, onWrapClick, charCountText, wordCountText, isOverCount };
    },
    render: (ctx) => html`
        <div :class="${ctx.wrapClass}" @click="${ctx.onWrapClick}" style="height:auto;min-height:auto">
            <textarea
                class="pdx-input"
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
                :style="${() => 'resize:' + ctx.getResize() + ';width:100%'}"
                @input="${ctx.onInput}"
                @change="${ctx.onChange}"
                @focus="${ctx.onFocus}"
                @blur="${ctx.onBlur}"
            ></textarea>
        </div>
        ${() => {
            const show = ctx.showCount();
            const word = ctx.wordCount();
            if (!show && !word) return '';
            return html`<div class="pdx-textarea-footer">
                ${() => word ? html`<span class="pdx-input-count">${ctx.wordCountText}</span>` : html`<span></span>`}
                ${() => show ? html`<span class="${() => 'pdx-input-count' + (ctx.isOverCount() ? ' over' : '')}">${ctx.charCountText}</span>` : ''}
            </div>`;
        }}
    `,
});
