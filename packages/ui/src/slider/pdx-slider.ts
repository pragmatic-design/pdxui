// pdx-slider — Single and range slider with keyboard nav, marks, labels.
// Custom DOM (not <input type="range">) for full control over track/fill/thumb styling.
// Uses PointerEvents for unified mouse/touch/pen. ARIA slider role.

import { component, html, signal, useFormAssociated } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
import { setOwnProp, reflectNameToHost } from '../shared/own-prop';

/**
 * A slider the user drags or moves from the keyboard to pick a value, or a range with two thumbs,
 * with marks and value labels.
 */
component('pdx-slider', {
    formAssociated: true,
    props: {
        value: { type: Number, default: 0 },
        min: { type: Number, default: 0 },
        max: { type: Number, default: 100 },
        step: { type: Number, default: 1 },
        disabled: { type: Boolean, default: false },
        ariaLabel: { type: String, default: '' },
        /** What the slider sets ("Volume"): the thumb's name, and in range mode "{label}, minimum" /
         *  "{label}, maximum". Not needed after a pdx-label, which names it. */
        label: { type: String, default: '' },
        orientation: { type: String, default: 'horizontal' },
        /** Comma-separated mark values, or "step" to show all steps */
        marks: { type: String, default: '' },
        /** Show value label on thumb while dragging */
        showLabel: { type: Boolean, default: false },
        /** Always show label (not just on drag) */
        labelAlways: { type: Boolean, default: false },
        name: { type: String, default: '' },
        size: { type: String, default: '' },
        error: { type: Boolean, default: false },
        /** Range mode: value is "min,max" */
        range: { type: Boolean, default: false },
        /** Minimum gap between thumbs in range mode */
        minGap: { type: Number, default: 0 },
        /** Color the fill portion */
        color: { type: String, default: '' },
    },
    setup(ctx) {
        let _value = 0;
        let _rangeMin = 0;
        let _rangeMax = 100;
        let trackEl: HTMLElement | null = null;
        let draggingThumb: 'single' | 'min' | 'max' | null = null;
        const isDragging = signal(false);
        // The form value: "min,max" in range mode, where `value` holds the array.
        const _formVal = signal<string>('');
        function syncFormVal() {
            _formVal.set(ctx.range() ? `${_rangeMin},${_rangeMax}` : String(_value));
        }

        function clamp(v: number): number {
            const mn = ctx.min() as number;
            const mx = ctx.max() as number;
            return Math.max(mn, Math.min(mx, v));
        }

        function snapToStep(v: number): number {
            const mn = ctx.min() as number;
            const s = ctx.step() as number;
            return mn + Math.round((v - mn) / s) * s;
        }

        function percent(v: number): number {
            const mn = ctx.min() as number;
            const mx = ctx.max() as number;
            if (mx === mn) return 0;
            return ((v - mn) / (mx - mn)) * 100;
        }

        function valueFromPointer(e: PointerEvent): number {
            if (!trackEl) return ctx.min() as number;
            const rect = trackEl.getBoundingClientRect();
            const isVert = (ctx.orientation() as string) === 'vertical';
            let ratio: number;
            if (isVert) {
                ratio = 1 - (e.clientY - rect.top) / rect.height;
            } else {
                ratio = (e.clientX - rect.left) / rect.width;
            }
            ratio = Math.max(0, Math.min(1, ratio));
            const mn = ctx.min() as number;
            const mx = ctx.max() as number;
            return snapToStep(mn + ratio * (mx - mn));
        }

        function emitChange() {
            syncFormVal();
            // `value` is live. In range mode it is written as the array the event
            // carries: the prop is a Number, and a "min,max" STRING would be coerced to NaN, which
            // the sync track below reads as "fall back to the attribute" — the initial range.
            if (ctx.range()) {
                setOwnProp(ctx.el, 'value', [_rangeMin, _rangeMax]);
                ctx.emit('pdx-change', { value: [_rangeMin, _rangeMax], min: _rangeMin, max: _rangeMax });
            } else {
                setOwnProp(ctx.el, 'value', _value);
                ctx.emit('pdx-change', { value: _value });
            }
        }

        function setSingleValue(v: number) {
            _value = clamp(snapToStep(v));
            emitChange();
            updateDOM();
        }

        function setRangeMin(v: number) {
            const gap = ctx.minGap() as number;
            v = clamp(snapToStep(v));
            if (v > _rangeMax - gap) v = _rangeMax - gap;
            _rangeMin = v;
            emitChange();
            updateDOM();
        }

        function setRangeMax(v: number) {
            const gap = ctx.minGap() as number;
            v = clamp(snapToStep(v));
            if (v < _rangeMin + gap) v = _rangeMin + gap;
            _rangeMax = v;
            emitChange();
            updateDOM();
        }

        function updateDOM() {
            const el = ctx.el;
            const fill = el.querySelector('.pdx-slider-fill') as HTMLElement;
            const isVert = (ctx.orientation() as string) === 'vertical';

            if (ctx.range()) {
                const thumbMin = el.querySelector('.pdx-slider-thumb-min') as HTMLElement;
                const thumbMax = el.querySelector('.pdx-slider-thumb-max') as HTMLElement;
                const pMin = percent(_rangeMin);
                const pMax = percent(_rangeMax);
                if (isVert) {
                    if (fill) { fill.style.bottom = pMin + '%'; fill.style.height = (pMax - pMin) + '%'; fill.style.left = ''; fill.style.width = ''; }
                    if (thumbMin) { thumbMin.style.bottom = pMin + '%'; thumbMin.style.left = ''; thumbMin.setAttribute('aria-valuenow', String(_rangeMin)); }
                    if (thumbMax) { thumbMax.style.bottom = pMax + '%'; thumbMax.style.left = ''; thumbMax.setAttribute('aria-valuenow', String(_rangeMax)); }
                } else {
                    if (fill) { fill.style.left = pMin + '%'; fill.style.width = (pMax - pMin) + '%'; fill.style.bottom = ''; fill.style.height = ''; }
                    if (thumbMin) { thumbMin.style.left = pMin + '%'; thumbMin.style.bottom = ''; thumbMin.setAttribute('aria-valuenow', String(_rangeMin)); }
                    if (thumbMax) { thumbMax.style.left = pMax + '%'; thumbMax.style.bottom = ''; thumbMax.setAttribute('aria-valuenow', String(_rangeMax)); }
                }
                // Labels
                const lMin = thumbMin?.querySelector('.pdx-slider-label') as HTMLElement;
                const lMax = thumbMax?.querySelector('.pdx-slider-label') as HTMLElement;
                if (lMin) lMin.textContent = String(_rangeMin);
                if (lMax) lMax.textContent = String(_rangeMax);
            } else {
                const thumb = el.querySelector('.pdx-slider-thumb') as HTMLElement;
                const p = percent(_value);
                if (isVert) {
                    if (fill) { fill.style.height = p + '%'; fill.style.width = ''; }
                    if (thumb) { thumb.style.bottom = p + '%'; thumb.style.left = ''; thumb.setAttribute('aria-valuenow', String(_value)); }
                } else {
                    if (fill) { fill.style.width = p + '%'; fill.style.height = ''; }
                    if (thumb) { thumb.style.left = p + '%'; thumb.style.bottom = ''; thumb.setAttribute('aria-valuenow', String(_value)); }
                }
                const label = thumb?.querySelector('.pdx-slider-label') as HTMLElement;
                if (label) label.textContent = String(_value);
            }
        }

        // Pointer drag
        function onPointerDown(e: PointerEvent) {
            if (ctx.disabled()) return;
            e.preventDefault();
            const target = e.target as HTMLElement;
            const el = ctx.el;

            if (ctx.range()) {
                if (target.closest('.pdx-slider-thumb-min')) draggingThumb = 'min';
                else if (target.closest('.pdx-slider-thumb-max')) draggingThumb = 'max';
                else {
                    // Click on track: move nearest thumb
                    const v = valueFromPointer(e);
                    const distMin = Math.abs(v - _rangeMin);
                    const distMax = Math.abs(v - _rangeMax);
                    if (distMin <= distMax) { draggingThumb = 'min'; setRangeMin(v); }
                    else { draggingThumb = 'max'; setRangeMax(v); }
                }
            } else {
                draggingThumb = 'single';
                setSingleValue(valueFromPointer(e));
            }

            isDragging.set(true);
            // Focus the active thumb for keyboard nav after click
            let thumbToFocus: HTMLElement | null = null;
            if (ctx.range()) {
                thumbToFocus = el.querySelector(draggingThumb === 'min' ? '.pdx-slider-thumb-min' : '.pdx-slider-thumb-max');
            } else {
                thumbToFocus = el.querySelector('.pdx-slider-thumb');
            }
            if (thumbToFocus) thumbToFocus.focus();

            el.setPointerCapture(e.pointerId);
            el.addEventListener('pointermove', onPointerMove);
            el.addEventListener('pointerup', onPointerUp);
        }

        function onPointerMove(e: PointerEvent) {
            if (!draggingThumb) return;
            const v = valueFromPointer(e);
            if (draggingThumb === 'single') setSingleValue(v);
            else if (draggingThumb === 'min') setRangeMin(v);
            else if (draggingThumb === 'max') setRangeMax(v);
        }

        function onPointerUp(e: PointerEvent) {
            const el = ctx.el;
            el.releasePointerCapture(e.pointerId);
            el.removeEventListener('pointermove', onPointerMove);
            el.removeEventListener('pointerup', onPointerUp);
            draggingThumb = null;
            isDragging.set(false);
            ctx.emit('pdx-change-end', ctx.range() ? { value: [_rangeMin, _rangeMax] } : { value: _value });
        }

        // Keyboard
        function onKeydown(e: KeyboardEvent) {
            if (ctx.disabled()) return;
            const target = e.target as HTMLElement;
            const step = ctx.step() as number;
            const bigStep = step * 10;
            let delta = 0;

            switch (e.key) {
                case 'ArrowRight': case 'ArrowUp': delta = step; break;
                case 'ArrowLeft': case 'ArrowDown': delta = -step; break;
                case 'PageUp': delta = bigStep; break;
                case 'PageDown': delta = -bigStep; break;
                case 'Home': delta = (ctx.min() as number) - 99999; break;
                case 'End': delta = (ctx.max() as number) + 99999; break;
                default: return;
            }
            e.preventDefault();

            if (ctx.range()) {
                if (target.closest('.pdx-slider-thumb-min')) setRangeMin(_rangeMin + delta);
                else if (target.closest('.pdx-slider-thumb-max')) setRangeMax(_rangeMax + delta);
            } else {
                setSingleValue(_value + delta);
            }
        }

        function rootClass(): string {
            let cls = 'pdx-slider';
            const s = ctx.size() as string;
            if (s) cls += ' pdx-slider-' + s;
            if (ctx.disabled()) cls += ' disabled';
            if (ctx.error()) cls += ' error';
            if ((ctx.orientation() as string) === 'vertical') cls += ' pdx-slider-vertical';
            if (isDragging()) cls += ' pdx-slider-dragging';
            if (ctx.showLabel() || ctx.labelAlways()) cls += ' pdx-slider-has-label';
            if (ctx.labelAlways()) cls += ' pdx-slider-label-always';
            const c = ctx.color() as string;
            if (c) cls += ' pdx-slider-' + c;
            return cls;
        }

        // Init + sync
        let _bound = false;
        ctx.track(() => {
            const el = ctx.el;
            const propVal = ctx.value() as number;
            const isRange = ctx.range();

            if (isRange) {
                // Parse "min,max" from prop value (string or number)
                const raw = String(propVal || el.getAttribute('value') || '0,100');
                const parts = raw.split(',').map(Number);
                _rangeMin = clamp(snapToStep(parts[0] || 0));
                _rangeMax = clamp(snapToStep(parts[1] || 100));
            } else {
                _value = clamp(snapToStep(propVal));
            }
            syncFormVal();

            requestAnimationFrame(() => {
                if (!_bound) {
                    _bound = true;
                    trackEl = el.querySelector('.pdx-slider-track');
                    el.addEventListener('pointerdown', onPointerDown);
                    el.addEventListener('keydown', onKeydown);

                    // Build marks imperatively
                    const marksStr = ctx.marks() as string;
                    if (marksStr) {
                        const marksContainer = el.querySelector('.pdx-slider-marks');
                        if (marksContainer) {
                            let values: number[];
                            if (marksStr === 'step') {
                                values = [];
                                const mn = ctx.min() as number;
                                const mx = ctx.max() as number;
                                const s = ctx.step() as number;
                                for (let v = mn; v <= mx; v += s) values.push(v);
                            } else {
                                values = marksStr.split(',').map(Number).filter(n => !isNaN(n));
                            }
                            for (const v of values) {
                                const mark = document.createElement('span');
                                mark.className = 'pdx-slider-mark';
                                const isVert = (ctx.orientation() as string) === 'vertical';
                                if (isVert) mark.style.bottom = percent(v) + '%';
                                else mark.style.left = percent(v) + '%';
                                marksContainer.appendChild(mark);
                            }
                        }
                    }
                }
                updateDOM();
            });
        });

        useFormAssociated(ctx, { getFormValue: () => { const v = _formVal(); return v !== '' ? v : null; } });
        // The host is the one submitter: a hidden input carrying the name would send the value a
        // second time.
        reflectNameToHost(ctx);

        // Imperative API: focus/blur/clear (clear resets to min)
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                const mn = ctx.min() as number;
                if (ctx.range()) {
                    setRangeMin(mn);
                    setRangeMax(mn);
                } else {
                    setSingleValue(mn);
                }
            },
        });

        return { rootClass, isDragging };
    },
    render: (ctx) => html`
        <div :class="${ctx.rootClass}" style="touch-action:none">
            <div class="pdx-slider-track">
                <div class="pdx-slider-fill"></div>
            </div>
            <div class="pdx-slider-marks"></div>
            ${() => ctx.range() ? html`
                <div class="pdx-slider-thumb pdx-slider-thumb-min" role="slider"
                    tabindex="0" :aria-label="${() => ctx.label()
                        ? format(uiString('slider', 'minimumOf'), { label: ctx.label() as string })
                        : uiString('slider', 'minimum')}"
                    :aria-valuemin="${ctx.min}" :aria-valuemax="${ctx.max}" aria-valuenow="0"
                    :aria-orientation="${ctx.orientation}">
                    <span class="pdx-slider-label"></span>
                </div>
                <div class="pdx-slider-thumb pdx-slider-thumb-max" role="slider"
                    tabindex="0" :aria-label="${() => ctx.label()
                        ? format(uiString('slider', 'maximumOf'), { label: ctx.label() as string })
                        : uiString('slider', 'maximum')}"
                    :aria-valuemin="${ctx.min}" :aria-valuemax="${ctx.max}" aria-valuenow="100"
                    :aria-orientation="${ctx.orientation}">
                    <span class="pdx-slider-label"></span>
                </div>
            ` : html`
                <div class="pdx-slider-thumb" role="slider"
                    tabindex="0" :aria-label="${() => ctx.ariaLabel() || ctx.label() || uiString('slider', 'value')}"
                    :aria-valuemin="${ctx.min}" :aria-valuemax="${ctx.max}" aria-valuenow="0"
                    :aria-orientation="${ctx.orientation}">
                    <span class="pdx-slider-label"></span>
                </div>
            `}
        </div>
    `,
});
