// What a computed depends on, and what is subscribed to a signal.
//
// A computed that does not see a signal change raises one question no screen answers: **what does
// that computed think it depends on, and did the signal's `set` reach it?** Without a way to read
// a computed's dependency set, the only way forward is to change the shape, rebuild, measure the
// screen and guess again.
//
// Two questions, and the difference between them is the diagnosis: «the signal has no subscriber»
// is a computed that never read it; «the subscriber was not told» is a notification that did not
// arrive. Without both, they are indistinguishable.
import { describe, it, expect, beforeEach } from 'vitest';
import { signal, computed, effect, createDataSource, __pdx_debug } from '../src/index';

beforeEach(() => {
    // The registries only fill at level 2, which is what a developer opening the console sets.
    __pdx_debug.setLevel(2);
    __pdx_debug.clear();
});

describe('__pdx_debug.deps', () => {
    it('names what a computed read on its last run', () => {
        const first = signal(1, { name: 'first' });
        const second = signal(2, { name: 'second' });
        const sum = computed(() => first() + second(), { name: 'sum' });
        sum();

        expect(__pdx_debug.deps(sum).sort(), 'the computed cannot say what it read')
            .toEqual(['first', 'second']);
    });

    it('a computed nobody has read yet depends on nothing', () => {
        // The control: it reports what it READ, not what its source contains. A version that
        // parsed the function body would answer the same for both, and be wrong here.
        const a = signal(1, { name: 'a' });
        const untouched = computed(() => a(), { name: 'untouched' });

        expect(__pdx_debug.deps(untouched), 'it guessed instead of reporting').toEqual([]);
    });

    it('and the answer follows a conditional read', () => {
        // A shape that hides a dependency: `gate() !== "" && value()` reads `value` only once
        // the gate opens. Being able to SEE the dependency set change is the whole point.
        const gate = signal('', { name: 'gate' });
        const value = signal(1, { name: 'value' });
        const out = computed(() => (gate() !== '' ? value() : 0), { name: 'out' });
        out();
        expect(__pdx_debug.deps(out)).toEqual(['gate']);

        gate.set('open');
        out();

        expect(__pdx_debug.deps(out).sort(), 'the later read is not in the dependency set')
            .toEqual(['gate', 'value']);
    });

    it('an unnamed source is reported as unnamed rather than dropped', () => {
        const named = signal(1, { name: 'named' });
        const anonymous = signal(2);
        const both = computed(() => named() + anonymous(), { name: 'both' });
        both();

        const deps = __pdx_debug.deps(both);
        expect(deps, 'a source without a name vanished from the answer').toHaveLength(2);
        expect(deps).toContain('named');
    });

    it('something that is not a computed answers with nothing, not a throw', () => {
        expect(__pdx_debug.deps(signal(1, { name: 'plain' }))).toEqual([]);
        expect(__pdx_debug.deps((() => 0) as never)).toEqual([]);
    });
});

describe('__pdx_debug.subscribers', () => {
    it('names the computeds and effects subscribed to a signal', () => {
        const source = signal(1, { name: 'source' });
        const derived = computed(() => source() * 2, { name: 'derived' });
        derived();
        const stop = effect(() => { source(); });

        const names = __pdx_debug.subscribers(source);
        expect(names, 'the signal cannot say who is listening').toContain('derived');
        expect(names.length, 'the effect reading it is not counted').toBeGreaterThan(1);
        stop();
    });

    it('a signal nobody reads has no subscribers', () => {
        const lonely = signal(1, { name: 'lonely' });
        expect(__pdx_debug.subscribers(lonely)).toEqual([]);
    });

    it('and a disposed computed stops being one', () => {
        // The distinction the two calls exist to make: after a dispose the SIGNAL no longer lists
        // it, which is «it never read it». A subscriber that is still listed and still stale is
        // «the notification did not arrive» — a different bug, and now a different reading.
        const source = signal(1, { name: 'src2' });
        const derived = computed(() => source(), { name: 'derived2' }) as unknown as { dispose?: () => void };
        (derived as unknown as () => number)();
        expect(__pdx_debug.subscribers(source)).toContain('derived2');

        derived.dispose?.();

        expect(__pdx_debug.subscribers(source), 'a disposed computed is still listed as listening')
            .not.toContain('derived2');
    });
});

describe('the reading a stale screen needs', () => {
    it('answers both questions about the arrangement that fails on the page', () => {
        // The shape, as a list page has it: a DataSource, one computed assembling the
        // arrangement, a second comparing it, and an effect at the end where a `:show` binding is.
        //
        // Instead of changing the shape and rebuilding, the two calls SAY whether the computed ever
        // read the signal, and whether it is still listed as a subscriber. Here both answers are the
        // right ones and the value is correct — so a page that stays stale on this shape has its
        // fault somewhere else.
        const source = createDataSource({ data: [{ id: 1, name: 'Ada' }], pageSize: 10 });
        const live = computed(() => JSON.stringify(source.sort()), { name: 'liveKey' });
        const gate = signal('', { name: 'savedKey' });
        const modified = computed(() => gate() !== '' && live() !== gate(), { name: 'viewModified' });
        const stop = effect(() => { modified(); });

        // Before the gate opens, the comparison has NOT read the arrangement — and it says so,
        // rather than leaving a reader to infer it from a screen that does not update.
        expect(__pdx_debug.deps(modified)).toEqual(['savedKey']);

        gate.set('x');
        modified();
        expect(__pdx_debug.deps(modified).sort(), 'the dependency it gained is not reported')
            .toEqual(['liveKey', 'savedKey']);
        expect(__pdx_debug.subscribers(live), 'the comparison is not listed on what it reads')
            .toContain('viewModified');

        source.setSort([{ field: 'name', dir: 'asc' }]);

        expect(live(), 'the arrangement did not follow the source').toContain('name');
        expect(modified(), 'and the comparison did not follow the arrangement').toBe(true);
        stop();
    });
});

describe('the instrument costs nothing when it is off', () => {
    it('reports nothing at level 0, and does not throw', () => {
        __pdx_debug.setLevel(0);
        const a = signal(1, { name: 'off-a' });
        const c = computed(() => a(), { name: 'off-c' });
        c();

        expect(__pdx_debug.deps(c)).toEqual([]);
        expect(__pdx_debug.subscribers(a)).toEqual([]);
    });
});

describe('by name, which is what a console has', () => {
    it('answers both readings for a name', () => {
        // On a page the accessor is a `const` inside a component's setup: `deps(liveKey)` is
        // something only the page could write. What a person has in the console is the name the
        // compiler emitted, so both readings take one.
        const src = signal(1, { name: 'page:src' });
        const derived = computed(() => src() * 2, { name: 'page:derived' });
        derived();

        expect(__pdx_debug.deps('page:derived')).toEqual(['page:src']);
        expect(__pdx_debug.subscribers('page:src')).toContain('page:derived');
    });

    it('lists the names it can be asked about', () => {
        signal(1, { name: 'listed:one' });
        computed(() => 2, { name: 'listed:two' })();

        const names = __pdx_debug.names();
        expect(names).toContain('listed:one');
        expect(names).toContain('listed:two');
    });

    it('a name nobody registered answers with nothing', () => {
        expect(__pdx_debug.deps('nothing:here')).toEqual([]);
        expect(__pdx_debug.subscribers('nothing:here')).toEqual([]);
    });
});

describe('dirty — «it was told» against «it was not»', () => {
    it('a computed nobody has read is dirty, and reading it clears the flag', () => {
        const src = signal(1, { name: 'd:src' });
        const c = computed(() => src(), { name: 'd:c' });
        expect(__pdx_debug.dirty('d:c'), 'a computed that has never run is not waiting to run').toBe(true);

        c();

        expect(__pdx_debug.dirty('d:c')).toBe(false);
    });

    it('a source change marks it, and that is what splits a stale value in two', () => {
        // The reading a stale value needs. After a source changes: TRUE means the
        // computed was TOLD and nobody has read it since — the fault is downstream, in whatever
        // should have read it. FALSE means it was never told. From a screen the two look the same.
        const src = signal(1, { name: 'd2:src' });
        const c = computed(() => src() * 2, { name: 'd2:c' });
        c();
        expect(__pdx_debug.dirty('d2:c')).toBe(false);

        src.set(2);

        expect(__pdx_debug.dirty('d2:c'), 'the source changed and the computed was not marked').toBe(true);
    });

    it('anything that is not a computed answers null, not false', () => {
        // null and false are different answers: «this is not a computed» is not «it is up to date».
        expect(__pdx_debug.dirty(signal(1, { name: 'd3:plain' }))).toBeNull();
        expect(__pdx_debug.dirty('d3:nothing')).toBeNull();
    });
});
