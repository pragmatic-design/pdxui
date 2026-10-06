// `loadChildren` fetches a branch the first time it is opened.
//
// The prop is declared as `(node) => Promise<TreeSelectNode[]>` and documented as "lazy children".
// A node with no `children` array that rendered with the `leaf` class and no click handler on its
// toggle would make the whole point of the prop — a tree too big to send at once — unreachable:
// there would be no way to ask for a branch.
//
// The node contract is `isLeaf`, already on `TreeSelectNode`: a node that says it is a leaf is never
// asked, a node that does not say so is asked once.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/tree-select/pdx-tree-select';

/** Two roots with no children: one that admits it is a leaf, one that does not. */
const LAZY_TREE = [
    { value: 'fruits', label: 'Fruits' },
    { value: 'grain', label: 'Grain', isLeaf: true },
];

async function mountLazy(loadChildren?: (n: any) => Promise<any[]>) {
    const el = await mount('pdx-tree-select') as any;
    el.options = LAZY_TREE;
    if (loadChildren) el.loadChildren = loadChildren;
    await tick(50);
    // The rows exist only once the panel is open — that is where the tree is rendered.
    el.openTreeSelect();
    await tick(50);
    return el;
}

const rows = (el: HTMLElement): string[] =>
    [...el.querySelectorAll('.pdx-tree-node-label')].map(n => n.textContent ?? '');

const toggleOf = (el: HTMLElement, label: string): HTMLElement => {
    const row = [...el.querySelectorAll('.pdx-tree-node')]
        .find(r => r.querySelector('.pdx-tree-node-label')?.textContent === label)!;
    return row.querySelector('.pdx-tree-toggle') as HTMLElement;
};

beforeEach(cleanup);

describe('pdx-tree-select loadChildren', () => {
    it('leaves a childless node a leaf when no loader was given', async () => {
        // The control: without it, "shows a toggle" could be satisfied by showing one on everything.
        const el = await mountLazy();
        expect(toggleOf(el, 'Fruits').classList.contains('leaf')).toBe(true);
    });

    it('offers a toggle on a node that has not said it is a leaf', async () => {
        const el = await mountLazy(async () => []);
        expect(toggleOf(el, 'Fruits').classList.contains('leaf')).toBe(false);
    });

    it('respects isLeaf, and never asks for a branch that cannot exist', async () => {
        let asked = 0;
        const el = await mountLazy(async () => { asked++; return []; });
        expect(toggleOf(el, 'Grain').classList.contains('leaf')).toBe(true);
        toggleOf(el, 'Grain').click();
        await tick(50);
        expect(asked, 'a declared leaf was still fetched').toBe(0);
    });

    it('asks the loader for the node that was opened', async () => {
        const seen: string[] = [];
        const el = await mountLazy(async (n) => { seen.push(n.value); return []; });
        toggleOf(el, 'Fruits').click();
        await tick(50);
        expect(seen).toEqual(['fruits']);
    });

    it('shows what the loader returned', async () => {
        const el = await mountLazy(async () => [
            { value: 'apple', label: 'Apple' },
            { value: 'banana', label: 'Banana' },
        ]);
        toggleOf(el, 'Fruits').click();
        await tick(50);
        expect(rows(el)).toEqual(['Fruits', 'Apple', 'Banana', 'Grain']);
    });

    it('asks once, however often the branch is opened and closed', async () => {
        // A loader called on every expand turns a tree into a request storm, and it is the failure
        // the caching is for — not an optimisation.
        let asked = 0;
        const el = await mountLazy(async () => { asked++; return [{ value: 'apple', label: 'Apple' }]; });
        toggleOf(el, 'Fruits').click();
        await tick(50);
        toggleOf(el, 'Fruits').click();
        await tick(50);
        toggleOf(el, 'Fruits').click();
        await tick(50);
        expect(asked).toBe(1);
        expect(rows(el)).toContain('Apple');
    });

    // The ACCESSIBLE state only: this test measures an attribute, not what is rendered, so it is not
    // proof that the row shows it is loading. What a sighted user sees — the spinner on the toggle —
    // is measured in Chromium: tree-select-loading-branch.spec.ts.
    it('sets aria-busy on the row while the branch is in flight', async () => {
        let resolve: (v: any[]) => void = () => {};
        const el = await mountLazy(() => new Promise<any[]>(r => { resolve = r; }));
        toggleOf(el, 'Fruits').click();
        await tick(30);
        const busy = el.querySelector('.pdx-tree-node[aria-busy="true"]');
        expect(busy, 'nothing told the user the branch was loading').not.toBeNull();
        resolve([{ value: 'apple', label: 'Apple' }]);
        await tick(50);
        expect(el.querySelector('.pdx-tree-node[aria-busy="true"]')).toBeNull();
    });

    it('lets a failed branch be retried instead of pretending it is empty', async () => {
        let asked = 0;
        const el = await mountLazy(async () => {
            asked++;
            if (asked === 1) throw new Error('offline');
            return [{ value: 'apple', label: 'Apple' }];
        });
        toggleOf(el, 'Fruits').click();
        await tick(50);
        expect(rows(el)).toEqual(['Fruits', 'Grain']);
        toggleOf(el, 'Fruits').click();
        await tick(50);
        expect(asked, 'the failure was cached as an answer').toBe(2);
        expect(rows(el)).toContain('Apple');
    });
});
