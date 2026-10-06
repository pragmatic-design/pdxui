// pdx-date-picker editable: a typed date, in the locale's pattern or ISO, validated, committed on
// Enter and blur.
//
// Without text entry, a keyboard user who knows the date has to open the popup and page through
// months. `editable` makes the trigger's text an input that keeps the combobox role; the calendar icon
// becomes the "Choose date" button.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import { parseTypedDate, parseTypedDateTime, formatTypedDate, dateAllowed } from '../../src/date-picker/typed-date';
import '../../src/date-picker/pdx-date-picker';

describe('parseTypedDate: the locale\'s pattern, or ISO', () => {
    it('en-US reads month/day/year', () => {
        expect(parseTypedDate('06/23/2024', 'en-US')).toBe('2024-06-23');
        expect(parseTypedDate('6/3/2024', 'en-US')).toBe('2024-06-03');
    });

    it('it-IT reads day/month/year, de-DE its dots', () => {
        expect(parseTypedDate('23/06/2024', 'it-IT')).toBe('2024-06-23');
        expect(parseTypedDate('23.06.2024', 'de-DE')).toBe('2024-06-23');
    });

    it('ISO is accepted in every locale', () => {
        for (const loc of ['en-US', 'it-IT', 'de-DE', 'ja-JP']) expect(parseTypedDate('2024-06-23', loc), loc).toBe('2024-06-23');
    });

    it('a date that does not exist, or text that is not one, is null', () => {
        expect(parseTypedDate('13/45/2024', 'en-US')).toBeNull();
        expect(parseTypedDate('02/30/2024', 'en-US')).toBeNull();
        expect(parseTypedDate('23/06/2024', 'en-US')).toBeNull();   // day 23 read as the month
        expect(parseTypedDate('tomorrow', 'en-US')).toBeNull();
        expect(parseTypedDate('', 'en-US')).toBeNull();
    });

    it('a date alone is read without a time after it', () => {
        expect(parseTypedDate('06/23/2024 14:30', 'en-US')).toBeNull();
    });

    it('formatTypedDate writes the form the parser reads, round trip', () => {
        for (const loc of ['en-US', 'it-IT', 'de-DE', 'ja-JP', 'ar-EG']) {
            const text = formatTypedDate('2024-06-23', loc);
            expect(parseTypedDate(text, loc), `${loc}: "${text}"`).toBe('2024-06-23');
        }
        expect(formatTypedDate('2024-06-23', 'en-US')).toBe('06/23/2024');
    });

    it('dateAllowed: min, max and disabledDates', () => {
        expect(dateAllowed('2024-06-23', { min: '2024-06-01', max: '2024-06-30' })).toBe(true);
        expect(dateAllowed('2024-07-01', { max: '2024-06-30' })).toBe(false);
        expect(dateAllowed('2024-05-31', { min: '2024-06-01' })).toBe(false);
        expect(dateAllowed('2024-06-23', { disabledDates: (iso: string) => iso === '2024-06-23' })).toBe(false);
    });
});

// A datetime picker keeps a time typed after the date: the field does not go back to the previous
// time, pdx-change carries the `time`, and "25:99" is not taken without a word.
describe('parseTypedDateTime: the date, and the time after it', () => {
    const t = (hours: number, minutes: number, seconds = 0) => ({ hours, minutes, seconds });

    it('a 24-hour time, with or without seconds, after the locale\'s date or ISO', () => {
        expect(parseTypedDateTime('06/23/2024 14:30', 'en-US')).toEqual({ date: '2024-06-23', time: t(14, 30) });
        expect(parseTypedDateTime('23/06/2024 09:05:07', 'it-IT')).toEqual({ date: '2024-06-23', time: t(9, 5, 7) });
        expect(parseTypedDateTime('2024-06-23T14:30', 'en-US')).toEqual({ date: '2024-06-23', time: t(14, 30) });
        expect(parseTypedDateTime('2024-06-23 14:30', 'de-DE')).toEqual({ date: '2024-06-23', time: t(14, 30) });
    });

    it('a 12-hour time with its period', () => {
        expect(parseTypedDateTime('06/23/2024 2:30 PM', 'en-US')?.time).toEqual(t(14, 30));
        expect(parseTypedDateTime('06/23/2024, 2:30 p.m.', 'en-US')?.time).toEqual(t(14, 30));
        expect(parseTypedDateTime('06/23/2024 12:05 am', 'en-US')?.time).toEqual(t(0, 5));
        expect(parseTypedDateTime('06/23/2024 12:05 PM', 'en-US')?.time).toEqual(t(12, 5));
    });

    it('no time: the date, and a null time', () => {
        expect(parseTypedDateTime('06/23/2024', 'en-US')).toEqual({ date: '2024-06-23', time: null });
    });

    it('a time that is not one makes the whole entry null', () => {
        expect(parseTypedDateTime('06/23/2024 25:99', 'en-US')).toBeNull();
        expect(parseTypedDateTime('06/23/2024 14:60', 'en-US')).toBeNull();
        expect(parseTypedDateTime('06/23/2024 13:00 PM', 'en-US')).toBeNull();
        expect(parseTypedDateTime('06/23/2024 0:30 AM', 'en-US')).toBeNull();
        expect(parseTypedDateTime('06/23/2024 14', 'en-US')).toBeNull();
        expect(parseTypedDateTime('02/30/2024 14:30', 'en-US')).toBeNull();
    });
});

type Picker = HTMLElement & { value: string };
const input = (el: HTMLElement) => el.querySelector('input.pdx-date-picker-input') as HTMLInputElement | null;
function type(el: HTMLElement, text: string): HTMLInputElement {
    const i = input(el)!;
    i.focus();
    i.value = text;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return i;
}
const enter = (i: HTMLElement) => i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
function changes(el: HTMLElement): CustomEvent[] {
    const seen: CustomEvent[] = [];
    el.addEventListener('pdx-change', (e) => seen.push(e as CustomEvent));
    return seen;
}

describe('pdx-date-picker editable', () => {
    beforeEach(cleanup);

    it('without editable there is no text input: today\'s trigger', async () => {
        const el = await mount('pdx-date-picker', { locale: 'en-US' });
        await tick(50);
        expect(input(el)).toBeNull();
        expect(el.querySelector('.pdx-date-picker-trigger')?.getAttribute('role')).toBe('combobox');
    });

    it('the input is the combobox; the icon is the "Choose date" button', async () => {
        const el = await mount('pdx-date-picker', { locale: 'en-US', editable: '' });
        await tick(50);
        const i = input(el)!;
        expect(i).not.toBeNull();
        expect(i.getAttribute('role')).toBe('combobox');
        expect(i.getAttribute('aria-expanded')).toBe('false');
        expect(i.getAttribute('aria-haspopup')).toBe('dialog');
        const panelId = i.getAttribute('aria-controls')!;
        expect(el.querySelector(`#${panelId}`)?.getAttribute('role')).toBe('dialog');
        expect(i.getAttribute('aria-label')).toBe('Choose date');
        expect(el.querySelector('.pdx-date-picker-trigger')?.hasAttribute('role'), 'one combobox, not two').toBe(false);
        const btn = el.querySelector('button.pdx-date-picker-icon') as HTMLButtonElement;
        expect(btn.getAttribute('aria-label')).toBe('Choose date');
        btn.click();
        await tick(50);
        expect(i.getAttribute('aria-expanded')).toBe('true');
    });

    it('en-US: "06/23/2024" + Enter commits 2024-06-23, one pdx-change, the calendar on June 2024', async () => {
        const el = await mount('pdx-date-picker', { locale: 'en-US', editable: '', value: '2024-01-10' }) as Picker;
        await tick(50);
        const seen = changes(el);
        enter(type(el, '06/23/2024'));
        await tick(50);
        expect(el.value).toBe('2024-06-23');
        expect(seen.map(e => e.detail)).toEqual([{ value: '2024-06-23' }]);
        expect(el.querySelector('.pdx-cal-grid')?.getAttribute('aria-label')).toBe('June 2024');
        expect(input(el)!.hasAttribute('aria-invalid')).toBe(false);
    });

    it('it-IT: "23/06/2024" commits on blur; ISO is accepted too', async () => {
        const el = await mount('pdx-date-picker', { locale: 'it-IT', editable: '' }) as Picker;
        await tick(50);
        const seen = changes(el);
        type(el, '23/06/2024').blur();
        await tick(50);
        expect(el.value).toBe('2024-06-23');
        type(el, '2024-07-01').blur();
        await tick(50);
        expect(el.value).toBe('2024-07-01');
        expect(seen).toHaveLength(2);
    });

    it('an impossible date, or one past max, is aria-invalid, fires nothing, and keeps the value and the text', async () => {
        const el = await mount('pdx-date-picker', { locale: 'en-US', editable: '', value: '2024-06-10', max: '2024-06-30' }) as Picker;
        await tick(50);
        const seen = changes(el);
        const i = type(el, '13/45/2024');
        enter(i);
        await tick(50);
        expect(i.getAttribute('aria-invalid')).toBe('true');
        expect(el.value).toBe('2024-06-10');
        expect(i.value, 'no silent correction').toBe('13/45/2024');
        enter(type(el, '07/15/2024'));
        await tick(50);
        expect(i.getAttribute('aria-invalid')).toBe('true');
        expect(el.value).toBe('2024-06-10');
        expect(seen).toHaveLength(0);
        // Fixed: valid again, committed, and the mark goes.
        enter(type(el, '06/20/2024'));
        await tick(50);
        expect(i.hasAttribute('aria-invalid')).toBe(false);
        expect(el.value).toBe('2024-06-20');
    });

    it('the committed value shows in the locale\'s pattern; a pick from the calendar updates the text', async () => {
        const el = await mount('pdx-date-picker', { locale: 'en-US', editable: '', value: '2024-06-15' }) as Picker;
        await tick(60);
        expect(input(el)!.value).toBe('06/15/2024');
        (el.querySelector('button.pdx-date-picker-icon') as HTMLButtonElement).click();
        await tick(50);
        (el.querySelector('[data-iso="2024-06-23"]') as HTMLElement).click();
        await tick(60);
        expect(input(el)!.value).toBe('06/23/2024');
    });

    it('Alt+ArrowDown in the input opens the popup', async () => {
        const el = await mount('pdx-date-picker', { locale: 'en-US', editable: '' });
        await tick(50);
        const i = input(el)!;
        i.focus();
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
        await tick(50);
        expect(i.getAttribute('aria-expanded')).toBe('true');
    });

    it('clearing the text and committing clears the value', async () => {
        const el = await mount('pdx-date-picker', { locale: 'en-US', editable: '', value: '2024-06-15' }) as Picker;
        await tick(50);
        const seen = changes(el);
        enter(type(el, ''));
        await tick(50);
        expect(el.value).toBe('');
        expect(seen.map(e => e.detail.value)).toEqual(['']);
    });
});

describe('pdx-date-picker editable, mode="datetime": the typed time', () => {
    beforeEach(cleanup);
    const timePicker = (el: HTMLElement) => el.querySelector('pdx-time-picker') as (HTMLElement & { value: string }) | null;
    const datetime = (extra: Record<string, string> = {}) =>
        mount('pdx-date-picker', { locale: 'en-US', editable: '', mode: 'datetime', ...extra }) as Promise<Picker>;

    it('"06/23/2024 14:30" + Enter: the date, the time in the field and the panel, one pdx-change with both', async () => {
        const el = await datetime();
        await tick(50);
        const seen = changes(el);
        const i = type(el, '06/23/2024 14:30');
        enter(i);
        await tick(50);
        expect(el.value).toBe('2024-06-23');
        expect(i.value, 'the typed time went back to the previous one').toBe('06/23/2024 14:30');
        expect(seen.map(e => e.detail)).toEqual([{ value: '2024-06-23', time: '14:30' }]);
        expect(timePicker(el)?.value, 'the panel\'s time picker still shows the old time').toBe('14:30');
    });

    it('a 12-hour time is read on the 24-hour clock the value is in', async () => {
        const el = await datetime();
        await tick(50);
        const seen = changes(el);
        enter(type(el, '06/23/2024 2:30 PM'));
        await tick(50);
        expect(seen.map(e => e.detail.time)).toEqual(['14:30']);
        expect(input(el)!.value).toBe('06/23/2024 14:30');
    });

    it('a time that is not one is aria-invalid, keeps the value and the text, and fires nothing', async () => {
        const el = await datetime({ value: '2024-06-10' });
        await tick(50);
        const seen = changes(el);
        const i = type(el, '06/23/2024 25:99');
        enter(i);
        await tick(50);
        expect(i.getAttribute('aria-invalid')).toBe('true');
        expect(el.value).toBe('2024-06-10');
        expect(i.value).toBe('06/23/2024 25:99');
        expect(seen).toHaveLength(0);
    });

    it('a date with no time keeps the time already set', async () => {
        const el = await datetime();
        await tick(50);
        enter(type(el, '06/23/2024 14:30'));
        await tick(50);
        const seen = changes(el);
        enter(type(el, '06/24/2024'));
        await tick(50);
        expect(el.value).toBe('2024-06-24');
        expect(input(el)!.value).toBe('06/24/2024 14:30');
        expect(seen.map(e => e.detail)).toEqual([{ value: '2024-06-24', time: '14:30' }]);
    });

    it('the same date with a new time is a change too', async () => {
        const el = await datetime();
        await tick(50);
        enter(type(el, '06/23/2024 14:30'));
        await tick(50);
        const seen = changes(el);
        enter(type(el, '06/23/2024 09:15'));
        await tick(50);
        expect(seen.map(e => e.detail)).toEqual([{ value: '2024-06-23', time: '09:15' }]);
    });

    it('seconds: kept with show-seconds; without it, seconds other than zero are not dropped in silence', async () => {
        const withSeconds = await datetime({ 'show-seconds': '' });
        await tick(50);
        const seen = changes(withSeconds);
        enter(type(withSeconds, '06/23/2024 14:30:15'));
        await tick(50);
        expect(seen.map(e => e.detail.time)).toEqual(['14:30:15']);

        cleanup();
        const without = await datetime();
        await tick(50);
        const i = type(without, '06/23/2024 14:30:15');
        enter(i);
        await tick(50);
        expect(i.getAttribute('aria-invalid')).toBe('true');
        enter(type(without, '06/23/2024 14:30:00'));
        await tick(50);
        expect(i.hasAttribute('aria-invalid')).toBe(false);
        expect(input(without)!.value).toBe('06/23/2024 14:30');
    });

    it('the control: mode="date" still refuses a time after the date', async () => {
        const el = await mount('pdx-date-picker', { locale: 'en-US', editable: '' }) as Picker;
        await tick(50);
        const i = type(el, '06/23/2024 14:30');
        enter(i);
        await tick(50);
        expect(i.getAttribute('aria-invalid')).toBe('true');
    });
});
