// pdx-color-picker — Color picker with spectrum panel, hue/alpha sliders, hex input, presets.
// Popup mode (default): swatch triggers floating panel. Inline mode: panel always visible.
// Internal state in HSV for natural spectrum mapping. Output in hex/rgb/hsl.

import { component, html, signal, computed, effect, useFormAssociated } from '@pdxui/core';
import { usePopover, overlayStack } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
import { setOwnProp, reflectNameToHost } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/color-picker';

let _pickerCounter = 0;

// ─── Color math (all internal, zero deps) ───────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hexToRgb(hex: string) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
    return '#' + [r, g, b].map(c => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('');
}

function rgbToHsv(r: number, g: number, b: number) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d + 6) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

function hsvToRgb(h: number, s: number, v: number) {
    s /= 100; v /= 100;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function hsvToHex(h: number, s: number, v: number) {
    const { r, g, b } = hsvToRgb(h, s, v);
    return rgbToHex(r, g, b);
}

function hsvToHsl(h: number, s: number, v: number) {
    s /= 100; v /= 100;
    const l = v * (1 - s / 2);
    const sl = (l === 0 || l === 1) ? 0 : (v - l) / Math.min(l, 1 - l);
    return { h: Math.round(h), s: Math.round(sl * 100), l: Math.round(l * 100) };
}

function parseColor(input: string): { h: number; s: number; v: number; a: number } | null {
    if (!input) return null;
    input = input.trim().toLowerCase();
    // hex (#rgb, #rrggbb, #rrggbbaa)
    if (/^#([0-9a-f]{3,8})$/.test(input)) {
        let hex = input.replace('#', ''), a = 1;
        if (hex.length === 4) { a = parseInt(hex[3] + hex[3], 16) / 255; hex = hex.slice(0, 3); }
        if (hex.length === 8) { a = parseInt(hex.slice(6), 16) / 255; hex = hex.slice(0, 6); }
        return { ...rgbToHsv(...Object.values(hexToRgb('#' + hex)) as [number, number, number]), a };
    }
    // rgb(r,g,b) / rgba(r,g,b,a)
    const rm = input.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
    if (rm) return { ...rgbToHsv(+rm[1], +rm[2], +rm[3]), a: rm[4] != null ? +rm[4] : 1 };
    // hsl(h,s%,l%) / hsla(h,s%,l%,a)
    const hm = input.match(/hsla?\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*(?:,\s*([\d.]+))?\)/);
    if (hm) {
        const [, hh, ss, ll, aa] = hm;
        const sl = +ss / 100, l = +ll / 100;
        const v = l + sl * Math.min(l, 1 - l);
        const sv = v === 0 ? 0 : 2 * (1 - l / v);
        return { h: +hh, s: sv * 100, v: v * 100, a: aa != null ? +aa : 1 };
    }
    return null;
}

// ─── Component ──────────────────────────────────────────────

/**
 * Colour selection from a swatch trigger or an inline panel, with alpha channel and preset palettes,
 * output as hex, rgb or hsl.
 *
 * @fires pdx-input {{ value, hex, rgb: { r, g, b, a }, hsl: { h, s, l, a } }} - While dragging; `value` is in the picker's current format.
 * @fires pdx-change {{ value, hex, rgb: { r, g, b, a }, hsl: { h, s, l, a } }} - When a colour is committed.
 */
component('pdx-color-picker', {
    formAssociated: true,
    props: {
        value:     { type: String, default: '#000000' },
        format:    { type: String, default: 'hex' },
        showAlpha: { type: Boolean, default: false },
        presets:   { type: Array, default: () => [] },
        disabled:  { type: Boolean, default: false },
        readonly:  { type: Boolean, default: false },
        size:      { type: String, default: '' },
        inline:    { type: Boolean, default: false },
        label:     { type: String, default: '' },
        name:      { type: String, default: '' },
        clearable: { type: Boolean, default: false },
    },
    setup(ctx) {
        const uid = 'pdx-cp-' + (++_pickerCounter);
        const hue = signal(0), sat = signal(0), val = signal(100), alpha = signal(1);
        const _open = signal(false);
        // `value` is the live colour: the picker writes it on every change. The string
        // it last wrote is kept so the track below can tell its own reflection from a parent's
        // value — re-parsing our own hex into HSV would round it, and at low saturation reset the
        // hue in the middle of a drag.
        let _reflected: string | null = null;
        function reflect(v: string): void {
            _reflected = v;
            setOwnProp(ctx.el, 'value', v);
        }

        // Sync value prop to internal HSV
        ctx.track(() => {
            const raw = ctx.value() as string;
            if (raw === _reflected) return;
            const parsed = parseColor(raw);
            if (parsed) { hue.set(parsed.h); sat.set(parsed.s); val.set(parsed.v); alpha.set(parsed.a); }
        });

        const hexColor = computed(() => hsvToHex(hue(), sat(), val()));
        const rgbColor = computed(() => hsvToRgb(hue(), sat(), val()));
        const hslColor = computed(() => hsvToHsl(hue(), sat(), val()));

        const displayValue = computed(() => {
            const fmt = ctx.format() as string;
            if (fmt === 'rgb') {
                const c = rgbColor();
                return ctx.showAlpha() ? `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha().toFixed(2)})` : `rgb(${c.r}, ${c.g}, ${c.b})`;
            }
            if (fmt === 'hsl') {
                const c = hslColor();
                return ctx.showAlpha() ? `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha().toFixed(2)})` : `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
            }
            return hexColor();
        });

        function payload() {
            const c = rgbColor();
            return { value: displayValue(), hex: hexColor(), rgb: { ...c, a: alpha() }, hsl: { ...hslColor(), a: alpha() } };
        }
        function emitInput() { reflect(displayValue()); ctx.emit('pdx-input', payload()); }
        function emitChange() { reflect(displayValue()); ctx.emit('pdx-change', payload()); }

        // Shared drag helper — attaches pointermove/pointerup on document
        function startDrag(onMove: (e: PointerEvent) => void) {
            const move = (e: PointerEvent) => { e.preventDefault(); onMove(e); emitInput(); };
            const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); emitChange(); };
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', up);
        }

        function spectrumFromPointer(e: PointerEvent) {
            const el = ctx.el.querySelector('.pdx-color-spectrum') as HTMLElement;
            if (!el) return;
            const r = el.getBoundingClientRect();
            sat.set(clamp(((e.clientX - r.left) / r.width) * 100, 0, 100));
            val.set(clamp(100 - ((e.clientY - r.top) / r.height) * 100, 0, 100));
        }
        function onSpectrumDown(e: PointerEvent) {
            if (ctx.disabled() || ctx.readonly()) return;
            e.preventDefault(); spectrumFromPointer(e); emitInput(); startDrag(spectrumFromPointer);
        }

        function hueFromPointer(e: PointerEvent) {
            const el = ctx.el.querySelector('.pdx-color-hue-slider') as HTMLElement;
            if (!el) return;
            const r = el.getBoundingClientRect();
            hue.set(clamp(((e.clientX - r.left) / r.width) * 360, 0, 360));
        }
        function onHueDown(e: PointerEvent) {
            if (ctx.disabled() || ctx.readonly()) return;
            e.preventDefault(); hueFromPointer(e); emitInput(); startDrag(hueFromPointer);
        }

        function alphaFromPointer(e: PointerEvent) {
            const el = ctx.el.querySelector('.pdx-color-alpha-slider') as HTMLElement;
            if (!el) return;
            const r = el.getBoundingClientRect();
            alpha.set(clamp((e.clientX - r.left) / r.width, 0, 1));
        }
        function onAlphaDown(e: PointerEvent) {
            if (ctx.disabled() || ctx.readonly()) return;
            e.preventDefault(); alphaFromPointer(e); emitInput(); startDrag(alphaFromPointer);
        }

        // ── Keyboard ─────────────────────────────
        // Every slider, opacity included, has a tab stop and keys, not only a pointer path.
        // Each key step emits pdx-input; the keyup that ends it commits (pdx-change), as a drag's
        // pointerup does.
        const interactive = () => !ctx.disabled() && !ctx.readonly();
        let _keyStepped = false;
        /** The new value for a slider key, or null for a key the slider does not handle. */
        function stepped(e: KeyboardEvent, now: number, min: number, max: number, small: number, big: number): number | null {
            const d = e.shiftKey ? big : small;
            switch (e.key) {
                case 'ArrowRight': case 'ArrowUp': return clamp(now + d, min, max);
                case 'ArrowLeft': case 'ArrowDown': return clamp(now - d, min, max);
                case 'PageUp': return clamp(now + big, min, max);
                case 'PageDown': return clamp(now - big, min, max);
                case 'Home': return min;
                case 'End': return max;
                default: return null;
            }
        }
        function keyStep(e: KeyboardEvent, apply: () => boolean) {
            if (!interactive() || !apply()) return;
            e.preventDefault();
            _keyStepped = true;
            emitInput();
        }
        function onSliderKeyup() {
            if (!_keyStepped) return;
            _keyStepped = false;
            emitChange();
        }
        function onHueKey(e: KeyboardEvent) {
            keyStep(e, () => { const n = stepped(e, hue(), 0, 360, 1, 10); if (n === null) return false; hue.set(n); return true; });
        }
        function onAlphaKey(e: KeyboardEvent) {
            keyStep(e, () => {
                const n = stepped(e, alpha(), 0, 1, 0.01, 0.1);
                if (n === null) return false;
                alpha.set(Math.round(n * 100) / 100);
                return true;
            });
        }
        /** The colour area: ←/→ saturation, ↑/↓ brightness (PageUp/PageDown by 10), Home/End saturation. */
        function onSpectrumKey(e: KeyboardEvent) {
            keyStep(e, () => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown') {
                    const n = stepped(e, val(), 0, 100, 1, 10);
                    if (n === null) return false;
                    val.set(n);
                    return true;
                }
                const n = stepped(e, sat(), 0, 100, 1, 10);
                if (n === null) return false;
                sat.set(n);
                return true;
            });
        }
        /** The area's value as text: saturation and brightness, then the colour. */
        function spectrumText(): string {
            return format(uiString('color-picker', 'area'), {
                s: Math.round(sat()), v: Math.round(val()), color: displayValue(),
            });
        }

        function onHexInput(e: Event) {
            const parsed = parseColor((e.target as HTMLInputElement).value);
            if (parsed) { hue.set(parsed.h); sat.set(parsed.s); val.set(parsed.v); alpha.set(parsed.a); emitChange(); }
        }

        function onPresetClick(color: string) {
            if (ctx.disabled() || ctx.readonly()) return;
            const parsed = parseColor(color);
            if (parsed) { hue.set(parsed.h); sat.set(parsed.s); val.set(parsed.v); alpha.set(parsed.a); emitChange(); }
        }

        function onClear() {
            hue.set(0); sat.set(0); val.set(100); alpha.set(1);
            reflect('');
            ctx.emit('pdx-change', { value: '', hex: '', rgb: { r: 0, g: 0, b: 0, a: 1 }, hsl: { h: 0, s: 0, l: 0, a: 1 } });
        }

        function togglePopup() { if (!ctx.disabled() && !ctx.inline()) _open.set(!_open()); }

        // ── Popover (deferred to after first render) ────────
        let popover: ReturnType<typeof usePopover> | null = null;
        let overlayId = '';
        let _popoverDispose: (() => void) | null = null;

        queueMicrotask(() => {
            if (ctx.inline()) return;
            const triggerEl = ctx.el.querySelector('.pdx-color-swatch') as HTMLElement;
            const panelEl = ctx.el.querySelector('.pdx-color-panel') as HTMLElement;
            if (!triggerEl || !panelEl) return;

            popover = usePopover({
                // No offset: `--pdx-float-offset` decides the gap, and a literal 4 here would
                // repeat its value.
                trigger: 'manual', placement: 'bottom-start', flip: true,
                dismissOnOutside: true, dismissOnEscape: true, container: ctx.el,
                onOpenChange: (o) => { if (!o && _open()) _open.set(false); },
            });
            popover.setTrigger(triggerEl);
            popover.setContent(panelEl);

            let wasOpen = false;
            const disposeSync = effect(() => {
                const isOpen = _open();
                if (!popover) return;
                if (isOpen) {
                    popover.open(); overlayId = uid;
                    panelEl.style.zIndex = String(overlayStack.push(overlayId));
                    // A dialog takes focus: the colour area, once the panel is displayed, not the
                    // swatch.
                    requestAnimationFrame(() => {
                        if (_open()) (panelEl.querySelector('.pdx-color-spectrum') as HTMLElement | null)?.focus();
                    });
                } else {
                    popover.close(); panelEl.style.zIndex = '';
                    if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
                    // Closed with focus inside (close(), a pick): back to the swatch, not <body>.
                    // Escape already returns it (usePopover).
                    if (wasOpen && panelEl.contains(document.activeElement)) triggerEl.focus();
                }
                wasOpen = isOpen;
            });

            _popoverDispose = () => {
                disposeSync(); popover?.dispose(); popover = null;
                if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
            };
        });
        ctx.track(() => () => { _popoverDispose?.(); });

        // Expose programmatic open/close on host element
        (ctx.el as any).open = () => _open.set(true);
        (ctx.el as any).close = () => _open.set(false);

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() { onClear(); },
        });

        useFormAssociated(ctx, { getFormValue: () => (ctx.value() as string) || null });
        // The host is the one submitter. A hidden input carrying the name would send the value a
        // second time.
        reflectNameToHost(ctx);

        return {
            uid, _open, hue, sat, val, alpha,
            hexColor, rgbColor, hslColor, displayValue,
            onSpectrumDown, onHueDown, onAlphaDown,
            onSpectrumKey, onHueKey, onAlphaKey, onSliderKeyup, spectrumText, interactive,
            onHexInput, onPresetClick, onClear, togglePopup,
        };
    },
    render: (ctx) => html`
        ${() => !ctx.inline() ? html`
            <button class="pdx-color-swatch ${() => ctx.size() ? 'pdx-color-swatch-' + ctx.size() : ''}${() => ctx.disabled() ? ' disabled' : ''}"
                type="button" aria-haspopup="dialog"
                :aria-label="${() => ctx.label() || uiString('color-picker', 'pick')}"
                :aria-expanded="${() => String(ctx._open())}"
                :aria-disabled="${() => ctx.disabled() ? 'true' : null}"
                :style="${() => `--pdx-cp-current: ${ctx.hexColor()}`}"
                @click="${ctx.togglePopup}"></button>
        ` : ''}
        <div class="pdx-color-panel ${() => ctx.inline() ? 'pdx-color-panel-inline' : ''}"
            :role="${() => ctx.inline() ? null : 'dialog'}"
            :aria-label="${() => ctx.inline() ? null : (ctx.label() || uiString('color-picker', 'dialog'))}"
            :style="${() => !ctx.inline() && !ctx._open() ? 'display:none' : ''}">
            <!-- Two dimensions on one slider: the value is the saturation, the text carries both and the
                 colour (the APG 2D pattern). It had aria-valuetext only (axe aria-required-attr). -->
            <div class="pdx-color-spectrum" role="slider" :aria-label="${() => uiString('color-picker', 'color')}"
                aria-valuemin="0" aria-valuemax="100"
                :aria-valuenow="${() => String(Math.round(ctx.sat()))}"
                :aria-valuetext="${ctx.spectrumText}"
                :tabindex="${() => ctx.interactive() ? '0' : '-1'}"
                :aria-disabled="${() => ctx.disabled() ? 'true' : null}"
                :style="${() => `--pdx-cp-hue: hsl(${ctx.hue()}, 100%, 50%)`}"
                @pointerdown="${ctx.onSpectrumDown}" @keydown="${ctx.onSpectrumKey}" @keyup="${ctx.onSliderKeyup}">
                <div class="pdx-color-spectrum-white"></div>
                <div class="pdx-color-spectrum-black"></div>
                <div class="pdx-color-spectrum-thumb" :style="${() => `left:${ctx.sat()}%;top:${100 - ctx.val()}%`}"></div>
            </div>
            <div class="pdx-color-hue-slider" role="slider" :aria-label="${() => uiString('color-picker', 'hue')}"
                aria-valuemin="0" aria-valuemax="360"
                :aria-valuenow="${() => String(Math.round(ctx.hue()))}"
                :tabindex="${() => ctx.interactive() ? '0' : '-1'}"
                :aria-disabled="${() => ctx.disabled() ? 'true' : null}"
                @pointerdown="${ctx.onHueDown}" @keydown="${ctx.onHueKey}" @keyup="${ctx.onSliderKeyup}">
                <div class="pdx-color-slider-thumb" :style="${() => `left:${(ctx.hue() / 360) * 100}%`}"></div>
            </div>
            ${() => ctx.showAlpha() ? html`
                <div class="pdx-color-alpha-slider" role="slider" :aria-label="${() => uiString('color-picker', 'opacity')}"
                    aria-valuemin="0" aria-valuemax="1"
                    :aria-valuenow="${() => ctx.alpha().toFixed(2)}"
                    :aria-valuetext="${() => `${Math.round(ctx.alpha() * 100)}%`}"
                    :tabindex="${() => ctx.interactive() ? '0' : '-1'}"
                    :aria-disabled="${() => ctx.disabled() ? 'true' : null}"
                    @pointerdown="${ctx.onAlphaDown}" @keydown="${ctx.onAlphaKey}" @keyup="${ctx.onSliderKeyup}">
                    <div class="pdx-color-alpha-gradient"
                        :style="${() => `background:linear-gradient(to right,transparent,${ctx.hexColor()})`}"></div>
                    <div class="pdx-color-slider-thumb" :style="${() => `left:${ctx.alpha() * 100}%`}"></div>
                </div>
            ` : ''}
            <div class="pdx-color-controls">
                <input class="pdx-color-hex-input pdx-input" type="text"
                    :aria-label="${() => uiString('color-picker', 'hex')}"
                    autocomplete="off" data-lpignore="true" data-1p-ignore="" data-form-type="other"
                    :value="${ctx.displayValue}"
                    :disabled="${() => ctx.disabled() || ctx.readonly() ? true : null}"
                    @change="${ctx.onHexInput}" />
                ${() => ctx.clearable() ? html`
                    <button class="pdx-color-clear" type="button" :aria-label="${() => uiString('color-picker', 'clear')}"
                        @click="${ctx.onClear}">&#215;</button>
                ` : ''}
            </div>
            ${() => { const p = ctx.presets() as string[]; return p?.length ? html`
                <div class="pdx-color-presets" role="group" :aria-label="${() => uiString('color-picker', 'presets')}">
                    ${p.map(c => html`<button class="pdx-color-preset" type="button"
                        :style="${() => `background:${c}`}" :aria-label="${() => c}"
                        @click="${() => ctx.onPresetClick(c)}"></button>`)}
                </div>` : ''; }}
        </div>
    `,
});
