// `<pdx-date-picker mode="datetime" show-seconds time-step="15">` shows seconds and steps by 15.
//
// The date picker builds a `pdx-time-picker`, and forwarding only `format` and `locale` to it would
// stop the two props describing the time part of a datetime picker at the boundary between the two
// components: declared, typed and defaulted, and read by nothing.
//
// The inner picker implements both (`showSeconds`, `step`); the outer one passes them on.
import { describe, it, expect, afterEach } from 'vitest';
import { tick, cleanup } from './helpers';
import '../../src/date-picker/pdx-date-picker';

async function mount(attrs: string, mode = 'datetime'): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-date-picker mode="${mode}" ${attrs}></pdx-date-picker>`;
    document.body.appendChild(host);
    await tick(30);
    // The panel — and with it the time picker — is built on open.
    (host.querySelector('pdx-date-picker') as any).openPopover();
    await tick(30);
    return host;
}

/** The same picker rendered inline: no trigger, no popover, the contents on the page. */
async function mountInline(attrs: string, mode = 'datetime'): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-date-picker inline mode="${mode}" ${attrs}></pdx-date-picker>`;
    document.body.appendChild(host);
    await tick(30);
    return host;
}

afterEach(cleanup);

const timePicker = (host: HTMLElement): HTMLElement | null => host.querySelector('pdx-time-picker');

describe('pdx-date-picker forwards its time props', () => {
    it('builds a time picker at all in datetime mode', async () => {
        // The control: every assertion below reads an attribute off this element, and a missing
        // element would make them all fail for a reason that has nothing to do with the props.
        expect(timePicker(await mount(''))).not.toBeNull();
    });

    it('forwards show-seconds', async () => {
        const tp = timePicker(await mount('show-seconds'))!;
        expect(tp.hasAttribute('show-seconds')).toBe(true);
    });

    it('does not set show-seconds when it was not asked for', async () => {
        const tp = timePicker(await mount(''))!;
        expect(tp.hasAttribute('show-seconds')).toBe(false);
    });

    it('forwards time-step as the inner picker step', async () => {
        const tp = timePicker(await mount('time-step="15"'))!;
        expect(tp.getAttribute('step')).toBe('15');
    });

    it('forwards both to the second picker of a range', async () => {
        const host = await mount('show-seconds time-step="30"', 'datetimerange');
        const pickers = host.querySelectorAll('pdx-time-picker');
        expect(pickers.length, 'a range shows two time pickers').toBe(2);
        for (const tp of pickers) {
            expect(tp.hasAttribute('show-seconds')).toBe(true);
            expect(tp.getAttribute('step')).toBe('30');
        }
    });
});

// `<pdx-date-picker inline mode="datetime">` shows a calendar AND a time picker.
//
// The build function reads `showTimePicker = hasTime()` at the top, and an `isInline` branch that
// returned straight after appending the calendar — before the point where the panel builds its time
// picker — would silently drop `datetime`, `datetimerange`, `time` and `showTime`, and render
// `inline mode="time"` as a calendar and nothing else: the one thing that mode says it is not.
//
// `inline` is the obvious way to get the panel on screen without a click, which is why the control
// assertion of the tests above checks that a time picker exists at all.
describe('inline renders the time part too', () => {
    const timePicker = (host: HTMLElement) => host.querySelector('pdx-time-picker');
    const calendar = (host: HTMLElement) => host.querySelector('pdx-calendar');

    it('builds no time picker for a plain date, inline', async () => {
        // The control: "always build one" satisfies every other test in this block.
        const host = await mountInline('', 'date');
        expect(calendar(host), 'no calendar either — the picker did not render').not.toBeNull();
        expect(timePicker(host)).toBeNull();
    });

    it('builds one for datetime', async () => {
        const host = await mountInline('');
        expect(calendar(host)).not.toBeNull();
        expect(timePicker(host), 'inline datetime has no time part').not.toBeNull();
    });

    it('builds two for a datetime range', async () => {
        const host = await mountInline('', 'datetimerange');
        expect(host.querySelectorAll('pdx-time-picker').length).toBe(2);
    });

    it('honours showTime on a date picker', async () => {
        const host = await mountInline('show-time', 'date');
        expect(timePicker(host)).not.toBeNull();
    });

    it('shows a time picker and no calendar for mode=time', async () => {
        const host = await mountInline('', 'time');
        expect(timePicker(host), 'an inline time picker with no time picker').not.toBeNull();
        expect(calendar(host), 'an inline time picker showing a calendar').toBeNull();
    });

    it('forwards the same time props it forwards in the panel', async () => {
        // The reason makeTimePicker() is one function shared by both call sites.
        const tp = timePicker(await mountInline('show-seconds time-step="15"'))!;
        expect(tp.hasAttribute('show-seconds')).toBe(true);
        expect(tp.getAttribute('step')).toBe('15');
    });
});
