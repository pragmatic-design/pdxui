// pdx-number-input — Figma/Kakeibo-style number input.
// Cursor-position-aware step, sign toggle, locale formatting.
// Stepper buttons rendered OUTSIDE the input wrap (input-group style).

import { component, event, html, signal, model } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
import { resolveLocale, numberSeparators } from '../shared/locale';
import { dispatchCommit } from '../shared/commit-change';
import { placeBeforeCaret, caretAfterPlace } from './caret-digit';

/**
 * Empty is a state, as in the native `<input type="number">`: `null`, `undefined`, `''` and `NaN`
 * all mean "no number", not «0» (or `min`): a cleared field that snaps back to 0 shows a number
 * nobody entered as if it were data.
 */
function isEmptyValue(v: unknown): boolean {
    return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
}

/**
 * A number input the user steps by a step, or on the digit before the caret, with a sign toggle
 * and locale formatting.
 *
 * @csspart root - The group: the field and its stepper buttons.
 * @csspart field - The frame around the text: border, background and the states' colours.
 * @csspart input - The native `<input>` that shows the formatted number.
 * @csspart decrement - The button that steps down.
 * @csspart increment - The button that steps up.
 * @csspart sign - The sign button, with `allow-negative`.
 *
 * @cssstate invalid - `error` is set.
 * @cssstate disabled - `disabled` is set.
 * @cssstate loading - `loading` is set.
 * @cssstate negative - With `color-by-sign`, the number is below zero.
 * @cssstate positive - With `color-by-sign`, the number is above zero.
 *
 * @alphaevent pdx-input
 * @alphaevent pdx-change
 * @alphadetail value $event.currentTarget.value
 * @alphacommit pdx-change
 */
component('pdx-number-input', {
    // Typing and stepping write it (#479), and the write dispatches `value-change`, live. The commit is
    // the inner input's native `change`: the browser's on blur or Enter after typing, the component's own
    // after a step, as a native number input fires one for its spin buttons.
    models: {
        /** The number, or `null` when the field is empty. A form submits it clamped, and resets it (#135). */
        value: model<number | null>(null, { type: Number, form: true }),
    },
    events: {
        /** The textbox received focus. */
        'pdx-focus': event<void>(),
        /** The textbox lost focus. */
        'pdx-blur': event<void>(),
    },
    // The visual states, on the host as custom states (#132), as pdx-input's. The frame is the group's
    // `field` part, not the host's child: the design CSS reaches it through the `root` part.
    states: ['invalid', 'disabled', 'loading', 'negative', 'positive'],
    parts: ['root', 'field', 'input', 'decrement', 'increment', 'sign'],
    // The axis inputs.css keys by (#627), reflected on the host; each value maps the class that draws
    // the same size on a native field. `md` is the base look, which no class adds to.
    variants: {
        /** xs, sm, md (the default), lg or xl — the same scale as pdx-input. */
        size: { md: '.pdx-input-md', xs: '.pdx-input-xs', sm: '.pdx-input-sm', lg: '.pdx-input-lg', xl: '.pdx-input-xl' },
    },
    props: {
        min: { type: Number, default: -Infinity },
        max: { type: Number, default: Infinity },
        step: { type: Number, default: 1 },
        precision: { type: Number, default: -1 },
        /**
         * Show only the decimals the value has, up to `precision`: 29.5 at `precision="3"` is
         * "29.5", not "29.500". The value is still rounded to `precision`, and what the field
         * emits does not change.
         */
        trimZeros: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        readonly: { type: Boolean, default: false },
        error: { type: Boolean, default: false },
        placeholder: { type: String, default: '' },
        name: { type: String, default: '' },
        ariaLabel: { type: String, default: '' },
        /** 'both'=−left +right, 'right'=stacked on right, 'none'=hidden */
        controls: { type: String, default: 'both', enum: ['both', 'right', 'none'] },
        /**
         * What the arrow keys and the wheel step. `fixed`: one `step`. `caret`: the digit
         * before the caret — `12|3` ↑ is 133, `1.2|5` ↑ is 1.35 — and the caret stays on that digit.
         * `auto`, the default: `caret` with `controls="none"`, `fixed` with steppers shown.
         */
        stepMode: { type: String, default: 'auto', enum: ['auto', 'fixed', 'caret'] },
        allowWheel: { type: Boolean, default: false },
        allowNegative: { type: Boolean, default: false },
        /** Locale for formatting and for reading a typed value. Empty: the page's language (`lang`), then the browser's. */
        locale: { type: String, default: '' },
        currency: { type: String, default: '' },
        /** Color the number green (positive) / red (negative) */
        colorBySign: { type: Boolean, default: false },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    setup(ctx) {
        const initial = ctx.value() as unknown;
        let _value: number | null = isEmptyValue(initial) ? null : Number(initial);
        let _lastProp: unknown = undefined;   // last `value` prop we synced from — distinguishes parent changes from user typing
        const displayValue = signal('');
        // The form value: _value CLAMPED into min/max, which a parent's raw `value` may not be.
        const _liveValue = signal<number | null>(_value);
        let inputEl: HTMLInputElement | null = null;
        // Pending cursor restore position (-1 = no restore)
        let _restoreCursor = -1;
        // Pending caret restore by the digit's place value (null = none): after a caret step the caret
        // goes back after the digit it stepped, wherever the reformatted text puts it.
        let _restorePlace: number | null = null;

        /** Whether the arrows and the wheel step the digit before the caret. */
        function caretMode(): boolean {
            const mode = ctx.stepMode() as string;
            return mode === 'caret' || (mode !== 'fixed' && (ctx.controls() as string) === 'none');
        }

        // The prop, not the attribute's spellings `allownegative`/`allowNegative`: read from those
        // only, `allow-negative` and a property set from script would clamp a negative value to 0
        // and draw no sign button.
        function isNegativeAllowed(): boolean {
            return !!ctx.allowNegative();
        }

        function clamp(v: number): number {
            const mn = ctx.min() as number;
            let mx = ctx.max() as number;
            if (mx < mn) mx = mn;   // invariant: an effective max is never below min (max<min would be incoherent)
            if (!isNegativeAllowed() && v < 0) v = 0;
            return Math.max(mn, Math.min(mx, v));
        }

        function getPrecision(): number {
            const p = ctx.precision() as number;
            if (p >= 0) return p;
            const s = ctx.step() as number;
            const str = String(s);
            const dot = str.indexOf('.');
            return dot >= 0 ? str.length - dot - 1 : 0;
        }

        function roundTo(v: number): number {
            const p = getPrecision();
            const f = Math.pow(10, p);
            return Math.round(v * f) / f;
        }

        // The prop, then the page's lang, then the browser: an empty locale does not mean "no Intl",
        // or a comma typed in an Italian page would be dropped as a thousands separator.
        const locale = (): string => resolveLocale(ctx.el, ctx.locale() as string);

        function formatValue(v: number): string {
            const loc = locale();
            const cur = ctx.currency() as string;
            const p = getPrecision();
            if (cur) return new Intl.NumberFormat(loc, { style: 'currency', currency: cur }).format(v);
            // With `trim-zeros` the decimals drawn are the ones the value has; `precision` still
            // caps them, and still rounds.
            const min = ctx.trimZeros() ? 0 : p;
            return new Intl.NumberFormat(loc, { minimumFractionDigits: min, maximumFractionDigits: p }).format(v);
        }

        /** The typed text as a number, or null when it holds none (cleared, or only a sign). */
        function parseDisplay(display: string): number | null {
            const { decimal, group } = numberSeparators(locale());
            let cleaned = display;
            if (group) cleaned = cleaned.split(group).join('');
            if (decimal !== '.') cleaned = cleaned.split(decimal).join('.');
            cleaned = cleaned.replace(/[^0-9.\-]/g, '');
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        }

        /** Round and clamp a number; empty stays empty — min and max bound numbers only. */
        function normalize(v: number | null): number | null {
            return v === null ? null : clamp(roundTo(v));
        }

        // Display always shows absolute value when allowNegative (sign is in the button)
        function displayFormat(v: number | null): string {
            if (v === null) return '';
            return isNegativeAllowed() ? formatValue(Math.abs(v)) : formatValue(v);
        }

        /** Where a step starts: the value, or — on an empty field — 0, which clamp lifts to min. */
        function stepBase(): number {
            return _value ?? 0;
        }

        // Position the sign button adjacent to the centered text
        function positionSign() {
            const sb = (ctx.el as any).__signBtn as HTMLButtonElement | undefined;
            if (!sb || !inputEl) return;
            // Measure text width using a canvas
            const font = getComputedStyle(inputEl).font;
            const canvas = document.createElement('canvas');
            // No 2D context (an environment without canvas): nothing to measure with, so the sign
            // keeps its CSS position.
            const mctx = canvas.getContext('2d');
            if (!mctx) return;
            mctx.font = font;
            const textW = mctx.measureText(inputEl.value).width;
            const inputW = inputEl.offsetWidth;
            const signW = sb.offsetWidth;
            // Center of text is at inputW/2, text starts at inputW/2 - textW/2
            // Sign goes just before text start
            const left = Math.max(0, (inputW - textW) / 2 - signW - 2);
            sb.style.left = left + 'px';
        }

        // The value at the last commit. Typing moves _value and writes the model as it goes; blur or
        // Enter commits it, and the browser's own `change` is that commit.
        let _committed = _value;

        /** Write a committed value to the model. `_lastProp` first, so the value track below sees its
         *  own write and does not treat it as a parent change. */
        function reflect(v: number | null) {
            _committed = v;
            _lastProp = v;
            ctx.value.set(v);
        }

        /** Commit a typed value: the model already holds it, and the native input's `change` announces it. */
        function commit() {
            if (_value === _committed) return;
            reflect(_value);
        }

        function setValue(v: number | null) {
            const clamped = normalize(v);
            _value = clamped;
            _liveValue.set(clamped);
            const formatted = displayFormat(clamped);
            displayValue.set(formatted);
            if (inputEl) {
                inputEl.value = formatted;
                // Restore cursor immediately after DOM write
                if (_restorePlace !== null) {
                    const pos = caretAfterPlace(formatted, _restorePlace, numberSeparators(locale()).decimal);
                    inputEl.setSelectionRange(pos, pos);
                    _restorePlace = null;
                    _restoreCursor = -1;
                } else if (_restoreCursor >= 0) {
                    const pos = Math.min(_restoreCursor, formatted.length);
                    inputEl.setSelectionRange(pos, pos);
                    _restoreCursor = -1;
                }
            }
            // A value no typing produced — a step, the wheel, a key: the model's write, then the native
            // change a commit makes.
            reflect(clamped);
            dispatchCommit(inputEl);
            syncSign();
        }

        /**
         * The sign button's state: a "Negative" toggle, pressed while the value is negative. Not
         * named by its glyph, "−" or "+", which says neither what it does nor what the value is.
         */
        function syncSign() {
            const sb = (ctx.el as any).__signBtn as HTMLButtonElement | undefined;
            if (!sb) return;
            sb.className = 'pdx-number-sign ' + (isNeg() ? 'negative' : 'positive');
            sb.textContent = isNeg() ? '−' : '+';
            sb.setAttribute('aria-pressed', String(isNeg()));
            positionSign();
        }

        // Refresh the rendered value WITHOUT emitting (used when props change from the parent, not the
        // user). Emitting here would feed back into a parent that binds value→event and loop.
        function updateDisplay() {
            _liveValue.set(_value);
            const formatted = displayFormat(_value);
            displayValue.set(formatted);
            if (inputEl) inputEl.value = formatted;
            syncSign();
        }

        /**
         * Step the digit before the caret (`caret-digit.ts`): `12|34` the hundreds, `1.2|5` the tenths.
         * The decimal part takes the digit before the caret too, as the integer part does, so `1.2|5`
         * steps 0.1, not 0.01. The caret goes back after the same place.
         */
        function stepBy(dir: number, mult: number = 1) {
            if (ctx.disabled() || ctx.readonly()) return;
            if (!inputEl) return;
            // Read BEFORE setValue overwrites inputEl.value.
            const caret = inputEl.selectionStart ?? inputEl.value.length;
            const place = placeBeforeCaret(inputEl.value, caret, numberSeparators(locale()).decimal);
            _restorePlace = place;
            // Rounded at the place's own precision: 0.1 + 0.2 must not arrive as 0.30000000000000004.
            const decimals = Math.max(0, -Math.round(Math.log10(place)));
            const next = Number((stepBase() + place * mult * dir).toFixed(Math.min(20, decimals + getPrecision())));
            setValue(next);
        }

        function increment() {
            if (ctx.disabled() || ctx.readonly()) return;
            setValue(stepBase() + (ctx.step() as number));
        }
        function decrement() {
            if (ctx.disabled() || ctx.readonly()) return;
            setValue(stepBase() - (ctx.step() as number));
        }

        function toggleSign() {
            if (ctx.disabled() || ctx.readonly() || _value === null) return;
            setValue(-_value);
        }

        function onKeydown(e: KeyboardEvent) {
            // The rest of the spinbutton keys: PageUp/PageDown step ten steps, Home/End go
            // to min/max when there is one. As a spinbutton only: with controls="none" the field is a
            // text box, and its Home/End move the caret.
            if (isSpin() && !ctx.readonly()) {
                if (e.key === 'PageUp' || e.key === 'PageDown') {
                    e.preventDefault();
                    setValue(stepBase() + (ctx.step() as number) * 10 * (e.key === 'PageUp' ? 1 : -1));
                    return;
                }
                const bound = e.key === 'Home' ? ctx.min() as number : e.key === 'End' ? ctx.max() as number : NaN;
                if (Number.isFinite(bound)) { e.preventDefault(); setValue(bound); return; }
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const dir = e.key === 'ArrowUp' ? 1 : -1;
                const mult = e.shiftKey ? 10 : 1;
                // Always preserve cursor on keyboard step
                _restoreCursor = inputEl?.selectionStart ?? -1;
                if (caretMode()) stepBy(dir, mult);
                else setValue(stepBase() + (ctx.step() as number) * dir * mult);
                return;
            }
            if (e.key === 'Enter') commit();
            if (e.key === '-' && isNegativeAllowed()) { e.preventDefault(); if (_value !== null && _value > 0) setValue(-_value); return; }
            if (e.key === '+') { e.preventDefault(); if (_value !== null && _value < 0) setValue(-_value); return; }

            const ok = ['0','1','2','3','4','5','6','7','8','9',',','.','Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End','Enter'];
            if (!ok.includes(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
            if ((e.key === ',' || e.key === '.') && inputEl && (inputEl.value.includes(',') || inputEl.value.includes('.'))) e.preventDefault();
        }

        function onWheel(e: WheelEvent) {
            if (!ctx.allowWheel() || ctx.disabled() || document.activeElement !== inputEl) return;
            e.preventDefault();
            // The wheel follows the same mode as the arrows, or a field with steppers would step 1
            // with ↑ and 10 with the wheel on the tens.
            const dir = e.deltaY < 0 ? 1 : -1;
            if (caretMode()) stepBy(dir);
            else setValue(stepBase() + (ctx.step() as number) * dir);
        }

        function onInput(e: Event) {
            let num = parseDisplay((e.target as HTMLInputElement).value);
            // When allowNegative, display is always positive — apply current sign
            if (num !== null && isNegativeAllowed() && isNeg()) num = -Math.abs(num);
            _value = normalize(num);   // cleared text is empty, not 0
            // Make the typed value observable: the live state and the model, whose write dispatches
            // `value-change`. The input is not re-formatted here, to avoid clobbering the cursor while
            // the user is typing.
            _liveValue.set(_value);
            // `value` is live while typing, as a native input's is. Not reflect(): that also moves
            // _committed, which is the commit's business.
            _lastProp = _value;
            ctx.value.set(_value);
        }

        function onBlur() {
            // Re-format on blur (with full formatting)
            const formatted = displayFormat(_value);
            displayValue.set(formatted);
            if (inputEl) inputEl.value = formatted;
            commit();
            ctx.emit('pdx-blur');
        }

        function onFocus(e: FocusEvent) {
            const input = e.target as HTMLInputElement;
            if (_value === 0) {
                const sep = input.value.search(/[,.]/);
                requestAnimationFrame(() => sep > 0 ? input.setSelectionRange(0, sep) : input.select());
            }
            ctx.emit('pdx-focus');
        }

        // A layout class, not a state: the sign button sits inside the field.
        function inputWrapClass(): string {
            return ctx.allowNegative() ? 'pdx-input-wrap pdx-has-sign' : 'pdx-input-wrap';
        }

        ctx.track(() => {
            ctx.state('invalid', !!ctx.error());
            ctx.state('disabled', !!ctx.disabled());
            ctx.state('loading', !!ctx.loading());
            // The live value, a signal: `_value` is not, and the state would stay on the sign the
            // field was first rendered with.
            const v = ctx.colorBySign() ? _liveValue() : null;
            ctx.state('negative', v !== null && v < 0);
            ctx.state('positive', v !== null && v > 0);
        });

        /** A spinbutton: every layout with stepper controls. controls="none" is a plain text field. */
        function isSpin(): boolean { return (ctx.controls() as string || 'both') !== 'none'; }

        /** The value to assistive technology: the signed number, and its formatted text. */
        function ariaValueNow(): string | null {
            const v = _liveValue();
            return isSpin() && v !== null ? String(v) : null;
        }
        function ariaValueText(): string | null {
            const v = _liveValue();
            return isSpin() && v !== null ? formatValue(v) : null;
        }

        function controlsLayout(): string { return ctx.controls() as string || 'both'; }
        function isNeg(): boolean { return _value !== null && _value < 0; }

        // One-time setup after first render
        let _bound = false;

        ctx.track(() => {
            const el = ctx.el;

            // Subscribe to value/min/max so changes after mount re-sync the display.
            const propVal = ctx.value() as unknown;
            const fromProp = (): number | null => (isEmptyValue(propVal) ? null : Number(propVal));
            ctx.min(); ctx.max();
            if (!_bound) {
                _value = normalize(fromProp());   // clamp the INITIAL value into range; empty stays empty
                _liveValue.set(_value);
                _lastProp = propVal;
                _committed = _value;
            } else {
                // Reactive sync: a parent value change wins; otherwise re-clamp (min/max may have moved).
                // Object.is: NaN is a value like any other here, and never equals itself with !==.
                let next = _value;
                if (!Object.is(propVal, _lastProp)) { _lastProp = propVal; next = fromProp(); }
                next = normalize(next);
                if (!Object.is(next, _value)) { _value = next; _committed = next; updateDisplay(); }
            }

            requestAnimationFrame(() => {
                if (!_bound) {
                    _bound = true;
                    inputEl = el.querySelector('input') as HTMLInputElement;
                    if (inputEl) {
                        inputEl.value = displayFormat(_value);
                        inputEl.onkeydown = onKeydown;
                        inputEl.oninput = onInput;
                        inputEl.onblur = onBlur as any;
                        inputEl.onfocus = onFocus as any;
                        // Keep centered — sign button is part of the visual group
                        if (ctx.allowWheel()) {
                            inputEl.addEventListener('wheel', onWheel, { passive: false });
                        }
                    }
                    // Create sign button imperatively
                    if (isNegativeAllowed()) {
                        const slot = el.querySelector('.pdx-number-sign-slot');
                        if (slot) {
                            const signBtn = document.createElement('button');
                            signBtn.type = 'button';
                            signBtn.dataset.part = 'sign';
                            uiAttr(signBtn, 'aria-label', () => uiString('number-input', 'negative'));
                            signBtn.onclick = () => {
                                toggleSign();
                                syncSign();
                            };
                            slot.replaceWith(signBtn);
                            // Store ref for updates from keyboard
                            (el as any).__signBtn = signBtn;
                            syncSign();
                            // Position sign adjacent to centered text
                            requestAnimationFrame(() => positionSign());
                        }
                    }
                }
            });
        });

        ctx.formValue?.(() => _liveValue());

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                _value = null;
                _committed = null; // a blur right after clear() is not a second change
                _lastProp = null;
                _liveValue.set(null);
                displayValue.set('');
                if (inputEl) inputEl.value = '';
                // A commit no typing produced: the model's write, then the native change a commit makes.
                ctx.value.set(null);
                dispatchCommit(inputEl);
            },
            /** Select the whole text, so the next keystroke replaces it. Does not focus first. */
            selectText() { (ctx.el.querySelector('input,textarea') as HTMLInputElement)?.select(); },
        });

        /** Said once, in the field's description: the arrows change the digit before the caret. */
        function caretHint(): string | null {
            return caretMode() ? uiString('number-input', 'caretHint') : null;
        }

        return { displayValue, inputWrapClass, controlsLayout, isNeg, isNegativeAllowed, increment, decrement, toggleSign, onInput, onKeydown, onBlur, onFocus, ariaValueNow, ariaValueText, caretHint };
    },
    // The host is the one submitter, with the number unformatted. The inner input does not carry the
    // name, or it would send the grouped text ("12,345") a second time. After `setup`: TypeScript
    // infers setup's return before it types this function's context.
    host: { ':name': (ctx) => ctx.name() || null },
    render: (ctx) => html`
        <div class="pdx-input-group pdx-number-group" data-part="root">
            ${() => ctx.controlsLayout() === 'both'
                ? html`<button class="pdx-input-addon pdx-input-suffix-interactive" data-part="decrement" type="button" :aria-label="${() => uiString('number-input', 'decrease')}" :disabled="${ctx.disabled}" @click="${ctx.decrement}">−</button>`
                : ''}
            <div :class="${ctx.inputWrapClass}" data-part="field">
                <span class="pdx-number-sign-slot"></span>
                <input
                    class="pdx-input"
                    data-part="input"
                    type="text"
                    autocomplete="off"
                    data-lpignore="true"
                    data-1p-ignore=""
                    data-form-type="other"
                    inputmode="decimal"
                    :value="${ctx.displayValue}"
                    placeholder="${ctx.placeholder}"
                    :disabled="${ctx.disabled}"
                    :readonly="${ctx.readonly}"
                    :aria-label="${() => ctx.ariaLabel() || null}"
                    :aria-invalid="${() => ctx.error() ? 'true' : null}"
                    :role="${() => (ctx.controls() as string || 'both') === 'none' ? null : 'spinbutton'}"
                    :aria-valuemin="${() => isFinite(ctx.min() as number) ? String(ctx.min()) : null}"
                    :aria-valuemax="${() => isFinite(ctx.max() as number) ? String(ctx.max()) : null}"
                    :aria-valuenow="${ctx.ariaValueNow}"
                    :aria-valuetext="${ctx.ariaValueText}"
                    :aria-description="${ctx.caretHint}"
                    :aria-busy="${() => ctx.loading() ? 'true' : null}"
                    style="text-align:center"
                />
            </div>
            ${() => ctx.controlsLayout() === 'both'
                ? html`<button class="pdx-input-addon pdx-input-suffix-interactive" data-part="increment" type="button" :aria-label="${() => uiString('number-input', 'increase')}" :disabled="${ctx.disabled}" @click="${ctx.increment}">+</button>`
                : ctx.controlsLayout() === 'right'
                ? html`<div class="pdx-number-btn-stack">
                    <button class="pdx-number-btn-sm pdx-input-suffix-interactive" data-part="increment" type="button" :aria-label="${() => uiString('number-input', 'increase')}" :disabled="${ctx.disabled}" @click="${ctx.increment}">▲</button>
                    <button class="pdx-number-btn-sm pdx-input-suffix-interactive" data-part="decrement" type="button" :aria-label="${() => uiString('number-input', 'decrease')}" :disabled="${ctx.disabled}" @click="${ctx.decrement}">▼</button>
                  </div>`
                : ''}
        </div>
    `,
});
