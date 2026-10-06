// pdx-checkbox-group must track what the user clicks. It emits pdx-change on the same host it
// listens on, so its handler must not take its OWN event for a child's: it would toggle the joined
// string ("a,b") as a value and emit again — 41 events for one click with `:value` bound. The
// group's value reflects the children, and the group does not write `el.className = …`, which
// would wipe every class the author put on the element.

import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/checkbox/pdx-checkbox';
import '../../src/checkbox-group/pdx-checkbox-group';

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
    const wrap = document.createElement('div');
    const group = document.createElement('pdx-checkbox-group') as Group;
    for (const [k, v] of Object.entries(attrs)) group.setAttribute(k, v);
    group.innerHTML = `
        <pdx-checkbox value="a">A</pdx-checkbox>
        <pdx-checkbox value="b">B</pdx-checkbox>
        <pdx-checkbox value="c">C</pdx-checkbox>`;
    wrap.appendChild(group);
    document.body.appendChild(wrap);
    const inputs = await until(() => {
        const found = [...group.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
        return found.length === 3 ? found : null;
    }, 'three checkbox inputs');
    await until(() => (group.getAttribute('role') === 'group' ? group : null), 'the group wiring');
    return { group, inputs };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('pdx-checkbox-group follows its children', () => {
    it('clicking a and c gives value "a,c", with one event per click reaching the parent', async () => {
        const { group, inputs } = await createGroup();
        const seen: Array<{ value: string; values: string[] }> = [];
        group.parentElement!.addEventListener('pdx-change', (e) => {
            if (e.target === group) seen.push((e as CustomEvent).detail);
        });
        inputs[0].click();
        inputs[2].click();
        expect(group.value).toBe('a,c');
        expect(seen.length).toBe(2);
        expect(seen.at(-1)?.values).toEqual(['a', 'c']);
    });

    it('a parent that binds the value back does not start a loop', async () => {
        const { group, inputs } = await createGroup();
        let count = 0;
        group.addEventListener('pdx-change', (e) => {
            if (e.target !== group) return;
            count++;
            if (count > 50) return; // circuit breaker: the defect looped
            group.value = (e as CustomEvent).detail.value; // what `:value` + `@pdx-change` does
        });
        inputs[1].click();
        await new Promise(r => requestAnimationFrame(r));
        expect(count).toBe(1);
        expect(group.value).toBe('b');
    });

    it('unchecking removes the value', async () => {
        const { group, inputs } = await createGroup();
        inputs[0].click();
        inputs[1].click();
        inputs[0].click();
        expect(group.value).toBe('b');
    });

    it('keeps the classes the author put on the host', async () => {
        const { group } = await createGroup({ class: 'er-signs', orientation: 'horizontal' });
        expect(group.classList.contains('er-signs')).toBe(true);
        expect(group.classList.contains('pdx-choice-group')).toBe(true);
        group.setAttribute('orientation', 'vertical');
        await new Promise(r => requestAnimationFrame(r));
        expect(group.classList.contains('er-signs')).toBe(true);
        expect(group.classList.contains('horizontal')).toBe(false);
    });

    it('the control: setting value from outside checks the children and emits nothing', async () => {
        const { group, inputs } = await createGroup();
        let count = 0;
        group.addEventListener('pdx-change', (e) => { if (e.target === group) count++; });
        group.value = 'b';
        await until(() => (inputs[1].closest('pdx-checkbox')!.hasAttribute('checked') ? true : null), 'b checked');
        expect(count).toBe(0);
    });
});
