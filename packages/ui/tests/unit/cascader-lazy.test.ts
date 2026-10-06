// A branch pdx-cascader is fetching says so, in words, where its children will appear.
//
// While `loadChildren` is pending, the node's arrow turning from «›» to «⋯» is not enough: the
// registered `cascader.loading` string is rendered, with aria-busy, so an application need not wrap
// the loader to draw its own role="status" line. The tree-select does the same
// (tree-select-lazy.test.ts); these assertions keep the two lazy pickers alike.
import { describe, it, expect, beforeEach } from 'vitest';
import { setComponentStrings, clearComponentStrings } from '@pdxui/core';
import { cleanup, mount, tick } from './helpers';
import '../../src/cascader/pdx-cascader';

const LAZY = [
    { value: 'mammals', label: 'Mammals', isLeaf: false },
    { value: 'birds', label: 'Birds', isLeaf: false },
];

type Loader = (n: { value: string }) => Promise<{ value: string; label: string }[]>;

async function mountLazy(loadChildren: Loader) {
    const el = await mount('pdx-cascader') as any;
    el.options = structuredClone(LAZY);
    el.loadChildren = loadChildren;
    await tick(50);
    el.openCascader();
    await tick(50);
    return el as HTMLElement;
}

const itemOf = (el: HTMLElement, label: string): HTMLElement =>
    [...el.querySelectorAll<HTMLElement>('.pdx-cascader-item')]
        .find(i => i.querySelector('.pdx-cascader-item-label')?.textContent === label)!;

const status = (el: HTMLElement): HTMLElement | null => el.querySelector('.pdx-cascader-panel [role="status"]');
// aria-busy sits on the option whose branch is loading, as the tree-select sets it on its row — not
// on an ancestor of the status row: a busy region may hold back its own announcements until it is
// no longer busy, which here is when the row is gone.
const busyItems = (el: HTMLElement): Element[] => [...el.querySelectorAll('.pdx-cascader-panel [aria-busy="true"]')];
const columnLabels = (el: HTMLElement): string[][] =>
    [...el.querySelectorAll('.pdx-cascader-column')].map(c =>
        [...c.querySelectorAll('.pdx-cascader-item-label')].map(l => l.textContent ?? ''));

function pending(): { loader: Loader; resolve: (v: { value: string; label: string }[]) => void; reject: (e: unknown) => void } {
    let resolve: (v: { value: string; label: string }[]) => void = () => {};
    let reject: (e: unknown) => void = () => {};
    const loader: Loader = () => new Promise((res, rej) => { resolve = res; reject = rej; });
    return { loader, resolve: v => resolve(v), reject: e => reject(e) };
}

beforeEach(() => { cleanup(); clearComponentStrings(); });

describe('pdx-cascader, a branch fetched by loadChildren', () => {
    it('control — before anything is opened there is no loading row', async () => {
        const el = await mountLazy(pending().loader);
        expect(status(el)).toBeNull();
        expect(busyItems(el)).toHaveLength(0);
    });

    it('while it is pending, the next column says Loading inside role="status", and the option is aria-busy', async () => {
        const p = pending();
        const el = await mountLazy(p.loader);
        itemOf(el, 'Mammals').click();
        await tick(30);

        const s = status(el);
        expect(s, 'nothing on screen said the branch was loading').not.toBeNull();
        expect(s!.textContent).toContain('Loading...');
        expect(s!.closest('.pdx-cascader-column'), 'the row is not in a column of its own').not.toBeNull();
        expect(s!.closest('.pdx-cascader-column')!.contains(itemOf(el, 'Mammals')), 'the row is not in the next column').toBe(false);
        expect(s!.querySelector('.pdx-cascader-spinner'), 'the row has no spinner').not.toBeNull();
        expect(busyItems(el), 'the option being fetched is not aria-busy').toEqual([itemOf(el, 'Mammals')]);
        expect(s!.closest('[aria-busy="true"]'), 'the status row sits inside a busy region').toBeNull();

        p.resolve([{ value: 'cat', label: 'Cat' }, { value: 'dog', label: 'Dog' }]);
        await tick(50);
        expect(status(el), 'the loading row outlived the load').toBeNull();
        expect(busyItems(el)).toHaveLength(0);
        expect(columnLabels(el)[1]).toEqual(['Cat', 'Dog']);
    });

    it('the text follows an override of cascader.loading', async () => {
        setComponentStrings('cascader', { loading: 'Caricamento…' });
        const p = pending();
        const el = await mountLazy(p.loader);
        itemOf(el, 'Mammals').click();
        await tick(30);
        expect(status(el)?.textContent).toContain('Caricamento…');
    });

    it('a failed load removes the row, says so with pdx-load-error, and the branch can be asked again', async () => {
        let asked = 0;
        const errors: unknown[] = [];
        const el = await mountLazy(async () => {
            asked++;
            if (asked === 1) throw new Error('offline');
            return [{ value: 'cat', label: 'Cat' }];
        });
        el.addEventListener('pdx-load-error', (e) => errors.push((e as CustomEvent).detail));
        itemOf(el, 'Mammals').click();
        await tick(50);
        expect(status(el)).toBeNull();
        expect(busyItems(el)).toHaveLength(0);
        expect(errors, 'the failure was not announced').toHaveLength(1);

        itemOf(el, 'Mammals').click();
        await tick(50);
        expect(asked, 'the failure was cached as an answer').toBe(2);
        expect(columnLabels(el)[1]).toEqual(['Cat']);
    });
});

// A load that settles after the user moved on does not take them back. The click on the lazy option
// captures its path; if the settled load set the active path to it whatever it was by then, the
// column the user is reading would be replaced by the old branch's.
describe('pdx-cascader, a lazy branch that settles after the user moved on', () => {
    const WITH_PLAIN = [
        ...LAZY,
        { value: 'reptiles', label: 'Reptiles', children: [{ value: 'snake', label: 'Snake' }] },
    ];
    const active = (el: HTMLElement): string[] =>
        [...el.querySelectorAll('.pdx-cascader-item.active .pdx-cascader-item-label')].map(l => l.textContent ?? '');

    async function mountWith(loadChildren: Loader) {
        const el = await mount('pdx-cascader') as any;
        el.options = structuredClone(WITH_PLAIN);
        el.loadChildren = loadChildren;
        await tick(50);
        el.openCascader();
        await tick(50);
        return el as HTMLElement;
    }

    it('Mammals pending, then Reptiles, then Mammals resolves: Reptiles stays active, its children listed', async () => {
        const p = pending();
        const el = await mountWith(p.loader);
        itemOf(el, 'Mammals').click();
        await tick(30);
        itemOf(el, 'Reptiles').click();
        await tick(30);
        expect(columnLabels(el)[1], 'the second click did not open Reptiles').toEqual(['Snake']);

        p.resolve([{ value: 'cat', label: 'Cat' }]);
        await tick(50);
        expect(active(el)).toEqual(['Reptiles']);
        expect(columnLabels(el)[1]).toEqual(['Snake']);
    });

    it('the loaded children are kept: coming back to Mammals lists them without asking again', async () => {
        let asked = 0;
        const p = pending();
        const el = await mountWith((n) => { asked++; return p.loader(n); });
        itemOf(el, 'Mammals').click();
        await tick(30);
        itemOf(el, 'Reptiles').click();
        await tick(30);
        p.resolve([{ value: 'cat', label: 'Cat' }]);
        await tick(50);

        itemOf(el, 'Mammals').click();
        await tick(50);
        expect(asked).toBe(1);
        expect(columnLabels(el)[1]).toEqual(['Cat']);
    });
});
