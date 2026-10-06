// Choice groups: a listener ON the group hears only the group, and every group can be named.
//
// stopPropagation on the child's pdx-change does not stop the other listeners on the element the
// event is at — and the author's @pdx-change on the group is one of them: two events per click, the
// second without `values`. stopImmediatePropagation stops only the listeners added AFTER the group's
// own: a listener added before the group connects — create, listen, append — hears both. (A compiled
// template binds @pdx-change after setup, so there stopImmediatePropagation holds.)
// Both groups, and pdx-segmented, can be named: by `label`, or by a pdx-label before them, and
// pdx-segmented does not write aria-label="".
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/checkbox/pdx-checkbox';
import '../../src/checkbox-group/pdx-checkbox-group';
import '../../src/radio/pdx-radio';
import '../../src/radio-group/pdx-radio-group';
import '../../src/segmented/pdx-segmented';
import '../../src/label/pdx-label';

const CHECKBOXES = '<pdx-checkbox value="a" label="A"></pdx-checkbox><pdx-checkbox value="b" label="B"></pdx-checkbox>';
const RADIOS = '<pdx-radio value="a" label="A"></pdx-radio><pdx-radio value="b" label="B"></pdx-radio>';

/**
 * A group with a pdx-change listener on it. `early`: the listener is added before the group is in
 * the document (create, listen, append); otherwise after it has mounted.
 */
async function groupWithListener(tag: string, children: string, early: boolean) {
    const group = document.createElement(tag);
    group.innerHTML = children;
    const seen: Array<Record<string, unknown>> = [];
    const listen = () => group.addEventListener('pdx-change', (e) => seen.push((e as CustomEvent).detail));
    if (early) listen();
    document.body.appendChild(group);
    await tick(30);
    if (!early) listen();
    const inputs = [...group.querySelectorAll('input')] as HTMLInputElement[];
    return { group, seen, inputs };
}

beforeEach(cleanup);

describe('a listener on the group hears only the group', () => {
    for (const early of [false, true]) {
        const when = early ? 'added before the group connects' : 'added after mount';
        it(`pdx-checkbox-group: one pdx-change per click, with values (listener ${when})`, async () => {
            const { seen, inputs } = await groupWithListener('pdx-checkbox-group', CHECKBOXES, early);
            inputs[1].click();
            await tick();
            expect(seen, JSON.stringify(seen)).toHaveLength(1);
            expect(seen[0].values).toEqual(['b']);
        });

        it(`pdx-radio-group: one pdx-change per click, the group's (listener ${when})`, async () => {
            const { seen, inputs } = await groupWithListener('pdx-radio-group', RADIOS, early);
            inputs[1].click();
            await tick();
            expect(seen, JSON.stringify(seen)).toHaveLength(1);
            expect(seen[0]).toEqual({ value: 'b' });
        });
    }

    it('a listener on the child itself still hears the child', async () => {
        const { group, inputs } = await groupWithListener('pdx-checkbox-group', CHECKBOXES, false);
        const onChild: unknown[] = [];
        group.querySelectorAll('pdx-checkbox')[1].addEventListener('pdx-change', (e) => onChild.push((e as CustomEvent).detail));
        inputs[1].click();
        await tick();
        expect(onChild).toEqual([{ checked: true, value: 'b' }]);
    });
});

describe('a choice group can be named', () => {
    async function mount(html: string): Promise<void> {
        document.body.innerHTML = html;
        await tick(30);
    }
    /** The element carrying the group role: the host, or pdx-segmented's inner radiogroup. */
    const groupOf = (sel: string) => {
        const host = document.querySelector(sel)!;
        return host.matches('[role]') ? host : host.querySelector('[role="radiogroup"]')!;
    };
    const nameOf = (el: Element): string | null => el.getAttribute('aria-label')
        ?? (el.getAttribute('aria-labelledby') ? document.getElementById(el.getAttribute('aria-labelledby')!)?.textContent?.trim() ?? '(dangling)' : null);

    it('label="Interests" names each group', async () => {
        await mount(`
            <pdx-checkbox-group label="Interests">${CHECKBOXES}</pdx-checkbox-group>
            <pdx-radio-group label="Plan">${RADIOS}</pdx-radio-group>
            <pdx-segmented label="View" options='["day","week"]'></pdx-segmented>`);
        expect(nameOf(groupOf('pdx-checkbox-group'))).toBe('Interests');
        expect(nameOf(groupOf('pdx-radio-group'))).toBe('Plan');
        expect(nameOf(groupOf('pdx-segmented'))).toBe('View');
    });

    it('a pdx-label right before the group names it through aria-labelledby', async () => {
        await mount(`
            <div><pdx-label text="Interests" description="Pick any"></pdx-label><pdx-checkbox-group>${CHECKBOXES}</pdx-checkbox-group></div>
            <div><pdx-label text="Plan"></pdx-label><pdx-radio-group>${RADIOS}</pdx-radio-group></div>
            <div><pdx-label text="View"></pdx-label><pdx-segmented options='["day","week"]'></pdx-segmented></div>`);
        for (const [sel, name] of [['pdx-checkbox-group', 'Interests'], ['pdx-radio-group', 'Plan'], ['pdx-segmented', 'View']]) {
            const g = groupOf(sel);
            expect(g.getAttribute('aria-labelledby'), `${sel} is not labelled by its pdx-label`).toBeTruthy();
            expect(nameOf(g), `${sel}: the name is the label's text, not its description`).toBe(name);
        }
    });

    it('with no label and no pdx-label: no aria-label at all, never an empty one', async () => {
        await mount(`<pdx-checkbox-group>${CHECKBOXES}</pdx-checkbox-group><pdx-radio-group>${RADIOS}</pdx-radio-group>
            <pdx-segmented options='["day","week"]'></pdx-segmented>`);
        for (const sel of ['pdx-checkbox-group', 'pdx-radio-group', 'pdx-segmented']) {
            expect(groupOf(sel).hasAttribute('aria-label'), `${sel} has aria-label="${groupOf(sel).getAttribute('aria-label')}"`).toBe(false);
        }
    });

    it('an aria-label the author wrote on the group is kept', async () => {
        await mount(`<pdx-label text="Ignored"></pdx-label><pdx-checkbox-group aria-label="Mine">${CHECKBOXES}</pdx-checkbox-group>`);
        expect(groupOf('pdx-checkbox-group').getAttribute('aria-label')).toBe('Mine');
        expect(groupOf('pdx-checkbox-group').hasAttribute('aria-labelledby')).toBe(false);
    });
});
