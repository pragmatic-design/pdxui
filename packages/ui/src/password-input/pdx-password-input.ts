// pdx-password-input — Input with toggle visibility and optional strength meter.
// Uses pdx-input wrapper pattern. Toggle button in suffix position.

import { component, html, signal } from '@pdxui/core';
import { uiString } from '../shared/i18n';
import { setOwnProp } from '../shared/own-prop';

let _pwSeq = 0;

/**
 * A password field the user can reveal or hide, with an optional strength meter below it.
 */
component('pdx-password-input', {
    formAssociated: true,
    props: {
        value: { type: String, default: '' },
        placeholder: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        readonly: { type: Boolean, default: false },
        required: { type: Boolean, default: false },
        size: { type: String, default: '' },
        error: { type: Boolean, default: false },
        name: { type: String, default: '' },
        ariaLabel: { type: String, default: '' },
        /** Show strength meter below input */
        showStrength: { type: Boolean, default: false },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    setup(ctx) {
        const visible = signal(false);
        const liveValue = signal('');

        function toggleVisibility() {
            if (ctx.disabled()) return;
            visible.set(!visible.peek());
        }

        function wrapClass(): string {
            let cls = 'pdx-input-wrap';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-input-' + s;
            if (ctx.disabled()) cls += ' disabled';
            if (ctx.error()) cls += ' error';
            return cls;
        }

        function onInput(e: Event) {
            const val = (e.target as HTMLInputElement).value;
            liveValue.set(val);
            setOwnProp(ctx.el, 'value', val);
            ctx.emit('pdx-input', { value: val });
        }

        function onChange(e: Event) {
            const val = (e.target as HTMLInputElement).value;
            setOwnProp(ctx.el, 'value', val);
            ctx.emit('pdx-change', { value: val });
        }

        function onFocus() { ctx.emit('pdx-focus'); }
        function onBlur() { ctx.emit('pdx-blur'); }

        function onWrapClick(e: Event) {
            const t = e.target as HTMLElement;
            if (t.tagName === 'INPUT' || t.tagName === 'BUTTON') return;
            ctx.el.querySelector('input')?.focus();
        }

        // Strength: 0=none (empty), 1=weak, 2=fair, 3=good, 4=strong. Anything typed is at least weak:
        // "abc" does not score 0 and show no label at all.
        function strength(): number {
            const v = liveValue() as string;
            if (!v) return 0;
            let score = 0;
            if (v.length >= 8) score++;
            if (v.length >= 12) score++;
            if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
            if (/\d/.test(v)) score++;
            if (/[^A-Za-z0-9]/.test(v)) score++;
            return Math.max(1, Math.min(4, score));
        }

        function strengthLabel(): string {
            const s = strength();
            if (s === 0) return '';
            if (s === 1) return uiString('password-input', 'weak');
            if (s === 2) return uiString('password-input', 'fair');
            if (s === 3) return uiString('password-input', 'good');
            return uiString('password-input', 'strong');
        }

        // The meter's text describes the input, and is announced politely as it changes, not
        // visual only.
        const strengthId = 'pdx-pw-strength-' + (++_pwSeq);
        const describedBy = (): string | null => (ctx.showStrength() && strength() > 0 ? strengthId : null);

        function strengthColor(): string {
            const s = strength();
            if (s <= 1) return 'var(--pdx-color-danger)';
            if (s === 2) return 'var(--pdx-color-warning)';
            if (s === 3) return 'var(--pdx-color-info, var(--pdx-color-primary))';
            return 'var(--pdx-color-success)';
        }

        ctx.track(() => {
            if (ctx.loading()) ctx.el.setAttribute('aria-busy', 'true');
            else ctx.el.removeAttribute('aria-busy');

            const propVal = ctx.value() as string;
            if (propVal) liveValue.set(propVal);
        });

        // The inner <input type="password"> submits: `name` and form ownership are what password
        // managers read. The host does not submit, or it would send the value a second time.

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                liveValue.set('');
                const inp = ctx.el.querySelector('input') as HTMLInputElement | null;
                if (inp) inp.value = '';
                (ctx.el as any).value = '';
                ctx.emit('pdx-change', { value: '' });
            },
            /** Select the whole text, so the next keystroke replaces it. Does not focus first. */
            selectText() { (ctx.el.querySelector('input,textarea') as HTMLInputElement)?.select(); },
        });

        return { visible, toggleVisibility, wrapClass, onInput, onChange, onFocus, onBlur, onWrapClick, strength, strengthLabel, strengthColor, strengthId, describedBy };
    },
    render: (ctx) => html`
        <div :class="${ctx.wrapClass}" @click="${ctx.onWrapClick}">
            <input
                class="pdx-input"
                :type="${() => ctx.visible() ? 'text' : 'password'}"
                :value="${ctx.value}"
                placeholder="${ctx.placeholder}"
                :disabled="${ctx.disabled}"
                :readonly="${ctx.readonly}"
                :required="${ctx.required}"
                :name="${ctx.name}"
                :aria-label="${() => ctx.ariaLabel() || null}"
                :aria-invalid="${() => ctx.error() ? 'true' : null}"
                :aria-describedby="${ctx.describedBy}"
                autocomplete="current-password"
                @input="${ctx.onInput}"
                @change="${ctx.onChange}"
                @focus="${ctx.onFocus}"
                @blur="${ctx.onBlur}"
            />
            <button class="pdx-input-suffix-interactive pdx-password-toggle" type="button"
                    :aria-label="${() => uiString('password-input', ctx.visible() ? 'hide' : 'show')}"
                    :disabled="${ctx.disabled}"
                    @click="${ctx.toggleVisibility}">
                ${() => ctx.visible() ? '○' : '◉'}
            </button>
        </div>
        ${() => ctx.showStrength() && ctx.strength() > 0 ? html`
            <div class="pdx-password-strength" aria-hidden="true">
                <div class="pdx-password-strength-track">
                    <div class="pdx-password-strength-fill" :style="${() => 'width:' + (ctx.strength() * 25) + '%;background:' + ctx.strengthColor()}"></div>
                </div>
                <span class="pdx-password-strength-label" :style="${() => 'color:' + ctx.strengthColor()}">${ctx.strengthLabel}</span>
            </div>
        ` : ''}
        ${() => ctx.showStrength() ? html`
            <span class="pdx-sr-only" :id="${() => ctx.strengthId}" aria-live="polite">${ctx.strengthLabel}</span>
        ` : ''}
    `,
});
