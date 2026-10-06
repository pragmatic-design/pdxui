// pdx-segmented takes its options as an array, as every other data-driven control does.
//
// An array bound from a template — `:options="choices"`, the way pdx-select takes its options — is
// taken as it is: a String prop read with JSON.parse would receive "[object Object],[object Object]",
// throw, and render the control empty with nothing said.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { html, signal } from '@pdxui/core';
import '../../src/segmented/pdx-segmented';

const items = (el: Element): string[] =>
    [...el.querySelectorAll('.pdx-segmented-item')].map(b => (b.textContent ?? '').trim());

async function rendered(el: Element, n: number): Promise<void> {
    await vi.waitFor(() => { expect(items(el)).toHaveLength(n); }, { timeout: 2000 });
}

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('pdx-segmented options', () => {
    it('an array set as a property renders one item per option', async () => {
        const el = document.createElement('pdx-segmented') as HTMLElement & { options: unknown };
        document.body.appendChild(el);
        el.options = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];
        await rendered(el, 2);
        expect(items(el)).toEqual(['Alpha', 'Beta']);
    });

    it('a :options binding, in the shape the compiler emits, renders and follows its signal', async () => {
        // `:options="choices"` compiles to `:options=${() => ctx.choices}`; a $derived to `:options=${ctx.x}`.
        const choices = signal<string[]>(['day', 'week']);
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.appendChild(html`<pdx-segmented :options=${() => choices()}></pdx-segmented>`);
        const el = host.querySelector('pdx-segmented')!;
        await rendered(el, 2);
        expect(items(el)).toEqual(['day', 'week']);
        choices.set(['day', 'week', 'month']);
        await rendered(el, 3);
    });

    it('the static form keeps working: a JSON attribute of strings', async () => {
        document.body.innerHTML = `<pdx-segmented options='["x","y"]'></pdx-segmented>`;
        const el = document.body.firstElementChild!;
        await rendered(el, 2);
        expect(items(el)).toEqual(['x', 'y']);
    });

    it('a JSON string bound as a property keeps working (core parses it for an Array prop)', async () => {
        const el = document.createElement('pdx-segmented') as HTMLElement & { options: unknown };
        document.body.appendChild(el);
        el.options = JSON.stringify([{ value: 'r', label: 'Rossi' }]);
        await rendered(el, 1);
        expect(items(el)).toEqual(['Rossi']);
    });

    it('an unreadable value renders nothing, and says so once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        document.body.innerHTML = `<pdx-segmented options="day, week"></pdx-segmented>`;
        const el = document.body.firstElementChild as HTMLElement & { value: string };
        await vi.waitFor(() => { expect(warn).toHaveBeenCalled(); }, { timeout: 2000 });
        el.value = 'day'; // a re-render reads the options again
        await new Promise(r => requestAnimationFrame(() => r(undefined)));
        expect(items(el)).toEqual([]);
        const mine = warn.mock.calls.filter(c => String(c[0]).includes('[pdx-segmented]'));
        expect(mine).toHaveLength(1);
        expect(String(mine[0][0])).toContain('day, week');
    });

    it('the control: no options at all renders nothing and warns nothing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        document.body.innerHTML = `<pdx-segmented></pdx-segmented>`;
        await new Promise(r => requestAnimationFrame(() => r(undefined)));
        expect(items(document.body.firstElementChild!)).toEqual([]);
        expect(warn.mock.calls.filter(c => String(c[0]).includes('[pdx-segmented]'))).toHaveLength(0);
    });
});
