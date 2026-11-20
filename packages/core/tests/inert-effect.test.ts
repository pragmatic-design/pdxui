// An effect whose first run read no signal and returned no cleanup can never run again (#1237): nothing
// it depends on can change. It is not registered with its scope, so a scope that holds only such
// effects holds nothing — the row of a list whose bindings read a plain item keeps no scope.

import { describe, it, expect } from 'vitest';
import { signal, effect, collectIfAny, collectDisposers } from '../src/reactivity/signal';

describe('an inert effect', () => {
    it('ran once and registered nothing in its scope', () => {
        let runs = 0;
        const item = { label: 'a' };
        const [, dispose] = collectIfAny(() => effect(() => { void item.label; runs++; }));
        expect(runs).toBe(1);
        expect(dispose, 'an effect that reads no signal kept its scope').toBeUndefined();
    });

    it('one that read a signal is registered, and its scope disposes it', () => {
        const s = signal(0);
        let runs = 0;
        const [, dispose] = collectIfAny(() => effect(() => { s(); runs++; }));
        expect(dispose).toBeTypeOf('function');
        s.set(1);
        expect(runs).toBe(2);
        dispose!();
        s.set(2);
        expect(runs, 'disposed, it still ran').toBe(2);
    });

    it('one that returned a cleanup is registered: the cleanup runs when the scope goes', () => {
        let cleaned = 0;
        const [, dispose] = collectDisposers(() => effect(() => () => { cleaned++; }));
        dispose();
        expect(cleaned).toBe(1);
    });

    it('one whose first run read nothing but a later run would read a signal cannot exist: it never runs again', () => {
        // The control for the rule above: with no source, nothing schedules a second run.
        const s = signal(false);
        let runs = 0;
        const read = { now: false };
        collectDisposers(() => effect(() => { runs++; if (read.now) s(); }));
        read.now = true;
        s.set(true);
        expect(runs).toBe(1);
    });
});
