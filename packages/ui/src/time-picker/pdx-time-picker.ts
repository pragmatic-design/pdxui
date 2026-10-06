// pdx-time-picker — Segmented time input (hour:minute:second AM/PM).
// Each segment has visible up/down arrow buttons + keyboard + mouse wheel.
// 12h/24h auto-detected from locale via Intl.DateTimeFormat.

import { component, html, signal, registerComponentStrings, getComponentString, registerFormControl } from '@pdxui/core';
import { is12HourClock } from '@pdxui/core';
import { resolveLocale } from '../shared/locale';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/time-picker';

registerComponentStrings('time-picker', {
    hour: 'Hour',
    minute: 'Minute',
    second: 'Second',
    period: 'AM/PM',
    increment: 'Increment',
    decrement: 'Decrement',
    // What a screen reader hears on a segment of an empty picker, which shows "--".
    empty: 'No time',
    // The group's name when aria-label is not set.
    label: 'Time picker',
});

registerFormControl('pdx-time-picker', {
    valueEvent: 'pdx-change',
    valueProp: 'value',
});

/**
 * A segmented time input: the user sets the hour, minute, optional seconds and AM/PM with the
 * keyboard, the mouse wheel or typed digits, and the value is always `HH:mm` on the 24-hour clock.
 */
component('pdx-time-picker', {
    formAssociated: true,
    props: {
        value: { type: String, default: '' },
        format: { type: String, default: 'auto' },
        showSeconds: { type: Boolean, default: false },
        step: { type: Number, default: 1 },
        min: { type: String, default: '' },
        max: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        name: { type: String, default: '' },
        size: { type: String, default: '' },
        /** Locale for the 12h/24h default. Empty: the page's language (`lang`), then the browser's. */
        locale: { type: String, default: '' },
        ariaLabel: { type: String, default: '' },
    },
    setup(ctx) {
        const _hour = signal(0);
        const _minute = signal(0);
        const _second = signal(0);
        const _period = signal<'AM' | 'PM'>('AM');
        // Empty is a state, as in the native <input type="time">: `value` '' shows "--", with no
        // aria-valuenow. 00:00 would say midnight, not «no time».
        const _empty = signal(!(ctx.value() as string));
        // The value this component last wrote to the host, so the value track can tell its own
        // reflection from a parent's change.
        let _reflected: string | null = null;
        const _digitBuffer = signal('');
        let _digitTimer: ReturnType<typeof setTimeout> | null = null;

        function is12h(): boolean {
            const fmt = ctx.format() as string;
            if (fmt === '12h') return true;
            if (fmt === '24h') return false;
            return is12HourClock(resolveLocale(ctx.el, ctx.locale() as string));
        }

        function parseTime(val: string): void {
            if (!val) return;
            _empty.set(false);
            const parts = val.split(':').map(Number);
            let h = parts[0] || 0;
            _minute.set(parts[1] || 0);
            _second.set(parts[2] || 0);
            if (is12h()) {
                if (h >= 12) { _period.set('PM'); h = h === 12 ? 12 : h - 12; }
                else { _period.set('AM'); if (h === 0) h = 12; }
            }
            _hour.set(h);
        }

        setTimeout(() => parseTime(ctx.value() as string), 0);
        // An external reset to '' included + cleanup of the digit timer on destroy
        ctx.track(() => {
            const val = ctx.value() as string;
            if (val === _reflected) return; // our own reflection: the segments already show it
            if (val) parseTime(val);
            else { _hour.set(0); _minute.set(0); _second.set(0); _empty.set(true); }
        });
        ctx.track(() => () => { if (_digitTimer) { clearTimeout(_digitTimer); _digitTimer = null; } });

        function formatOutput(): string {
            let h = _hour.peek();
            const m = _minute.peek();
            const s = _second.peek();
            if (is12h()) {
                const period = _period.peek();
                if (period === 'AM' && h === 12) h = 0;
                else if (period === 'PM' && h !== 12) h += 12;
            }
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            if (ctx.showSeconds()) return `${hh}:${mm}:${String(s).padStart(2, '0')}`;
            return `${hh}:${mm}`;
        }

        // ─── min / max ─────────────────────────────────────
        // The bound is enforced here, at
        // the one point where a new value leaves the component, so arrows, wheel, typed digits and
        // the AM/PM toggle are all covered once instead of four times.

        /** A `HH:mm[:ss]` bound as seconds since midnight, or null when absent or unreadable. */
        function bound(raw: string): number | null {
            if (!raw) return null;
            const parts = raw.split(':').map(Number);
            const [h, m] = parts;
            if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
            const sec = Number.isFinite(parts[2]) ? parts[2] : 0;
            return h * 3600 + m * 60 + sec;
        }

        /** The segments as seconds since midnight, on the 24h clock the value is emitted in. */
        function currentSeconds(): number {
            let h = _hour.peek();
            if (is12h()) {
                const period = _period.peek();
                if (period === 'AM' && h === 12) h = 0;
                else if (period === 'PM' && h !== 12) h += 12;
            }
            return h * 3600 + _minute.peek() * 60 + _second.peek();
        }

        /** Write seconds-since-midnight back into the segments, in the clock currently in use. */
        function setSeconds(total: number): void {
            let h = Math.floor(total / 3600) % 24;
            _minute.set(Math.floor(total / 60) % 60);
            _second.set(total % 60);
            if (is12h()) {
                _period.set(h >= 12 ? 'PM' : 'AM');
                h = h % 12 === 0 ? 12 : h % 12;
            }
            _hour.set(h);
        }

        /** Pull the segments back inside [min, max]. The `value` prop is never clamped — see the test. */
        function clampToRange(): void {
            const lo = bound(ctx.min() as string);
            const hi = bound(ctx.max() as string);
            if (lo === null && hi === null) return;
            const now = currentSeconds();
            if (lo !== null && now < lo) setSeconds(lo);
            else if (hi !== null && now > hi) setSeconds(hi);
        }

        function emitChange(): void {
            const empty = _empty.peek();
            if (!empty) clampToRange();
            const val = empty ? '' : formatOutput();
            // Reflect on the host: registerFormControl names `value` as this control's value, which
            // must not stay '' with the value living only in the event. `_reflected` first, so the
            // value track sees its own write.
            _reflected = val;
            (ctx.el as unknown as { value: string }).value = val;
            ctx.emit('pdx-change', { value: val });
            ctx.emit('pdx-input', { value: val });
        }

        /** The first arrow, digit or wheel step on an empty picker starts from `min`, else 00:00. */
        function leaveEmpty(): void {
            if (!_empty.peek()) return;
            setSeconds(bound(ctx.min() as string) ?? 0);
            _empty.set(false);
        }

        function adjustSegment(segment: string, delta: number): void {
            leaveEmpty();
            const step = ctx.step() as number;
            if (segment === 'hour') {
                const maxH = is12h() ? 12 : 23;
                const minH = is12h() ? 1 : 0;
                let h = _hour.peek() + delta;
                if (h > maxH) h = minH;
                if (h < minH) h = maxH;
                _hour.set(h);
            } else if (segment === 'minute') {
                let m = _minute.peek() + delta * step;
                if (m >= 60) m = 0;
                if (m < 0) m = 60 - step;
                _minute.set(m);
            } else if (segment === 'second') {
                let s = _second.peek() + delta * step;
                if (s >= 60) s = 0;
                if (s < 0) s = 60 - step;
                _second.set(s);
            } else if (segment === 'period') {
                _period.set(_period.peek() === 'AM' ? 'PM' : 'AM');
            }
            emitChange();
        }

        function handleDigit(digit: string, segment: string): void {
            leaveEmpty();
            if (segment === 'period') {
                if (digit.toLowerCase() === 'a') _period.set('AM');
                else if (digit.toLowerCase() === 'p') _period.set('PM');
                emitChange();
                return;
            }
            if (_digitTimer) clearTimeout(_digitTimer);
            const buffer = _digitBuffer.peek() + digit;
            _digitBuffer.set(buffer);
            const num = parseInt(buffer, 10);
            let commit = false;
            if (segment === 'hour') {
                const maxH = is12h() ? 12 : 23;
                if (num <= maxH) { _hour.set(num); commit = buffer.length >= 2 || num * 10 > maxH; }
                else { _hour.set(parseInt(digit, 10)); commit = true; }
            } else if (segment === 'minute') {
                if (num <= 59) { _minute.set(num); commit = buffer.length >= 2 || num * 10 > 59; }
                else { _minute.set(parseInt(digit, 10)); commit = true; }
            } else if (segment === 'second') {
                if (num <= 59) { _second.set(num); commit = buffer.length >= 2 || num * 10 > 59; }
                else { _second.set(parseInt(digit, 10)); commit = true; }
            }
            if (commit) { _digitBuffer.set(''); advanceSegment(); }
            else { _digitTimer = setTimeout(() => { _digitBuffer.set(''); advanceSegment(); }, 1000); }
            emitChange();
        }

        function advanceSegment(): void {
            // Focus next segment via DOM
            const el = ctx.el;
            const segments = el.querySelectorAll<HTMLElement>('.pdx-time-value');
            const current = el.querySelector('.pdx-time-value:focus') as HTMLElement;
            if (!current) return;
            const idx = Array.from(segments).indexOf(current);
            if (idx < segments.length - 1) segments[idx + 1].focus();
        }

        function onSegmentKeydown(e: KeyboardEvent, segment: string): void {
            if (ctx.disabled()) return;
            if (e.key === 'ArrowUp') { e.preventDefault(); adjustSegment(segment, 1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); adjustSegment(segment, -1); }
            else if (e.key === 'Tab') { /* default */ }
            else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); handleDigit(e.key, segment); }
            else if (/^[aApP]$/.test(e.key) && segment === 'period') { e.preventDefault(); handleDigit(e.key, segment); }
        }

        function onWheel(e: WheelEvent, segment: string): void {
            e.preventDefault();
            adjustSegment(segment, e.deltaY < 0 ? 1 : -1);
        }

        // ─── Render ────────────────────────────────────────
        // Build DOM once, update textContent reactively (never destroy focused elements)

        let _hourEl: HTMLElement | null = null;
        let _minuteEl: HTMLElement | null = null;
        let _secondEl: HTMLElement | null = null;
        let _periodEl: HTMLElement | null = null;
        let _hiddenEl: HTMLInputElement | null = null;
        let _groupEl: HTMLElement | null = null;
        let _built = false;

        /** The group's name: aria-label, else time-picker.label — a string a locale can reach. */
        const groupName = (): string => (ctx.ariaLabel() as string) || getComponentString('time-picker', 'label')();
        ctx.track(() => {
            const n = groupName();
            if (_groupEl) _groupEl.setAttribute('aria-label', n);
        });

        // Build structure once (ctx.frame: a setup a move destroyed does not build again)
        ctx.frame(() => {
            if (_built) return;
            _built = true;
            const el = ctx.el;
            const disabled = ctx.disabled() as boolean;
            const showSec = ctx.showSeconds() as boolean;
            const use12h_ = is12h();
            const size = ctx.size() as string;
            const name = ctx.name() as string;

            const wrap = document.createElement('div');
            wrap.className = 'pdx-time-picker' + (size ? ` pdx-time-picker-${size}` : '') + (disabled ? ' disabled' : '');
            wrap.setAttribute('role', 'group');
            wrap.setAttribute('aria-label', groupName());
            _groupEl = wrap;

            const hourCol = buildSegment('hour', '00', getComponentString('time-picker', 'hour')());
            _hourEl = hourCol.querySelector('.pdx-time-value')!;
            wrap.appendChild(hourCol);
            wrap.appendChild(buildSeparator(':'));

            const minCol = buildSegment('minute', '00', getComponentString('time-picker', 'minute')());
            _minuteEl = minCol.querySelector('.pdx-time-value')!;
            wrap.appendChild(minCol);

            if (showSec) {
                wrap.appendChild(buildSeparator(':'));
                const secCol = buildSegment('second', '00', getComponentString('time-picker', 'second')());
                _secondEl = secCol.querySelector('.pdx-time-value')!;
                wrap.appendChild(secCol);
            }
            if (use12h_) {
                const perCol = buildSegment('period', 'AM', getComponentString('time-picker', 'period')());
                _periodEl = perCol.querySelector('.pdx-time-value')!;
                wrap.appendChild(perCol);
            }
            if (name) {
                _hiddenEl = document.createElement('input');
                _hiddenEl.type = 'hidden';
                _hiddenEl.name = name;
                wrap.appendChild(_hiddenEl);
            }
            el.appendChild(wrap);
        });

        // Update track: only change textContent (preserves focus)
        ctx.track(() => {
            const h = _hour();
            const m = _minute();
            const s = _second();
            const period = _period();
            const empty = _empty();
            const emptyText = getComponentString('time-picker', 'empty')();

            /** A segment's text and spinbutton value; empty shows "--" and says so, with no number. */
            const show = (seg: HTMLElement | null, text: string, now: string): void => {
                if (!seg) return;
                if (empty) {
                    seg.textContent = '--';
                    seg.removeAttribute('aria-valuenow');
                    seg.setAttribute('aria-valuetext', emptyText);
                } else {
                    seg.textContent = text;
                    seg.setAttribute('aria-valuenow', now);
                    seg.removeAttribute('aria-valuetext');
                }
            };

            requestAnimationFrame(() => {
                show(_hourEl, String(h).padStart(2, '0'), String(h));
                show(_minuteEl, String(m).padStart(2, '0'), String(m));
                show(_secondEl, String(s).padStart(2, '0'), String(s));
                show(_periodEl, period, period);
                if (_hiddenEl) _hiddenEl.value = empty ? '' : formatOutput();
            });
        });

        function buildSegment(segment: string, display: string, label: string): HTMLElement {
            const col = document.createElement('div');
            col.className = 'pdx-time-col' + (segment === 'period' ? ' pdx-time-period-col' : '');

            // Up arrow button
            const upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = 'pdx-time-arrow pdx-time-arrow-up';
            upBtn.setAttribute('tabindex', '-1');
            upBtn.setAttribute('aria-hidden', 'true');
            upBtn.textContent = '▲';
            upBtn.addEventListener('click', (e) => { e.preventDefault(); adjustSegment(segment, 1); });
            col.appendChild(upBtn);

            // Value display (focusable, editable)
            const val = document.createElement('div');
            val.className = 'pdx-time-value' + (segment === 'period' ? ' pdx-time-period' : '');
            val.setAttribute('role', 'spinbutton');
            val.setAttribute('tabindex', ctx.disabled() ? '-1' : '0');
            val.setAttribute('aria-label', label);
            val.setAttribute('aria-valuenow', display);
            // The segment's range for the WAI-ARIA spinbutton pattern (period is AM/PM, not numeric).
            if (segment === 'hour') {
                val.setAttribute('aria-valuemin', is12h() ? '1' : '0');
                val.setAttribute('aria-valuemax', is12h() ? '12' : '23');
            } else if (segment === 'minute' || segment === 'second') {
                val.setAttribute('aria-valuemin', '0');
                val.setAttribute('aria-valuemax', '59');
            }
            val.textContent = display;
            val.addEventListener('keydown', (e) => onSegmentKeydown(e, segment));
            val.addEventListener('wheel', (e) => onWheel(e, segment), { passive: false });
            val.addEventListener('focus', () => _digitBuffer.set(''));
            val.addEventListener('blur', () => ctx.emit('pdx-blur'));
            col.appendChild(val);

            // Down arrow button
            const downBtn = document.createElement('button');
            downBtn.type = 'button';
            downBtn.className = 'pdx-time-arrow pdx-time-arrow-down';
            downBtn.setAttribute('tabindex', '-1');
            downBtn.setAttribute('aria-hidden', 'true');
            downBtn.textContent = '▼';
            downBtn.addEventListener('click', (e) => { e.preventDefault(); adjustSegment(segment, -1); });
            col.appendChild(downBtn);

            return col;
        }

        function buildSeparator(char: string): HTMLElement {
            const sep = document.createElement('span');
            sep.className = 'pdx-time-separator';
            sep.textContent = char;
            sep.setAttribute('aria-hidden', 'true');
            return sep;
        }

        // Imperative API: focus/blur/clear (clear empties the picker: "--", value '')
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() {
                _hour.set(is12h() ? 12 : 0);
                _minute.set(0);
                _second.set(0);
                _period.set('AM');
                _empty.set(true);
                emitChange();
            },
        });

        return { formatOutput };
    },
    render: () => html``,
});
