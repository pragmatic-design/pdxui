/**
 * A parent that empties `value` — a form reset to its default '', a "clear filters" button — empties
 * the trigger, as `clear()` does. The picker splits the model into its own date and time; the sync
 * from the model wrote them only for a non-empty string, so the old date stayed on show and
 * `getDate()` still returned it. pdx-cascader and pdx-tree-select had the same gap (#1210).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/date-picker/pdx-date-picker.pdx';

const text = (el: HTMLElement) => el.querySelector('.pdx-date-picker-text, .pdx-date-picker-placeholder')?.textContent ?? '';

describe('pdx-date-picker — an empty value from outside', () => {
    beforeEach(cleanup);

    it('clears the date: the trigger shows the placeholder, getDate() is empty', async () => {
        const el = await mount('pdx-date-picker', { value: '2024-06-15', placeholder: 'Pick a day' }) as HTMLElement & { value: string; getDate(): string };
        await tick(50);
        // The control: the date is on show before the write.
        expect(el.getDate()).toBe('2024-06-15');
        expect(text(el)).not.toBe('Pick a day');

        el.value = '';
        await tick(50);
        expect(el.getDate()).toBe('');
        expect(text(el)).toBe('Pick a day');
    });

    // The model of a time-only picker is '' until a time is set (currentModel); the trigger showed
    // the time picker's starting 00:00 instead, a time nobody chose and the value does not hold.
    it('a time-only picker with no value shows its placeholder, not 00:00', async () => {
        const el = await mount('pdx-date-picker', { mode: 'time', placeholder: 'Pick a time' }) as HTMLElement & { value: string };
        await tick(50);
        expect(el.value).toBe('');
        expect(text(el)).toBe('Pick a time');
    });

    it('clears a time-only picker: the trigger shows the placeholder again', async () => {
        const el = await mount('pdx-date-picker', { mode: 'time', value: '09:30', placeholder: 'Pick a time' }) as HTMLElement & { value: string };
        await tick(50);
        expect(text(el)).toBe('09:30');

        el.value = '';
        await tick(50);
        expect(text(el)).toBe('Pick a time');
    });
});
