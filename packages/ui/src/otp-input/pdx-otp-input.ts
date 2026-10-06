// pdx-otp-input — N-cell code input with auto-advance, paste spread, backspace nav.
// Uses imperative DOM for dynamic cell count. Each cell is a native <input>.

import { component, html, useFormAssociated } from '@pdxui/core';
import { uiString, format, uiAttr} from '../shared/i18n';
import { setOwnProp } from '../shared/own-prop';

/**
 * A one-time code input, one character per cell, that advances as the user types, spreads a pasted
 * code across the cells and steps back on Backspace.
 */
component('pdx-otp-input', {
    formAssociated: true,
    props: {
        length: { type: Number, default: 6 },
        value: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        error: { type: Boolean, default: false },
        size: { type: String, default: '' },
        numeric: { type: Boolean, default: true },
        mask: { type: Boolean, default: false },
        separator: { type: Number, default: 0 },
        /** The cells' group name. Empty: the otp-input.label component string, «Verification code». */
        label: { type: String, default: '' },
        /** The cells' autocomplete: 'one-time-code' lets the browser offer a code it received by SMS. */
        autocomplete: { type: String, default: 'one-time-code' },
    },
    setup(ctx) {
        let cells: string[] = [];
        let inputs: HTMLInputElement[] = [];
        // `value` is the live code: every digit writes it. The track below rebuilds
        // the cells when `value` changes, so it skips its own reflection — rebuilding would drop
        // focus after every digit.
        let _reflected: string | null = null;
        let _builtShape = '';

        function emitValue() {
            const val = cells.join('');
            _reflected = val;
            setOwnProp(ctx.el, 'value', val);
            ctx.emit('pdx-input', { value: val });
            // Completion = every slot filled. Not `val.indexOf('') === -1`, which is always false
            // (indexOf('') returns 0), so pdx-complete would never fire.
            const len = ctx.length() as number;
            if (cells.length === len && cells.every(c => c !== '')) {
                ctx.emit('pdx-complete', { value: val });
            }
        }

        function handleInput(idx: number, e: Event) {
            const input = e.target as HTMLInputElement;
            let char = input.value.slice(-1);
            if (ctx.numeric() && char && !/^\d$/.test(char)) {
                input.value = cells[idx] || '';
                return;
            }
            cells[idx] = char;
            input.value = char;
            emitValue();
            // Auto-advance
            if (char && idx < inputs.length - 1) {
                inputs[idx + 1].focus();
                inputs[idx + 1].select();
            }
        }

        function handleKeydown(idx: number, e: KeyboardEvent) {
            if (e.key === 'Backspace') {
                e.preventDefault();
                const input = inputs[idx];
                if (cells[idx]) {
                    cells[idx] = '';
                    input.value = '';
                    emitValue();
                } else if (idx > 0) {
                    cells[idx - 1] = '';
                    inputs[idx - 1].value = '';
                    inputs[idx - 1].focus();
                    emitValue();
                }
            } else if (e.key === 'ArrowLeft' && idx > 0) {
                e.preventDefault();
                inputs[idx - 1].focus();
            } else if (e.key === 'ArrowRight' && idx < inputs.length - 1) {
                e.preventDefault();
                inputs[idx + 1].focus();
            }
        }

        function handlePaste(e: ClipboardEvent) {
            e.preventDefault();
            const paste = (e.clipboardData?.getData('text') || '').trim();
            const chars = ctx.numeric() ? paste.replace(/\D/g, '') : paste;
            const startIdx = inputs.indexOf(e.target as HTMLInputElement);
            if (startIdx < 0) return;

            for (let i = 0; i < chars.length && startIdx + i < cells.length; i++) {
                cells[startIdx + i] = chars[i];
                inputs[startIdx + i].value = chars[i];
            }
            emitValue();
            const lastIdx = Math.min(startIdx + chars.length, inputs.length) - 1;
            if (inputs[lastIdx]) inputs[lastIdx].focus();
        }

        function handleFocus(e: FocusEvent) {
            (e.target as HTMLInputElement).select();
        }

        // Build cells imperatively (after render)
        ctx.track(() => {
            // Read all reactive props to subscribe
            const len = ctx.length() as number;
            const sep = ctx.separator() as number;
            const val = ctx.value() as string;
            const disabled = ctx.disabled();
            const isError = ctx.error();
            const isMask = ctx.mask();
            const isNumeric = ctx.numeric();
            const size = ctx.size() as string;
            const groupName = (ctx.label() as string) || uiString('otp-input', 'label');
            const autocomplete = (ctx.autocomplete() as string) || 'one-time-code';
            const shape = JSON.stringify([len, sep, disabled, isError, isMask, isNumeric, size, groupName, autocomplete]);
            if (val === _reflected && shape === _builtShape) return;
            _builtShape = shape;

            requestAnimationFrame(() => {
            const container = ctx.el.querySelector('.pdx-otp-container') as HTMLElement;
            if (!container) return;

            // Set wrapper classes
            let cls = 'pdx-otp-wrap';
            if (size) cls += ' pdx-otp-' + size;
            if (isError) cls += ' error';
            if (disabled) cls += ' disabled';
            container.className = cls;
            // One named group around the cells: without it a screen reader hears "Digit 1, edit text"
            // with no idea what code it is entering.
            container.setAttribute('role', 'group');
            container.setAttribute('aria-label', groupName);

            // Clear and rebuild
            container.innerHTML = '';
            cells = [];
            inputs = [];

            for (let i = 0; i < len; i++) {
                // Separator
                if (sep > 0 && i > 0 && i % sep === 0) {
                    const sepEl = document.createElement('span');
                    sepEl.className = 'pdx-otp-separator';
                    sepEl.textContent = '-';
                    container.appendChild(sepEl);
                }

                const input = document.createElement('input');
                input.className = 'pdx-otp-cell';
                input.type = isMask ? 'password' : 'text';
                input.inputMode = isNumeric ? 'numeric' : 'text';
                input.maxLength = 2; // Allow typing to trigger input event
                input.setAttribute('autocomplete', autocomplete);
                // "Digit 1 of 6": the position and the length.
                uiAttr(input, 'aria-label', () => format(uiString('otp-input', 'digit'), { n: i + 1, total: len })); // an accessible name per cell (axe label)
                input.value = val[i] || '';
                if (disabled) input.disabled = true;

                cells.push(val[i] || '');
                inputs.push(input);

                const idx = i;
                input.addEventListener('input', (e) => handleInput(idx, e));
                input.addEventListener('keydown', (e) => handleKeydown(idx, e));
                input.addEventListener('focus', handleFocus);

                container.appendChild(input);
            }

            // Paste handler on container — remove-then-add: the track re-runs on
            // prop changes, and the handler would pile up.
            container.removeEventListener('paste', handlePaste);
            container.addEventListener('paste', handlePaste);
            }); // end requestAnimationFrame
        });

        // The prop, not `cells`: a plain array is not reactive, so the form value never followed typing.
        useFormAssociated(ctx, { getFormValue: () => { const v = ctx.value() as string; return v ? v : null; } });

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                for (let i = 0; i < cells.length; i++) { cells[i] = ''; if (inputs[i]) inputs[i].value = ''; }
                (ctx.el as any).value = '';
                ctx.emit('pdx-input', { value: '' });
            },
        });

        return {};
    },
    render: () => html`<div class="pdx-otp-container pdx-otp-wrap"></div>`,
});
