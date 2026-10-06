// `min` and `max` limit the time a user can reach.
//
// Both are declared, typed and defaulted on `pdx-time-picker`, and a declared prop that is read by
// nothing limits nothing: a booking form declaring `min="09:00" max="17:00"` would get a spinner that
// walks to 03:00 and a value the server rejects.
//
// The bound is enforced at `emitChange()`, the single point where a new value leaves the component,
// so arrows, wheel, typed digits and the AM/PM toggle are all covered by one check.
//
// ⚠️ What is deliberately NOT clamped: the `value` prop. An author who passes a value outside their
// own range has a bug in their data, and silently rewriting it hides it. The bound applies to what
// the USER can reach.
import { describe, it, expect, afterEach } from 'vitest';
import { tick, cleanup } from './helpers';
import '../../src/time-picker/pdx-time-picker';

async function mount(attrs: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-time-picker format="24h" ${attrs}></pdx-time-picker>`;
    document.body.appendChild(host);
    await tick(20);
    return host;
}

afterEach(cleanup);

/** Press a key on one segment and return the value the component emitted, if any. */
async function press(host: HTMLElement, segment: 'hour' | 'minute', key: string): Promise<string | null> {
    const el = host.querySelector('pdx-time-picker')!;
    let emitted: string | null = null;
    const onChange = (e: Event) => { emitted = (e as CustomEvent).detail.value; };
    el.addEventListener('pdx-change', onChange);
    const values = host.querySelectorAll<HTMLElement>('.pdx-time-value');
    expect(values.length, 'the picker rendered no segments').toBeGreaterThan(1);
    values[segment === 'hour' ? 0 : 1].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await tick(20);
    el.removeEventListener('pdx-change', onChange);
    return emitted;
}

describe('pdx-time-picker min/max', () => {
    it('steps freely when no bound is given', async () => {
        // The control: without this the clamp could be "always refuse", which passes every other test.
        const host = await mount('value="09:00"');
        expect(await press(host, 'hour', 'ArrowDown')).toBe('08:00');
    });

    it('will not step below min', async () => {
        const host = await mount('value="09:00" min="09:00" max="17:00"');
        expect(await press(host, 'hour', 'ArrowDown')).toBe('09:00');
    });

    it('will not step above max', async () => {
        const host = await mount('value="17:00" min="09:00" max="17:00"');
        expect(await press(host, 'hour', 'ArrowUp')).toBe('17:00');
    });

    it('still moves inside the range', async () => {
        const host = await mount('value="09:00" min="09:00" max="17:00"');
        expect(await press(host, 'hour', 'ArrowUp')).toBe('10:00');
    });

    it('clamps a minute that crosses the bound, not just an hour', async () => {
        const host = await mount('value="17:00" min="09:00" max="17:30"');
        expect(await press(host, 'minute', 'ArrowUp')).toBe('17:01');
        expect(await press(host, 'hour', 'ArrowUp')).toBe('17:30');
    });

    it('ignores a bound it cannot parse, rather than clamping to nothing', async () => {
        const host = await mount('value="09:00" min="not a time"');
        expect(await press(host, 'hour', 'ArrowDown')).toBe('08:00');
    });
});
