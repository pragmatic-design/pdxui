// pdx-radio-group must follow what the user clicks. A group that listens for pdx-change on its own
// host and re-emits pdx-change from that same host catches its own event and emits again: one click
// on a radio overflows the stack ("Maximum call stack size exceeded"), a listener on the group sees
// dozens of events, and the group's value never changes. pdx-checkbox-group has the same shape.

import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/radio/pdx-radio';
import '../../src/radio-group/pdx-radio-group';

type Group = HTMLElement & { value: string };

async function until<T>(pick: () => T | null | undefined, what: string): Promise<T> {
    for (let i = 0; i < 30; i++) {
        const found = pick();
        if (found) return found;
        await new Promise(r => requestAnimationFrame(r));
    }
    throw new Error(`never appeared: ${what}`);
}

async function createGroup(attrs: Record<string, string> = {}): Promise<{ group: Group; inputs: HTMLInputElement[] }> {
    const form = document.createElement('form');
    const group = document.createElement('pdx-radio-group') as Group;
    for (const [k, v] of Object.entries(attrs)) group.setAttribute(k, v);
    group.innerHTML = `
        <pdx-radio value="x">X</pdx-radio>
        <pdx-radio value="y">Y</pdx-radio>
        <pdx-radio value="z">Z</pdx-radio>`;
    form.appendChild(group);
    document.body.appendChild(form);
    const inputs = await until(() => {
        const found = [...group.querySelectorAll<HTMLInputElement>('input[type=radio]')];
        return found.length === 3 && found.every(i => i.name) ? found : null;
    }, 'three named radio inputs');
    return { group, inputs };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('pdx-radio-group follows its children', () => {
    it('a click sets the group value, and a listener on the group gets exactly one pdx-change', async () => {
        const { group, inputs } = await createGroup({ value: 'x' });
        const seen: unknown[] = [];
        group.addEventListener('pdx-change', (e) => seen.push((e as CustomEvent).detail));
        inputs[1].click();
        expect(group.value).toBe('y');
        expect(seen).toEqual([{ value: 'y' }]);
    });

    it('a parent that binds the value back does not start a loop', async () => {
        const { group, inputs } = await createGroup({ value: 'x' });
        let count = 0;
        group.addEventListener('pdx-change', (e) => {
            count++;
            if (count > 50) return; // circuit breaker: the defect looped
            group.value = (e as CustomEvent).detail.value; // what `:value` + `@pdx-change` does
        });
        inputs[2].click();
        await new Promise(r => requestAnimationFrame(r));
        expect(count).toBe(1);
        expect(group.value).toBe('z');
    });

    it('the children follow: after a click only the clicked radio is checked, across frames', async () => {
        const { group, inputs } = await createGroup({ value: 'x' });
        inputs[1].click();
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));
        expect(inputs.map(i => i.checked)).toEqual([false, true, false]);
        expect(group.value).toBe('y');
    });

    it('a form containing the group submits the chosen value', async () => {
        const { group, inputs } = await createGroup({ name: 'plan', value: 'x' });
        inputs[2].click();
        const data = new FormData(group.closest('form')!);
        // Once: `toContain` is also satisfied by a duplicated list. happy-dom has no
        // ElementInternals, so which element submits is measured in Chromium, form-value-once.spec.ts.
        expect(data.getAll('plan')).toEqual(['z']);
    });

    it('the control: setting value from outside checks the radio and emits nothing', async () => {
        const { group, inputs } = await createGroup({ value: 'x' });
        let count = 0;
        group.addEventListener('pdx-change', () => { count++; });
        group.value = 'z';
        await until(() => (inputs[2].checked ? true : null), 'z checked');
        expect(count).toBe(0);
    });
});
