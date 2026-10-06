// pdx-masked-input — Input with pattern mask (phone, credit card, date, custom).
// Auto-formats as user types, manages cursor position around mask chars.

import { component, html, signal, useFormAssociated } from '@pdxui/core';
import { setOwnProp, reflectNameToHost } from '../shared/own-prop';

/**
 * Country calling codes of one and two digits (ITU-T E.164); every other code has three. The codes
 * are prefix-free, so the first digits typed say how long the code is: the mask engine has no
 * optional slot, and does not need one for this.
 */
const CC_ONE = new Set(['1', '7']);
const CC_TWO = new Set([
    '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
    '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66',
    '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
]);

/** How many digits of `digits` are the country code: 1 to 3, read from the prefix. */
function countryCodeLength(digits: string): number {
    if (CC_ONE.has(digits.slice(0, 1))) return 1;
    if (digits.length < 2 || CC_TWO.has(digits.slice(0, 2))) return 2;
    return 3;
}

/**
 * Built-in masks. A preset is a pattern, or a pattern chosen from the digits typed so far.
 * `phone-intl` is not a fixed `+## (###) ###-####`: that makes every country code two digits, and a
 * +1 number typed as 15551234567 would become "+15 (551) 234-567". `date` is month/day/year.
 */
const MASKS: Record<string, string | ((digits: string) => string)> = {
    phone: '(###) ###-####',
    'phone-intl': (digits) => '+' + '#'.repeat(countryCodeLength(digits)) + ' (###) ###-####',
    card: '#### #### #### ####',
    date: '##/##/####',
    time: '##:##',
    ssn: '###-##-####',
    zip: '#####',
    'zip-ext': '#####-####',
};

/**
 * A complete `date` (MM/DD/YYYY) or `time` (HH:MM) value out of range: month 13, day 30 of February,
 * hour 24. A mask formats and does not judge, so the digits are kept as typed; the field says it is
 * invalid instead. An incomplete value, or any other mask, is not judged.
 */
function outOfRange(preset: string, digits: string): boolean {
    if (preset === 'date' && digits.length === 8) {
        const month = Number(digits.slice(0, 2));
        const day = Number(digits.slice(2, 4));
        const year = Number(digits.slice(4));
        if (month < 1 || month > 12 || day < 1) return true;
        // Day 0 of the next month is the last day of this one.
        return day > new Date(Date.UTC(year, month, 0)).getUTCDate();
    }
    if (preset === 'time' && digits.length === 4) {
        return Number(digits.slice(0, 2)) > 23 || Number(digits.slice(2)) > 59;
    }
    return false;
}

/**
 * An input that formats what the user types to a pattern, a built-in preset such as phone, card or
 * date, or a custom one.
 */
component('pdx-masked-input', {
    formAssociated: true,
    props: {
        value: { type: String, default: '' },
        /**
         * Mask pattern: # = digit, A = letter, * = any. Or a preset: phone, phone-intl (a 1-3 digit
         * country code, read from its prefix), card, date (MM/DD/YYYY), time (HH:MM), ssn, zip,
         * zip-ext. A complete date or time out of range sets aria-invalid, and the events carry
         * `valid: false`.
         */
        mask: { type: String, default: '' },
        placeholder: { type: String, default: '' },
        ariaLabel: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        size: { type: String, default: '' },
        error: { type: Boolean, default: false },
        name: { type: String, default: '' },
        /** Character shown for unfilled positions */
        placeholderChar: { type: String, default: '_' },
    },
    setup(ctx) {
        const displayValue = signal('');
        /** Bumped by every write to the field; a frame with a stale token does not write. */
        let writeGen = 0;

        /** The pattern for `text`: a preset chosen from its digits (phone-intl), or the mask as written. */
        function getMask(text = ''): string {
            const m = ctx.mask() as string;
            const preset = MASKS[m];
            if (typeof preset === 'function') return preset(text.replace(/\D/g, ''));
            return preset || m;
        }

        function applyMask(raw: string): string {
            const mask = getMask(raw);
            if (!mask) return raw;
            let result = '';
            let rawIdx = 0;
            for (let i = 0; i < mask.length && rawIdx < raw.length; i++) {
                const mc = mask[i];
                if (mc === '#') {
                    // Digit
                    while (rawIdx < raw.length && !/\d/.test(raw[rawIdx])) rawIdx++;
                    if (rawIdx < raw.length) result += raw[rawIdx++];
                    else break;
                } else if (mc === 'A') {
                    // Letter
                    while (rawIdx < raw.length && !/[a-zA-Z]/.test(raw[rawIdx])) rawIdx++;
                    if (rawIdx < raw.length) result += raw[rawIdx++];
                    else break;
                } else if (mc === '*') {
                    // Any
                    result += raw[rawIdx++];
                } else {
                    // Literal mask char — insert it
                    result += mc;
                }
            }
            return result;
        }

        function stripMask(formatted: string): string {
            const mask = getMask(formatted);
            if (!mask) return formatted;
            let raw = '';
            for (let i = 0; i < formatted.length; i++) {
                const mc = i < mask.length ? mask[i] : null;
                if (mc === '#' || mc === 'A' || mc === '*') {
                    raw += formatted[i];
                }
            }
            return raw;
        }

        function onInput(e: Event) {
            const input = e.target as HTMLInputElement;
            const raw = input.value;
            const masked = applyMask(raw);
            displayValue.set(masked);

            // Restore cursor position.
            //
            // The frame carries a generation token, and a stale one drops its write. Without it the
            // frame puts back the value captured when it was scheduled, undoing anything that has
            // changed the field since — typing, then clear(), would leave the field reading what had
            // been typed, because the keystroke's frame lands after and writes it again. Two
            // keystrokes in one frame are safe on their own (the later frame runs last and wins); a
            // write that does NOT come through here is not. (See renderGen in core's
            // renderer/helpers.ts for the same guard against the same class.)
            const gen = ++writeGen;
            requestAnimationFrame(() => {
                if (input && gen === writeGen) input.value = masked;
            });

            const unmasked = stripMask(masked);
            // `value` is the unmasked value, as the prop is read (applyMask(value) is the display).
            setOwnProp(ctx.el, 'value', unmasked);
            ctx.emit('pdx-input', { value: unmasked, formatted: masked, valid: isValid() });
        }

        function onChange() {
            const unmasked = stripMask(displayValue() as string);
            setOwnProp(ctx.el, 'value', unmasked);
            ctx.emit('pdx-change', { value: unmasked, formatted: displayValue(), valid: isValid() });
        }

        /** False while a complete date/time preset value is out of range. */
        function isValid(): boolean {
            return !outOfRange(ctx.mask() as string, stripMask(displayValue() as string));
        }

        function onFocus() { ctx.emit('pdx-focus'); }
        function onBlur() { ctx.emit('pdx-blur'); }

        function wrapClass(): string {
            let cls = 'pdx-input-wrap';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-input-' + s;
            if (ctx.disabled()) cls += ' disabled';
            if (ctx.error() || !isValid()) cls += ' error';
            return cls;
        }

        function getPlaceholder(): string {
            if (ctx.placeholder()) return ctx.placeholder() as string;
            const mask = getMask();
            if (!mask) return '';
            const pc = ctx.placeholderChar() as string || '_';
            return mask.replace(/#|A|\*/g, pc);
        }

        function getInputmode(): string {
            const mask = getMask();
            if (!mask) return 'text';
            // Digit slots and literals only: a numeric keyboard. The colon is in the set, or the time
            // preset would open a text keyboard for a field that takes only digits.
            return /^[#\s\-()/.+:]+$/.test(mask) ? 'numeric' : 'text';
        }

        ctx.track(() => {
            const propVal = ctx.value() as string;
            if (propVal) displayValue.set(applyMask(propVal));
        });

        useFormAssociated(ctx, { getFormValue: () => { const v = stripMask(displayValue() as string); return v != null && v !== '' ? v : null; } });
        // The host is the one submitter: the unmasked value, under the host's name. The inner input
        // does not carry the name, or it would send the masked text a second time.
        reflectNameToHost(ctx);

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                // Invalidate any frame a keystroke left pending, or it writes the old value back
                // after this line.
                writeGen++;
                displayValue.set('');
                const inp = ctx.el.querySelector('input') as HTMLInputElement | null;
                if (inp) inp.value = '';
                (ctx.el as any).value = '';
                ctx.emit('pdx-change', { value: '', formatted: '' });
            },
            /** Select the whole text, so the next keystroke replaces it. Does not focus first. */
            selectText() { (ctx.el.querySelector('input,textarea') as HTMLInputElement)?.select(); },
        });

        return { displayValue, wrapClass, getPlaceholder, getInputmode, onInput, onChange, onFocus, onBlur, isValid };
    },
    render: (ctx) => html`
        <div :class="${ctx.wrapClass}">
            <input
                class="pdx-input"
                type="text"
                autocomplete="off"
                data-lpignore="true"
                data-1p-ignore=""
                data-form-type="other"
                :value="${ctx.displayValue}"
                :placeholder="${ctx.getPlaceholder}"
                :inputmode="${ctx.getInputmode}"
                :disabled="${ctx.disabled}"
                :aria-label="${() => ctx.ariaLabel() || null}"
                :aria-invalid="${() => ctx.error() || !ctx.isValid() ? 'true' : null}"
                @input="${ctx.onInput}"
                @change="${ctx.onChange}"
                @focus="${ctx.onFocus}"
                @blur="${ctx.onBlur}"
            />
        </div>
    `,
});
