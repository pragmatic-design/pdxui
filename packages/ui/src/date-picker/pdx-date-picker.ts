// pdx-date-picker — Main date/time picker component.
// Modes: date | datetime | daterange | datetimerange | time | week | month | year | quarter
// Structure: input trigger + popover → calendar panel + optional time + presets sidebar.

import { component, html, signal, usePopover, registerComponentStrings, getComponentString, registerFormControl } from '@pdxui/core';
import type { PopoverReturn } from '@pdxui/core';
import { formatWithCalendar, today, parseISO, getMonthNames, getFiscalQuarter, getFiscalYear } from '@pdxui/core';
import type { CalendarSystem } from '@pdxui/core';

import { resolveLocale } from '../shared/locale';
import { setOwnProp } from '../shared/own-prop';
import { parseTypedDateTime, formatTypedDate, dateAllowed } from './typed-date';
import '../calendar/pdx-calendar';
import '../time-picker/pdx-time-picker';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/date-picker';

/**
 * The width at which the panel becomes a bottom sheet. The stylesheet's
 * `@media (max-width: 640px)` in design's components/date-picker.css is the same query, and
 * `date-picker-sheet-query.test.ts` fails if the two disagree: one system positions the panel at a
 * time, the stylesheet below this width and the popover above it.
 */
export const DATE_PICKER_SHEET_QUERY = '(max-width: 640px)';

// A counter for the panel's unique ids (needed by `aria-controls` on the role=combobox trigger).
let _dpPanelSeq = 0;

registerComponentStrings('date-picker', {
    today: 'Today',
    clear: 'Clear',
    close: 'Close',
    done: 'Done',
    apply: 'Apply',
    cancel: 'Cancel',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    selectMonth: 'Select month',
    selectYear: 'Select year',
    weekNumber: 'W',
    startDate: 'Start date',
    endDate: 'End date',
    compareToggle: 'Compare',
    placeholder: 'Select date',
    placeholderRange: 'Start — End',
    placeholderTime: 'Select time',
    // The trigger's name when neither aria-label nor placeholder is set, and the popup
    // dialog's name; a time-only picker's dialog is `chooseTime`.
    choose: 'Choose date',
    chooseTime: 'Choose time',
});

registerFormControl('pdx-date-picker', {
    valueEvent: 'pdx-change',
    valueProp: 'value',
});

export interface DatePreset {
    label: string;
    value: string | [string, string];
}

/**
 * A date picker composed of a calendar and a time picker, with several selection modes, calendar
 * systems and presets.
 */
component('pdx-date-picker', {
    formAssociated: true,
    props: {
        /** Selected value (ISO date/time string). */
        value: { type: String, default: '' },
        /** Range start (ISO). */
        rangeStart: { type: String, default: '' },
        /** Range end (ISO). */
        rangeEnd: { type: String, default: '' },
        /** Picker mode. */
        mode: { type: String, default: 'date' },
        /** Locale for formatting and i18n. Empty: the page's language (`lang`), then the browser's. */
        locale: { type: String, default: '' },
        /** Calendar system for display. */
        calendar: { type: String, default: 'gregory' },
        /** Number of calendar months to show (1-3). */
        numberOfMonths: { type: Number, default: 0 }, // 0 = auto (1 for date, 2 for range)
        /** Show week numbers. */
        weekNumbers: { type: Boolean, default: false },
        /** Minimum date (ISO). */
        min: { type: String, default: '' },
        /** Maximum date (ISO). */
        max: { type: String, default: '' },
        /** Function: (iso) => boolean for disabled dates. */
        disabledDates: { type: Object, default: null },
        /** Function: (iso) => string|false for highlighted dates. */
        highlightedDates: { type: Object, default: null },
        /** Fiscal year start month (1-12). */
        fiscalStartMonth: { type: Number, default: 1 },
        /** Preset date options (array of { label, value }). */
        presets: { type: Array, default: [] },
        /** Show comparison range toggle. */
        showCompare: { type: Boolean, default: false },
        /** Compare range start (ISO). */
        compareStart: { type: String, default: '' },
        /** Compare range end (ISO). */
        compareEnd: { type: String, default: '' },
        /** Show time picker alongside date. */
        showTime: { type: Boolean, default: false },
        /** Time format (12h/24h/auto). */
        timeFormat: { type: String, default: 'auto' },
        /** Show seconds in time picker. */
        showSeconds: { type: Boolean, default: false },
        /** Time step (1/5/15/30). */
        timeStep: { type: Number, default: 1 },
        /** Allow clearing the value. */
        clearable: { type: Boolean, default: true },
        /** Disabled state. */
        disabled: { type: Boolean, default: false },
        /** Readonly state. */
        readonly: { type: Boolean, default: false },
        /** Placeholder text. */
        placeholder: { type: String, default: '' },
        /** Name for form participation. */
        name: { type: String, default: '' },
        /** Size variant (sm/md/lg). */
        size: { type: String, default: '' },
        /** Inline calendar (no popover, always visible). */
        inline: { type: Boolean, default: false },
        /** Fixed weeks in calendar. */
        fixedWeeks: { type: Boolean, default: true },
        /** First day of week (-1 = auto). */
        firstDay: { type: Number, default: -1 },
        /** Aria label. */
        ariaLabel: { type: String, default: '' },
        /**
         * The date can be typed: the trigger's text is an input (still the combobox), read in the
         * locale's numeric pattern or as ISO, committed on Enter and blur. The calendar icon opens the
         * popup, as does Alt+ArrowDown. Modes `date` and `datetime` (its date part); the others keep
         * the plain trigger.
         */
        editable: { type: Boolean, default: false },
    },
    setup(ctx) {
        let popover: PopoverReturn | null = null;
        // The prop, then the page's lang, then the browser. Passed resolved to the
        // calendar and the time picker it builds, so all three agree.
        const locale = (): string => resolveLocale(ctx.el, ctx.locale() as string);
        const _compareEnabled = signal(false);
        const _timeValue = signal('00:00');
        const _timeEndValue = signal('00:00');
        // Internal range state (tracks building range before external confirmation)
        const _internalRangeStart = signal('');
        const _internalRangeEnd = signal('');
        const _internalValue = signal('');

        function modeStr(): string { return ctx.mode() as string; }
        function isRange(): boolean { return modeStr() === 'daterange' || modeStr() === 'datetimerange'; }
        function hasTime(): boolean { return modeStr() === 'datetime' || modeStr() === 'datetimerange' || modeStr() === 'time' || (ctx.showTime() as boolean); }
        function isTimeOnly(): boolean { return modeStr() === 'time'; }

        function autoNumMonths(): number {
            const prop = ctx.numberOfMonths() as number;
            if (prop > 0) return prop;
            // Range gets 2 months, everything else 1
            return isRange() ? 2 : 1;
        }

        function calendarMode(): string {
            const m = modeStr();
            if (m === 'datetime' || m === 'date') return 'date';
            if (m === 'daterange' || m === 'datetimerange') return 'range';
            return m; // week, month, year, quarter
        }

        // ─── Display Value ─────────────────────────────────

        function displayValue(): string {
            const mode = modeStr();
            const loc = locale();
            const cal = ctx.calendar() as CalendarSystem;

            if (mode === 'time') return _timeValue() || '';

            const val = _internalValue() || ctx.value() as string;
            const rStart = _internalRangeStart() || ctx.rangeStart() as string;
            const rEnd = _internalRangeEnd() || ctx.rangeEnd() as string;

            // Range display (daterange, datetimerange, week)
            if (isRange() || mode === 'week') {
                if (!rStart && !rEnd) return '';
                const s = rStart ? formatDate(rStart, loc, cal) : '...';
                const e = rEnd ? formatDate(rEnd, loc, cal) : '...';
                return `${s} — ${e}`;
            }

            // Year mode: show just the year
            if (mode === 'year' && val) {
                return parseISO(val).year.toString();
            }

            // Month mode: show "Month Year"
            if (mode === 'month' && val) {
                const d = parseISO(val);
                const monthNames = getMonthNames(loc, cal, 'long');
                return `${monthNames[d.month - 1]} ${d.year}`;
            }

            // Quarter mode: show "Q1 2024"
            if (mode === 'quarter' && val) {
                const d = parseISO(val);
                const fiscal = ctx.fiscalStartMonth() as number;
                const q = getFiscalQuarter(d.month, fiscal);
                const fy = getFiscalYear(d.year, d.month, fiscal);
                return `Q${q} ${fy}`;
            }

            if (!val) return '';

            let display = formatDate(val, loc, cal);
            if (hasTime()) {
                display += ' ' + _timeValue();
            }
            return display;
        }

        function formatDate(iso: string, loc: string, cal: CalendarSystem): string {
            if (cal !== 'gregory') {
                return formatWithCalendar(iso, loc, cal, { dateStyle: 'medium' });
            }
            return formatWithCalendar(iso, loc, 'gregory', { dateStyle: 'medium' });
        }

        function getPlaceholder(): string {
            const ph = ctx.placeholder() as string;
            if (ph) return ph;
            if (isTimeOnly()) return getComponentString('date-picker', 'placeholderTime')();
            if (isRange()) return getComponentString('date-picker', 'placeholderRange')();
            return getComponentString('date-picker', 'placeholder')();
        }

        // ─── Calendar Events ───────────────────────────────

        // Sync external props into internal state
        ctx.track(() => {
            const v = ctx.value() as string;
            const rs = ctx.rangeStart() as string;
            const re = ctx.rangeEnd() as string;
            if (v) _internalValue.set(v);
            if (rs) _internalRangeStart.set(rs);
            if (re) _internalRangeEnd.set(re);
        });

        /** The user's choice on the host's own props, before the event. */
        function reflectChoice(value: string, range?: { start: string; end: string }): void {
            setOwnProp(ctx.el, 'value', value);
            if (range) {
                setOwnProp(ctx.el, 'rangeStart', range.start);
                setOwnProp(ctx.el, 'rangeEnd', range.end);
            }
        }

        /** The inner calendar's and time picker's `pdx-change` stops at them: the picker announces the
         *  change itself, in its own shape. Bubbling out beside the picker's, it would give a listener
         *  on the picker two events per pick with two shapes. The listener is on the child
         *  itself, added when the picker built it, so no listener above it sees the event. */
        function ownChildChange(e: Event): void {
            e.stopPropagation();
        }

        function onCalendarChange(e: CustomEvent): void {
            ownChildChange(e);
            const detail = e.detail;
            const mode = modeStr();

            if (detail.rangeStart !== undefined) {
                // Update internal range state immediately for the calendar to re-render
                _internalRangeStart.set(detail.rangeStart);
                _internalRangeEnd.set(detail.rangeEnd || '');
                if (detail.value) _internalValue.set(detail.value);
                reflectChoice(detail.value || detail.rangeStart, { start: detail.rangeStart, end: detail.rangeEnd || '' });
                ctx.emit('pdx-change', {
                    rangeStart: detail.rangeStart,
                    rangeEnd: detail.rangeEnd || '',
                    value: detail.value || detail.rangeStart,
                });
                // Close only when range is complete (both ends selected)
                if (detail.rangeEnd && !hasTime()) {
                    closePopover();
                }
            } else if (detail.value) {
                _internalValue.set(detail.value);
                reflectChoice(detail.value);
                ctx.emit('pdx-change', { value: detail.value });
                if (!hasTime() && mode !== 'range') {
                    closePopover();
                }
            } else if (detail.values) {
                ctx.emit('pdx-change', { values: detail.values });
            }
        }

        /** The calendar, wired to this picker. Built by both the panel and the inline form. */
        function makeCalendar(): HTMLElement {
            const cal = document.createElement('pdx-calendar');
            cal.setAttribute('inline', '');
            initCalendarStructuralProps(cal);
            cal.addEventListener('pdx-change', onCalendarChange as EventListener);
            return cal;
        }

        /** The time row: one picker, or two with a separator for a range. */
        function makeTimeRow(loc: string): HTMLElement {
            const timeWrap = document.createElement('div');
            timeWrap.className = 'pdx-date-picker-time';
            _timeEl = makeTimePicker(loc, onTimeChange) as HTMLElement & { value: string };
            timeWrap.appendChild(_timeEl);
            if (isRange()) {
                const sep = document.createElement('span');
                sep.className = 'pdx-date-picker-time-sep';
                sep.textContent = '—';
                timeWrap.appendChild(sep);
                timeWrap.appendChild(makeTimePicker(loc, onTimeEndChange));
            }
            return timeWrap;
        }

        /** The "compare to" toggle row. */
        function makeCompareRow(): HTMLElement {
            const row = document.createElement('div');
            row.className = 'pdx-date-picker-compare';
            const label = document.createElement('label');
            label.className = 'pdx-date-picker-compare-label';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.addEventListener('change', () => _compareEnabled.set(cb.checked));
            label.appendChild(cb);
            const lbl = document.createElement('span');
            lbl.textContent = ' ' + getComponentString('date-picker', 'compareToggle')();
            label.appendChild(lbl);
            row.appendChild(label);
            return row;
        }

        /** The inner time picker, with every time prop this component declares actually passed on.
         *  `showSeconds` and `timeStep` are declared on the date picker and implemented on the time
         *  picker, so they are carried across here. */
        function makeTimePicker(loc: string, onChange: (e: CustomEvent) => void): HTMLElement {
            const tp = document.createElement('pdx-time-picker');
            tp.setAttribute('format', ctx.timeFormat() as string);
            tp.setAttribute('locale', loc);
            if (ctx.showSeconds() as boolean) tp.setAttribute('show-seconds', '');
            tp.setAttribute('step', String(ctx.timeStep() as number));
            tp.addEventListener('pdx-change', onChange as EventListener);
            return tp;
        }

        function onTimeChange(e: CustomEvent): void {
            ownChildChange(e);
            _timeValue.set(e.detail.value);
            const val = ctx.value() as string;
            if (val) {
                ctx.emit('pdx-change', { value: val, time: e.detail.value });
            }
        }

        function onTimeEndChange(e: CustomEvent): void {
            ownChildChange(e);
            _timeEndValue.set(e.detail.value);
            // The end time is emitted, not only collected: otherwise the consumer could not
            // receive it.
            const rs = _internalRangeStart.peek() || (ctx.rangeStart() as string);
            const re = _internalRangeEnd.peek() || (ctx.rangeEnd() as string);
            if (rs || re) {
                ctx.emit('pdx-change', {
                    rangeStart: rs, rangeEnd: re,
                    timeStart: _timeValue.peek(), timeEnd: e.detail.value,
                });
            }
        }

        function onPresetClick(preset: DatePreset): void {
            // The internals updated the way onCalendarChange does: without it, in
            // uncontrolled use the display would not change after a preset.
            if (Array.isArray(preset.value)) {
                _internalRangeStart.set(preset.value[0]);
                _internalRangeEnd.set(preset.value[1]);
                _internalValue.set(preset.value[0]);
                reflectChoice(preset.value[0], { start: preset.value[0], end: preset.value[1] });
                ctx.emit('pdx-change', { rangeStart: preset.value[0], rangeEnd: preset.value[1], value: preset.value[0] });
            } else {
                _internalValue.set(preset.value);
                reflectChoice(preset.value);
                ctx.emit('pdx-change', { value: preset.value });
            }
            closePopover();
        }

        function onClear(): void {
            _internalValue.set('');
            _internalRangeStart.set('');
            _internalRangeEnd.set('');
            _timeValue.set('00:00');
            _timeEndValue.set('00:00'); // reopening without a stale time
            reflectChoice('', { start: '', end: '' });
            ctx.emit('pdx-change', { value: '', rangeStart: '', rangeEnd: '' });
            ctx.emit('pdx-clear');
        }

        function onTodayClick(): void {
            const t = today();
            _internalValue.set(t);
            reflectChoice(t);
            ctx.emit('pdx-change', { value: t });
            if (!hasTime()) closePopover();
        }

        /** On open, focus goes into the dialog: the day the calendar holds its tab stop on (the value,
         *  or today clamped into min/max), the month or year shown in those modes — once the calendar
         *  has drawn, which an early `openPopover()` can precede. A time-only picker has no calendar:
         *  its first control. Focus does not stay on the trigger. */
        function focusIntoPanel(): void {
            const cal = _calendarEl as (HTMLElement & { focusView?: () => void }) | null;
            if (cal?.focusView) { cal.focusView(); return; }
            _panelEl?.querySelector<HTMLElement>('button:not([disabled]), input:not([type="hidden"]), [tabindex="0"]')?.focus();
        }

        // `pdx-open` / `pdx-close` are announced from `onOpenChange` and nowhere else, because that
        // is the one place that runs only when the state actually CHANGES: `usePopover.setOpen`
        // opens with `if (_isOpen.peek() === open) return`. Emitting here instead would announce
        // work that has not happened — a second `openPopover()` on an open picker would re-fire
        // `pdx-open`, and `closePopover()` would fire `pdx-close` twice, once itself and once
        // through the callback it has just triggered: the Done button would emit two.
        function closePopover(): void {
            popover?.close();
        }

        /** Imperative API, deliberately open-only and idempotent: `host.openPopover()` is what the
         *  contract scenario `date-picker-open` calls to reach its state. A toggle here would make
         *  that scenario open and immediately close on a second call. */
        function openPopover(): void {
            if (ctx.disabled() || ctx.readonly()) return;
            popover?.open();
        }

        /** What the TRIGGER does. A button carrying `aria-expanded` closes what it opened — it is
         *  what the attribute means, and it is what `pdx-select` does (`onTriggerClick` →
         *  `toggle()`). A listener that only called `openPopover()` would let Escape and an outside
         *  click dismiss the calendar while the control that opened it could not. */
        function togglePopover(): void {
            if (ctx.disabled() || ctx.readonly()) return;
            popover?.toggle();
        }

        // Set structural props on calendar once (these trigger DOM rebuild if changed)
        function initCalendarStructuralProps(cal: any): void {
            cal.setAttribute('mode', calendarMode());
            cal.setAttribute('numberofmonths', String(autoNumMonths()));
            cal.setAttribute('locale', locale());
            cal.setAttribute('calendar', ctx.calendar() as string);
            const min = ctx.min() as string;
            const max = ctx.max() as string;
            if (min) cal.setAttribute('min', min);
            if (max) cal.setAttribute('max', max);
            cal.setAttribute('fiscalstartmonth', String(ctx.fiscalStartMonth()));
            if (ctx.weekNumbers()) cal.setAttribute('weeknumbers', '');
            const fd = ctx.firstDay() as number;
            if (fd >= 0) cal.setAttribute('firstday', String(fd));
            if (ctx.fixedWeeks()) cal.setAttribute('fixedweeks', '');
            // Pass function props via property (can't use attributes)
            const disabledDates = ctx.disabledDates();
            const highlightedDates = ctx.highlightedDates();
            if (disabledDates) cal.disabledDates = disabledDates;
            if (highlightedDates) cal.highlightedDates = highlightedDates;
        }

        // ─── Imperative Render ─────────────────────────────
        // Two-phase: layout track (once) + update track (reactive props to calendar)

        // The popover is born in the build's rAF (outside the setup's ownership scope),
        // so usePopover's auto-dispose does not cover it: without this teardown the
        // document listeners would survive the unmount.
        ctx.track(() => () => { popover?.dispose(); popover = null; });

        let _triggerEl: HTMLElement | null = null;
        /** The element with the combobox role: the trigger, or the editable input. */
        let _comboEl: HTMLElement | null = null;
        let _inputEl: HTMLInputElement | null = null;
        /** The input holds text the user typed and has not committed: the display must not replace it. */
        let _typing = false;
        let _textEl: HTMLElement | null = null;
        let _clearEl: HTMLButtonElement | null = null;
        let _panelEl: HTMLElement | null = null;

        /**
         * pdx-blur when the focus leaves the COMPONENT — the input, its calendar button and the
         * calendar are all inside it. A form marks the field touched on it, and shows the field's
         * error then: without it a date that breaks a rule would say nothing until the submit.
         * Heard on the host and on the panel, which the popover may move out of the host; one
         * focusout bubbling through both is counted once.
         */
        let _lastFocusOut: Event | null = null;
        function onFocusOut(e: FocusEvent): void {
            if (e === _lastFocusOut) return;
            _lastFocusOut = e;
            const to = e.relatedTarget as Node | null;
            if (to && (ctx.el.contains(to) || _panelEl?.contains(to))) return;
            ctx.emit('pdx-blur');
        }
        ctx.el.addEventListener('focusout', onFocusOut);
        /** The panel's time picker (datetime modes): a typed time is written back to it. */
        let _timeEl: (HTMLElement & { value: string }) | null = null;
        let _calendarEl: any = null;
        let _hiddenEl: HTMLInputElement | null = null;
        let _built = false;

        /** The trigger's name: aria-label, else the placeholder, else date-picker.choose — a string a
         *  locale can reach, not a literal 'Choose date'. */
        const triggerName = (): string =>
            (ctx.ariaLabel() as string) || (ctx.placeholder() as string) || getComponentString('date-picker', 'choose')();
        ctx.track(() => {
            const n = triggerName();
            if (_comboEl) _comboEl.setAttribute('aria-label', n);
        });

        /** The editable input's text, in the locale's numeric pattern — what it reads back. */
        function typedText(): string {
            const val = _internalValue.peek() || (ctx.value() as string);
            if (!val) return '';
            const date = formatTypedDate(val, locale());
            return modeStr() === 'datetime' ? `${date} ${_timeValue.peek()}` : date;
        }

        /** A typed time as the time picker writes it: `HH:mm`, or `HH:mm:ss` with showSeconds. Null
         *  for seconds the picker cannot show: dropping them would be a silent loss.
         *  (The parameter's type is spelled out: naming typed-date's interface here would publish an
         *  internal type among this component's shapes in the manifest.) */
        function typedTimeValue(t: { hours: number; minutes: number; seconds: number }): string | null {
            const two = (n: number) => String(n).padStart(2, '0');
            if (ctx.showSeconds() as boolean) return `${two(t.hours)}:${two(t.minutes)}:${two(t.seconds)}`;
            return t.seconds ? null : `${two(t.hours)}:${two(t.minutes)}`;
        }

        /** Commit what is typed (Enter, blur). Empty clears; a date that does not exist or cannot be
         *  picked is aria-invalid, keeps the last good value and the text, and fires nothing; a new
         *  valid date is the value, with one pdx-change. In datetime a time after the
         *  date is read too — it sets the time, and one that is not a time is invalid; a date alone
         *  keeps the time already set; the event carries `time` as the time picker's does. */
        function commitTyped(): void {
            if (!_inputEl) return;
            const text = _inputEl.value.trim();
            const current = _internalValue.peek() || (ctx.value() as string);
            if (!text) {
                _inputEl.removeAttribute('aria-invalid');
                _typing = false;
                if (current) onClear();
                return;
            }
            const withTime = modeStr() === 'datetime';
            const parsed = parseTypedDateTime(text, locale());
            const rules = { min: ctx.min() as string, max: ctx.max() as string, disabledDates: ctx.disabledDates() as ((iso: string) => boolean) | null };
            const currentTime = _timeValue.peek();
            const time = parsed?.time ? (withTime ? typedTimeValue(parsed.time) : null) : currentTime;
            if (!parsed || !dateAllowed(parsed.date, rules) || time === null) {
                _inputEl.setAttribute('aria-invalid', 'true');
                return;
            }
            const iso = parsed.date;
            _inputEl.removeAttribute('aria-invalid');
            _typing = false;
            if (iso !== current || (withTime && time !== currentTime)) {
                _internalValue.set(iso);
                reflectChoice(iso);
                if (withTime) {
                    _timeValue.set(time);
                    if (_timeEl) _timeEl.value = time;
                    ctx.emit('pdx-change', { value: iso, time });
                } else {
                    ctx.emit('pdx-change', { value: iso });
                }
            }
            _inputEl.value = typedText();
        }

        // Layout: build DOM structure once on first rAF
        requestAnimationFrame(() => {
            if (_built) return;
            _built = true;
            const disabled = ctx.disabled() as boolean;
            const readonly_ = ctx.readonly() as boolean;
            const size = ctx.size() as string;
            const isInline = ctx.inline() as boolean;
            const name = ctx.name() as string;
            const timeOnly = isTimeOnly();
            const showTimePicker = hasTime();
            const presets = ctx.presets() as DatePreset[];
            const showCompare = ctx.showCompare() as boolean;
            const loc = locale();
            {
                const el = ctx.el;
                el.innerHTML = '';

                if (isInline) {
                    // ⚠️ This branch must not return right after the calendar — about a hundred lines
                    // before the point where the panel builds its time picker. Then `inline` would
                    // silently drop `datetime`, `datetimerange`, `showTime`, and render `mode="time"`
                    // as a calendar and nothing else: the one thing that mode says it is not.
                    // Everything the panel shows below the calendar is built from the
                    // same three factories, so the two branches cannot drift apart.
                    if (!timeOnly) {
                        _calendarEl = makeCalendar();
                        el.appendChild(_calendarEl);
                    }
                    if (showTimePicker) el.appendChild(makeTimeRow(loc));
                    if (showCompare) el.appendChild(makeCompareRow());
                    return;
                }

                // Trigger input
                _triggerEl = document.createElement('div');
                _triggerEl.className = 'pdx-date-picker-trigger pdx-input-wrap' + (size ? ` pdx-input-${size}` : '') + (disabled ? ' disabled' : '') + (readonly_ ? ' readonly' : '');
                // Editable: the text is an input, and the input is the combobox.
                const editable = (ctx.editable() as boolean) && (modeStr() === 'date' || modeStr() === 'datetime');
                if (editable) {
                    _inputEl = document.createElement('input');
                    _inputEl.type = 'text';
                    _inputEl.className = 'pdx-date-picker-input';
                    _inputEl.autocomplete = 'off';
                    _inputEl.disabled = disabled;
                    _inputEl.readOnly = readonly_;
                    _comboEl = _inputEl;
                } else {
                    _comboEl = _triggerEl;
                    _comboEl.setAttribute('tabindex', disabled ? '-1' : '0');
                }
                _comboEl.setAttribute('role', 'combobox');
                _comboEl.setAttribute('aria-expanded', 'false');
                _comboEl.setAttribute('aria-haspopup', 'dialog');
                // An accessible name always present: aria-label="" would leave the combobox unnamed
                // (axe aria-input-field-name). It falls back to the placeholder or a sensible default.
                _comboEl.setAttribute('aria-label', triggerName());

                // Inline SVG icon (no dependency on icon registry timing). Editable, it is the button
                // that opens the calendar — the input's click is for typing.
                const icon = document.createElement(editable ? 'button' : 'span');
                icon.className = 'pdx-date-picker-icon' + (timeOnly ? ' pdx-date-picker-icon-time' : '');
                icon.setAttribute('aria-hidden', 'true');
                // SVG from pragmatic-icons set (stroke-based, currentColor)
                const S = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
                icon.innerHTML = timeOnly
                    ? `<svg ${S} width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`
                    : `<svg ${S} width="16" height="16"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`;
                if (editable) {
                    const btn = icon as HTMLButtonElement;
                    btn.type = 'button';
                    btn.removeAttribute('aria-hidden');
                    btn.setAttribute('aria-label', getComponentString('date-picker', 'choose')());
                    btn.disabled = disabled || readonly_;
                } else {
                    icon.setAttribute('aria-hidden', 'true');
                }
                _triggerEl.appendChild(icon);

                if (_inputEl) {
                    _triggerEl.appendChild(_inputEl);
                } else {
                    _textEl = document.createElement('span');
                    _textEl.className = 'pdx-date-picker-placeholder';
                    _triggerEl.appendChild(_textEl);
                }

                _clearEl = document.createElement('button') as HTMLButtonElement;
                _clearEl.type = 'button';
                _clearEl.className = 'pdx-input-clear pdx-input-suffix-interactive';
                _clearEl.textContent = '×';
                _clearEl.setAttribute('aria-label', getComponentString('date-picker', 'clear')());
                _clearEl.setAttribute('tabindex', '-1');
                _clearEl.style.display = 'none';
                _clearEl.addEventListener('click', (e) => { e.stopPropagation(); onClear(); });
                _triggerEl.appendChild(_clearEl);

                if (_inputEl) {
                    const inputEl = _inputEl;
                    icon.addEventListener('click', (e) => { e.stopPropagation(); togglePopover(); });
                    inputEl.addEventListener('input', () => { _typing = true; });
                    inputEl.addEventListener('keydown', (e) => {
                        if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); openPopover(); }
                        else if (e.key === 'Enter') { e.preventDefault(); commitTyped(); }
                    });
                    inputEl.addEventListener('blur', commitTyped);
                } else {
                    _triggerEl.addEventListener('click', togglePopover);
                    _triggerEl.addEventListener('keydown', (e) => {
                        if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') && !ctx.disabled() && !ctx.readonly()) {
                            e.preventDefault();
                            openPopover();
                        }
                    });
                }
                el.appendChild(_triggerEl);

                // Hidden input
                _hiddenEl = document.createElement('input');
                _hiddenEl.type = 'hidden';
                _hiddenEl.name = name;
                if (!name) _hiddenEl.style.display = 'none';
                el.appendChild(_hiddenEl);

                // Panel
                _panelEl = document.createElement('div');
                _panelEl.className = 'pdx-date-picker-panel';
                _panelEl.id = 'pdx-dp-panel-' + (++_dpPanelSeq);
                _panelEl.style.display = 'none';
                // The dialog the trigger's aria-haspopup announces, with a role and a name.
                _panelEl.setAttribute('role', 'dialog');
                _panelEl.setAttribute('aria-label', getComponentString('date-picker', timeOnly ? 'chooseTime' : 'choose')());
                // role=combobox requires an aria-controls pointing at the popup (axe aria-required-attr).
                _comboEl.setAttribute('aria-controls', _panelEl.id);
                // Prevent clicks inside panel from propagating to trigger (would re-toggle popover)
                _panelEl.addEventListener('click', (e) => e.stopPropagation());
                // The panel may be moved out of the host by the popover: a focus leaving from inside
                // it is heard here too.
                _panelEl.addEventListener('focusout', onFocusOut);

                const panelInner = document.createElement('div');
                panelInner.className = 'pdx-date-picker-panel-inner' + (presets.length ? ' pdx-date-picker-has-presets' : '');

                if (presets.length) {
                    const sidebar = document.createElement('div');
                    sidebar.className = 'pdx-date-picker-presets';
                    for (const preset of presets) {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'pdx-date-picker-preset-btn';
                        btn.textContent = preset.label;
                        const p = preset;
                        btn.addEventListener('click', () => onPresetClick(p));
                        sidebar.appendChild(btn);
                    }
                    panelInner.appendChild(sidebar);
                }

                const main = document.createElement('div');
                main.className = 'pdx-date-picker-main';

                if (!timeOnly) {
                    _calendarEl = makeCalendar();
                    main.appendChild(_calendarEl);
                }

                if (showTimePicker) main.appendChild(makeTimeRow(loc));

                if (showCompare) main.appendChild(makeCompareRow());

                panelInner.appendChild(main);
                _panelEl.appendChild(panelInner);

                const footer = document.createElement('div');
                footer.className = 'pdx-date-picker-footer';

                if (!timeOnly) {
                    const todayBtn = document.createElement('button');
                    todayBtn.type = 'button';
                    todayBtn.className = 'pdx-ghost';
                    todayBtn.setAttribute('size', 'sm');
                    todayBtn.textContent = getComponentString('date-picker', 'today')();
                    todayBtn.addEventListener('click', onTodayClick);
                    footer.appendChild(todayBtn);
                }

                const spacer = document.createElement('div');
                spacer.style.flex = '1';
                footer.appendChild(spacer);

                if (showTimePicker || isRange()) {
                    const doneBtn = document.createElement('button');
                    doneBtn.type = 'button';
                    doneBtn.className = 'pdx-primary';
                    doneBtn.setAttribute('size', 'sm');
                    doneBtn.textContent = getComponentString('date-picker', 'done')();
                    doneBtn.addEventListener('click', closePopover);
                    footer.appendChild(doneBtn);
                }

                _panelEl.appendChild(footer);
                el.appendChild(_panelEl);

                // Setup popover
                if (popover) popover.dispose();
                popover = usePopover({
                    trigger: 'manual',
                    placement: 'bottom-start',
                    dismissOnOutside: true,
                    dismissOnEscape: true,
                    container: el,
                    // Below the sheet breakpoint the stylesheet owns the panel (a bottom sheet); the
                    // popover positions it only above.
                    positioned: () => !window.matchMedia(DATE_PICKER_SHEET_QUERY).matches,
                    onOpenChange(open) {
                        // Whether the user was inside the panel when it closes: a pick, Done, a
                        // preset or Today close it from there, and hiding the focused day would drop
                        // focus to <body>. Every close from inside returns it, as Escape
                        // does. An outside click closes on pointerdown, and the click
                        // then moves focus on to what was clicked, as it would have anyway.
                        const focusWasInside = !open && !!_panelEl?.contains(document.activeElement);
                        if (_panelEl) _panelEl.style.display = open ? '' : 'none';
                        if (_comboEl) _comboEl.setAttribute('aria-expanded', String(open));
                        if (open) {
                            focusIntoPanel();
                            ctx.emit('pdx-open', undefined, { bubbles: false });
                        }
                        if (focusWasInside) _comboEl?.focus();
                        if (!open) {
                            // Discard an INCOMPLETE range on dismiss (start picked, no end): otherwise the
                            // dangling start lingers as a selection that was never committed as a value
                            // ("the pre-order is left dangling outside"). Reverts to the committed rangeStart prop.
                            if (_internalRangeStart() && !_internalRangeEnd()) _internalRangeStart.set('');
                            ctx.emit('pdx-close', undefined, { bubbles: false });
                        }
                    },
                });
                popover.setTrigger(_triggerEl);
                popover.setContent(_panelEl);
            }
        });

        // Reactive structural props: post-mount changes of
        // locale/min/max/mode/etc. are re-applied to the calendar through attributes.
        ctx.track(() => {
            void ctx.locale(); void ctx.calendar(); void ctx.min(); void ctx.max();
            void ctx.mode(); void ctx.numberOfMonths(); void ctx.fiscalStartMonth();
            void ctx.firstDay(); void ctx.weekNumbers(); void ctx.fixedWeeks();
            if (!_built) return;
            requestAnimationFrame(() => {
                if (_calendarEl) initCalendarStructuralProps(_calendarEl);
            });
        });

        // Update track: sync only selection state to existing DOM (no structural props that cause rebuild)
        ctx.track(() => {
            const display = displayValue();
            const ph = getPlaceholder();
            const clearable = ctx.clearable() as boolean;
            const disabled = ctx.disabled() as boolean;
            const readonly_ = ctx.readonly() as boolean;
            const val = _internalValue() || ctx.value() as string;
            const rStart = _internalRangeStart() || ctx.rangeStart() as string;
            const rEnd = _internalRangeEnd() || ctx.rangeEnd() as string;
            const cStart = ctx.compareStart() as string;
            const cEnd = ctx.compareEnd() as string;

            requestAnimationFrame(() => {
                // Update trigger display text
                if (_textEl) {
                    _textEl.textContent = display || ph;
                    _textEl.className = 'pdx-date-picker-text' + (display ? '' : ' pdx-date-picker-placeholder');
                }
                // Editable: the committed value in the locale's pattern, unless the user is typing.
                if (_inputEl) {
                    _inputEl.placeholder = ph;
                    if (!_typing) _inputEl.value = display ? typedText() : '';
                }
                // Toggle clear button
                if (_clearEl) {
                    _clearEl.style.display = (clearable && display && !disabled && !readonly_) ? '' : 'none';
                }
                // Update hidden input — in range mode it serializes both
                // ends (or the submit would lose rangeStart/rangeEnd)
                if (_hiddenEl) {
                    _hiddenEl.value = (isRange() && rStart && rEnd)
                        ? `${rStart}/${rEnd}`
                        : (val || '');
                }

                // Sync selection props via setAttribute (lowercased camelCase matches observedAttributes)
                if (_calendarEl) {
                    _calendarEl.setAttribute('value', val || '');
                    _calendarEl.setAttribute('rangestart', rStart || '');
                    _calendarEl.setAttribute('rangeend', rEnd || '');
                    _calendarEl.setAttribute('comparestart', cStart || '');
                    _calendarEl.setAttribute('compareend', cEnd || '');
                }
            });
        });

        // Exposes the methods on the host: the setup's `return {}` gives them only to the render context,
        // NOT to the DOM element. Without it, host.openPopover() (the imperative API) is undefined.
        (ctx.el as unknown as Record<string, unknown>).openPopover = openPopover;
        (ctx.el as unknown as Record<string, unknown>).closePopover = closePopover;

        // Imperative API: focus/blur/clear
        ctx.expose({
            focus() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.focus(); },
            blur() { (ctx.el.querySelector('input, textarea, [tabindex]:not([tabindex="-1"]), button') as HTMLElement | null)?.blur(); },
            clear() { onClear(); },
        });

        return { openPopover, closePopover, onClear };
    },
    render: () => html``,
});
