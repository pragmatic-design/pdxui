// pdx-date-picker's pieces, built as the TypeScript version built them: the calendar's structural
// attributes, the inner time picker, the compare row, the trigger's icon, the presets sidebar and the
// panel's footer. Beside the component, which holds the state and passes what each piece needs.

import { getComponentString } from '@pdxui/core';
import type { DatePreset } from './date-picker-types';

/** What the calendar is drawn from that does not change with the selection. */
export type CalendarSetup = {
    mode: string;
    numberOfMonths: number;
    locale: string;
    calendar: string;
    min: string;
    max: string;
    fiscalStartMonth: number;
    weekNumbers: boolean;
    firstDay: number;
    fixedWeeks: boolean;
    disabledDates: unknown;
    highlightedDates: unknown;
};

/** Set structural props on the calendar (these trigger a DOM rebuild if changed). */
export function initCalendarStructuralProps(cal: HTMLElement & { disabledDates?: unknown; highlightedDates?: unknown }, s: CalendarSetup): void {
    cal.setAttribute('mode', s.mode);
    cal.setAttribute('numberofmonths', String(s.numberOfMonths));
    cal.setAttribute('locale', s.locale);
    cal.setAttribute('calendar', s.calendar);
    if (s.min) cal.setAttribute('min', s.min);
    if (s.max) cal.setAttribute('max', s.max);
    cal.setAttribute('fiscalstartmonth', String(s.fiscalStartMonth));
    if (s.weekNumbers) cal.setAttribute('weeknumbers', '');
    if (s.firstDay >= 0) cal.setAttribute('firstday', String(s.firstDay));
    if (s.fixedWeeks) cal.setAttribute('fixedweeks', '');
    // Pass function props via property (can't use attributes)
    if (s.disabledDates) cal.disabledDates = s.disabledDates;
    if (s.highlightedDates) cal.highlightedDates = s.highlightedDates;
}

/** The inner time picker, with every time prop the date picker declares actually passed on.
 *  `showSeconds` and `timeStep` are declared on the date picker and implemented on the time
 *  picker, so they are carried across here. */
export function makeTimePicker(
    loc: string, opts: { format: string; showSeconds: boolean; step: number }, onChange: (e: CustomEvent) => void,
): HTMLElement {
    const tp = document.createElement('pdx-time-picker');
    tp.setAttribute('format', opts.format);
    tp.setAttribute('locale', loc);
    if (opts.showSeconds) tp.setAttribute('show-seconds', '');
    tp.setAttribute('step', String(opts.step));
    tp.addEventListener('value-change', onChange as EventListener);
    return tp;
}

/** The "compare to" toggle row. */
export function makeCompareRow(onToggle: (on: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'pdx-date-picker-compare';
    const label = document.createElement('label');
    label.className = 'pdx-date-picker-compare-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', () => onToggle(cb.checked));
    label.appendChild(cb);
    const lbl = document.createElement('span');
    lbl.textContent = ' ' + getComponentString('date-picker', 'compareToggle')();
    label.appendChild(lbl);
    row.appendChild(label);
    return row;
}

/** The trigger's icon: inline SVG, with no dependency on the icon registry's timing. Editable, it is
 *  the button that opens the calendar — the input's click is for typing. */
export function makeTriggerIcon(timeOnly: boolean, editable: boolean, disabled: boolean): HTMLElement {
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
        btn.disabled = disabled;
    } else {
        icon.setAttribute('aria-hidden', 'true');
    }
    return icon;
}

/** The presets sidebar: one button per preset. */
export function makePresets(presets: DatePreset[], onPick: (preset: DatePreset) => void): HTMLElement {
    const sidebar = document.createElement('div');
    sidebar.className = 'pdx-date-picker-presets';
    for (const preset of presets) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pdx-date-picker-preset-btn';
        btn.setAttribute('data-part', 'preset');
        btn.textContent = preset.label;
        const p = preset;
        btn.addEventListener('click', () => onPick(p));
        sidebar.appendChild(btn);
    }
    return sidebar;
}

/** The panel's footer: Today (unless time-only) and Done (with a time or a range). */
export function makeFooter(opts: { timeOnly: boolean; withDone: boolean }, onToday: () => void, onDone: () => void): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'pdx-date-picker-footer';

    if (!opts.timeOnly) {
        const todayBtn = document.createElement('button');
        todayBtn.type = 'button';
        todayBtn.className = 'pdx-ghost';
        todayBtn.setAttribute('size', 'sm');
        todayBtn.textContent = getComponentString('date-picker', 'today')();
        todayBtn.addEventListener('click', onToday);
        footer.appendChild(todayBtn);
    }

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    footer.appendChild(spacer);

    if (opts.withDone) {
        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'pdx-primary';
        doneBtn.setAttribute('size', 'sm');
        doneBtn.textContent = getComponentString('date-picker', 'done')();
        doneBtn.addEventListener('click', onDone);
        footer.appendChild(doneBtn);
    }
    return footer;
}
