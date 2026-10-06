// pdx-time-picker reflects its value on the element, and can be empty.
//
// Two parts of the value contract. The value is not only in the pdx-change event: `el.value` follows
// when the user sets 02:15, because registerFormControl names `value` as the control's value.
// And an empty value is not «00 : 00» with aria-valuenow 0 on both spinbuttons — that is midnight, on
// screen and to a screen reader, not «no time».
import { describe, it, expect, afterEach } from 'vitest';
import { tick, cleanup } from './helpers';
import '../../src/time-picker/pdx-time-picker';

type TimePicker = HTMLElement & { value: string; clear(): void };

async function mount(attrs = ''): Promise<TimePicker> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-time-picker format="24h" ${attrs}></pdx-time-picker>`;
    document.body.appendChild(host);
    await tick(20);
    return host.querySelector('pdx-time-picker') as TimePicker;
}

const segments = (el: HTMLElement): HTMLElement[] => Array.from(el.querySelectorAll<HTMLElement>('.pdx-time-value'));

async function press(el: HTMLElement, index: number, key: string): Promise<void> {
    segments(el)[index].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await tick(20);
}

function record(el: HTMLElement): string[] {
    const seen: string[] = [];
    el.addEventListener('pdx-change', (e) => seen.push((e as CustomEvent).detail.value));
    return seen;
}

afterEach(cleanup);

describe('pdx-time-picker reflects its value', () => {
    it('after ArrowUp on the hour, el.value is the emitted value', async () => {
        const el = await mount('value="00:00"');
        const seen = record(el);
        await press(el, 0, 'ArrowUp');
        expect(seen.at(-1)).toBe('01:00');
        expect(el.value, 'the value lives only in the event').toBe('01:00');
    });

    it('typed digits reach el.value: 0 2 on the hour, 1 5 on the minute gives 02:15', async () => {
        const el = await mount('value="10:30"');
        for (const d of ['0', '2']) await press(el, 0, d);
        for (const d of ['1', '5']) await press(el, 1, d);
        expect(el.value).toBe('02:15');
    });

    it('a value set from outside after mount is shown, and stepping goes on from it', async () => {
        const el = await mount();
        el.value = '08:00';
        await tick(20);
        expect(segments(el).map(s => s.textContent)).toEqual(['08', '00']);
        await press(el, 0, 'ArrowUp');
        expect(el.value).toBe('09:00');
    });
});

describe('pdx-time-picker can be empty', () => {
    it('value="" shows -- in every segment, with no aria-valuenow and an «empty» valuetext', async () => {
        const el = await mount('value=""');
        const segs = segments(el);
        expect(segs.map(s => s.textContent), 'an empty picker shows midnight').toEqual(['--', '--']);
        for (const s of segs) {
            expect(s.hasAttribute('aria-valuenow'), `${s.getAttribute('aria-label')} announces a number`).toBe(false);
            expect(s.getAttribute('aria-valuetext')).toBe('No time');
        }
        expect(el.value).toBe('');
    });

    it('from empty, ArrowUp on the minute gives 00:01', async () => {
        const el = await mount();
        const seen = record(el);
        await press(el, 1, 'ArrowUp');
        expect(seen).toEqual(['00:01']);
        expect(segments(el).map(s => s.textContent)).toEqual(['00', '01']);
    });

    it('from empty with min="09:00", ArrowUp on the minute starts from min: 09:01', async () => {
        const el = await mount('min="09:00"');
        const seen = record(el);
        await press(el, 1, 'ArrowUp');
        expect(seen).toEqual(['09:01']);
    });

    it('clear() returns to empty and emits value \'\'', async () => {
        const el = await mount('value="10:30"');
        const seen = record(el);
        el.clear();
        await tick(20);
        expect(seen).toEqual(['']);
        expect(el.value).toBe('');
        expect(segments(el).map(s => s.textContent)).toEqual(['--', '--']);
    });

    it('the control: value="10:30" shows 10 and 30, with numeric aria-valuenow', async () => {
        const el = await mount('value="10:30"');
        const segs = segments(el);
        expect(segs.map(s => s.textContent)).toEqual(['10', '30']);
        expect(segs.map(s => s.getAttribute('aria-valuenow'))).toEqual(['10', '30']);
        expect(segs[0].hasAttribute('aria-valuetext')).toBe(false);
    });
});
