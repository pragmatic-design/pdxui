// A bound prop is written when ITS value changes, not whenever its effect runs.
//
// A binding's effect re-runs when anything it read changes — the row object it reads a field from,
// say — and writing the prop every time, even when the value it computed is the one it wrote
// before, is wrong. Meanwhile the component can have moved its own prop on: an input the reader is
// typing in writes what was typed into it. So the re-run would put the stale value back over the
// typing: one name of a category saves, its row is drawn again from the saved record, and the other
// name being typed goes back to the saved one; Enter then changes nothing, and the rename is lost.

import { describe, it, expect, beforeEach } from 'vitest';
import { html, signal, component } from '../src/index';
import { tick } from '../src/testing/index';

component('probe-typed', {
    props: { value: { type: String, default: '' } },
    setup: () => ({}),
    render: (ctx) => html`<span class="v">${() => ctx.value()}</span>`,
});

type Probe = HTMLElement & { value: string };

describe('a bound prop is written when its value changes', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('a re-run that computes the same value leaves what the component holds now', async () => {
        // The row: a record read by the binding, replaced by an equal one after another field's save.
        const row = signal({ en: 'Security', it: 'Sicurezza' });
        document.body.appendChild(html`<probe-typed :value=${() => row().it}></probe-typed>` as unknown as Node);
        await tick();
        const el = document.querySelector('probe-typed') as Probe;
        expect(el.value).toBe('Sicurezza');

        // The component moves its own prop on: what is being typed.
        el.value = 'Sicurezza informatica';
        // Another field's save lands: a new record, the same Italian name.
        row.set({ en: 'Cyber security', it: 'Sicurezza' });
        await tick();
        expect(el.value, 'the stale value was written back over what the component held').toBe('Sicurezza informatica');
    });

    it('control — a value that did change is written, over what the component held', async () => {
        const row = signal({ en: 'Security', it: 'Sicurezza' });
        document.body.appendChild(html`<probe-typed :value=${() => row().it}></probe-typed>` as unknown as Node);
        await tick();
        const el = document.querySelector('probe-typed') as Probe;
        el.value = 'something typed';
        row.set({ en: 'Security', it: 'Sicurezza informatica' });
        await tick();
        expect(el.value).toBe('Sicurezza informatica');
    });
});
