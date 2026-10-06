// The mock-backend recipe in the skill, executed.
//
// A recipe that is only read ages into a lie: the API moves, the page does not, and the next agent
// copies something that no longer compiles. So this test EXTRACTS the code block out of
// `recipes.md` and runs it — the skill is the source, the test is the proof.
//
// Why the recipe exists at all: an app's first screens often run against a mock backend, and if
// every screen invents its own mock the results stop being comparable — half of them end up being
// about the mock. One recipe, with no new dependency (not MSW), and the mock is a `transport`, so a
// screen exercises the same API it would use against a real server and swapping it changes no UI
// code.
//
// ⚠️ The recipe names `fakeTransport` — arrayTransport with a simulated network in front: latency,
// jitter, errorRate, onOperation, getData — exported from `@pdxui/core`. An API no recipe names
// does not get used: a reader hand-writes a mock and concludes "the framework needs a mock
// transport" instead of "it has one".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '../src/index';
import type { IDataTransport } from '../src/index';

const RECIPES = join(__dirname, '..', '..', '..', 'marketplace', 'plugins', 'pdxui',
    'skills', 'pdxui', 'references', 'recipes.md');

/**
 * Pull the fenced block tagged `js recipe:mock-backend` out of the skill.
 *
 * The tag is the contract between the page and this test: rename it in the skill and the extraction
 * fails loudly, rather than silently testing nothing.
 */
function recipeSource(): string {
    // CRLF normalised, as the other skill-reading tests do: with core.autocrlf a Windows checkout
    // writes \r\n, the fence regex below needs \n, and every test here failed on a fresh clone.
    const md = readFileSync(RECIPES, 'utf8').replace(/\r\n/g, '\n');
    const m = md.match(/```js recipe:mock-backend\n([\s\S]*?)```/);
    if (!m) throw new Error('no ```js recipe:mock-backend block in recipes.md');
    return m[1];
}

/**
 * Run the recipe with `@pdxui/core` injected.
 *
 * ESM cannot be `new Function`'d, so the import line becomes a destructure of the real module —
 * exactly the substitution `route-loader.test.ts` makes. Everything else is the recipe's own code,
 * unedited: if it references something core does not export, this throws.
 */
function runRecipe(): Record<string, unknown> {
    const src = recipeSource()
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
        .replace(/^export\s+/gm, '');
    const fn = new Function('__core', `${src}\n; return { makeSource, seed, transport };`);
    return fn(core) as Record<string, unknown>;
}

interface Row extends Record<string, unknown> { id: number; name: string; city: string; amount: number }

// The real DataSource surface, read off `packages/core/src/data/data-source.ts:64` rather than
// guessed: the values are SIGNALS (`ds.data()`), the read is `refresh()`, and `remove` takes the
// item, not its id. The recipe returns one of these — it does not wrap it in an API of its own, or
// the scenario would be learning our wrapper instead of the framework.
type Source = import('../src/index').DataSource<Row>;

describe('the mock-backend recipe still runs', () => {
    it('has a block to extract', () => {
        // Without this, a renamed fence would make every test below throw the same way a broken
        // recipe would, and the failure would point at the wrong thing.
        expect(recipeSource().length, 'the recipe block is empty').toBeGreaterThan(200);
        expect(recipeSource(), 'the recipe must use the framework transport, not a hand-rolled one')
            .toContain('fakeTransport');
    });

    it('exports what the recipe promises', () => {
        const r = runRecipe();
        expect(typeof r.makeSource, 'makeSource()').toBe('function');
        expect(Array.isArray(r.seed), 'seed').toBe(true);
    });

    it('seeds deterministically', () => {
        // A random dataset makes a failing acceptance item unreproducible: the agent sees 7 rows,
        // the reviewer sees 4, and neither is wrong.
        const a = runRecipe().seed as Row[];
        const b = runRecipe().seed as Row[];
        expect(a.length).toBeGreaterThan(5);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});

describe('the recipe drives a DataSource the way a LOB screen does', () => {
    function source(opts?: Record<string, unknown>): Source {
        return (runRecipe().makeSource as (o?: Record<string, unknown>) => Source)({ latency: 0, ...opts });
    }

    it('pages', async () => {
        const ds = source({ pageSize: 2 });
        await ds.refresh();
        const first = ds.data().map(r => r.id);
        expect(first, 'a page holds pageSize rows').toHaveLength(2);
        expect(ds.total(), 'total is the whole set, not the page').toBeGreaterThan(2);

        ds.setPage(2);
        await ds.refresh();
        // The measurement that matters: page 2 is not page 1. A transport that ignores paging
        // returns the same rows and every count still looks right.
        expect(ds.data().map(r => r.id)).not.toEqual(first);
    });

    it('sorts', async () => {
        const ds = source({ pageSize: 0 });
        ds.setSort([{ field: 'amount', dir: 'asc' }]);
        await ds.refresh();
        const asc = ds.data().map(r => r.amount);
        expect([...asc].sort((x, y) => x - y), 'ascending by amount').toEqual(asc);

        ds.setSort([{ field: 'amount', dir: 'desc' }]);
        await ds.refresh();
        expect(ds.data().map(r => r.amount), 'and the other way round').toEqual([...asc].reverse());
    });

    it('filters, in the descriptor shape the filter builder emits', async () => {
        const ds = source({ pageSize: 0 });
        await ds.refresh();
        const all = ds.total();

        ds.setFilter([{ field: 'city', operator: 'eq', value: 'Torino' }]);
        await ds.refresh();
        expect(ds.total(), 'the filter narrows the total, not just the page').toBeLessThan(all);
        expect(ds.data().every(r => r.city === 'Torino'), 'and every row matches').toBe(true);

        ds.setFilter([{ field: 'name', operator: 'contains', value: 'a' }]);
        await ds.refresh();
        expect(ds.data().every(r => r.name.toLowerCase().includes('a'))).toBe(true);

        ds.setFilter([]);
        await ds.refresh();
        expect(ds.total(), 'clearing it brings everything back').toBe(all);
    });

    it('creates and removes, and the change survives a re-read', async () => {
        const ds = source({ pageSize: 0 });
        await ds.refresh();
        const before = ds.total();

        ds.add({ id: 999, name: 'Zeno', city: 'Trieste', amount: 42 } as Row);
        await ds.sync();
        await ds.refresh();
        expect(ds.total(), 'the created row is there after a fresh read').toBe(before + 1);
        const added = ds.data().find(r => r.name === 'Zeno');
        expect(added, 'and it is the row we asked for').toBeTruthy();

        ds.remove(added!);
        await ds.sync();
        await ds.refresh();
        expect(ds.total()).toBe(before);
    });

    it('fails on demand, which is the half nobody mocks', async () => {
        // The error branch of a grid or a form is the least exercised code in any app, and a mock
        // that always succeeds guarantees it stays that way.
        const ds = source({ pageSize: 0, errorRate: 1 });
        await ds.refresh().catch(() => undefined);
        expect(ds.error(), 'the source reports the failure').toBeTruthy();
    });

    it('can be slow on purpose, which is what makes a loading state visible', async () => {
        // Asserted through `isLoading` rather than a stopwatch: `suite-hygiene.test.ts` keeps
        // wall-clock measurements out of the default run, and rightly — six packages run in parallel
        // and a timing assertion reads the machine's load. It is also the better question: what the
        // recipe has to give a scenario is not "120ms elapsed", it is a window during which a spinner
        // has something to show.
        const ds = source({ pageSize: 0, latency: 120, jitter: 0 });
        const pending = ds.refresh();
        expect(ds.isLoading(), 'the source reports it is loading while the call is in flight').toBe(true);
        await pending;
        expect(ds.isLoading(), 'and stops when it lands').toBe(false);
        expect(ds.data().length, 'the rows arrived').toBeGreaterThan(0);
    });
});

// The second recipe: a hand-written transport with a failure switch.
//
// `errorRate` is random and fixed at creation — it fails one call in ten, never "now". A service
// that breaks on command and recovers on screen otherwise means reading transport.d.ts,
// fake-transport.d.ts and data-source.d.ts to write one. This runs the recipe's own
// code through a real DataSource, so the page shows a transport that works, not one that parses.
function switchableRecipe(): string {
    const md = readFileSync(RECIPES, 'utf8').replace(/\r\n/g, '\n');
    const m = md.match(/```js recipe:switchable-transport\n([\s\S]*?)```/);
    if (!m) throw new Error('no ```js recipe:switchable-transport block in recipes.md');
    return m[1];
}

interface Switchable {
    service: { failing: boolean };
    switchableTransport: (rows: Row[]) => IDataTransport<Row>;
    makeRecords: (rows: Row[]) => Source;
}

function runSwitchable(): Switchable {
    const src = switchableRecipe()
        .replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;')
        .replace(/^export\s+/gm, '');
    return new Function('__core', `${src}\n; return { service, switchableTransport, makeRecords };`)(core) as Switchable;
}

const PETS: Row[] = [
    { id: 1, name: 'Fido', city: 'Torino', amount: 3 },
    { id: 2, name: 'Birba', city: 'Milano', amount: 1 },
    { id: 3, name: 'Argo', city: 'Torino', amount: 2 },
];

describe('the switchable-transport recipe breaks and recovers on command', () => {
    it('is a transport written by hand — a read, not fakeTransport', () => {
        expect(switchableRecipe()).toContain('async read(');
        expect(switchableRecipe()).not.toContain('fakeTransport(');
    });

    it('control — with the switch off, a DataSource reads the rows through it', async () => {
        const r = runSwitchable();
        const ds = r.makeRecords(PETS.map(p => ({ ...p })));
        await ds.refresh();
        expect(ds.error()).toBeNull();
        expect(ds.data().map(p => p.name)).toEqual(['Fido', 'Birba', 'Argo']);
        expect(ds.total()).toBe(3);
    });

    it('with the switch on, the next refresh puts the failure in error(); off again, the rows come back', async () => {
        const r = runSwitchable();
        const ds = r.makeRecords(PETS.map(p => ({ ...p })));
        await ds.refresh();

        r.service.failing = true;
        await ds.refresh();   // resolves: the DataSource catches the transport's throw
        expect(ds.error()?.message, 'the switch did not make the service fail').toBe('The records service is not answering');

        r.service.failing = false;
        await ds.refresh();
        expect(ds.error(), 'the service did not recover').toBeNull();
        expect(ds.total()).toBe(3);
    });

    it('keeps sorting and filtering, which it takes from arrayTransport', async () => {
        const ds = runSwitchable().makeRecords(PETS.map(p => ({ ...p })));
        ds.setFilter([{ field: 'city', operator: 'eq', value: 'Torino' }]);
        ds.setSort([{ field: 'amount', dir: 'asc' }]);
        await ds.refresh();
        expect(ds.data().map(p => p.name)).toEqual(['Argo', 'Fido']);
    });
});
