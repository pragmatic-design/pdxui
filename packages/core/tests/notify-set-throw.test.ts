// A subscriber that throws while a write is being scheduled must not leave the batch depth raised
// (#102). notifySet, outside batch(), raised the depth, scheduled the subscribers and lowered it
// with no try/finally: a throw in between left it at 1, and from then on every write queued its
// effects and none ever ran again.
//
// A `computed({ equals })` is the subscriber that runs synchronously there: its mark recomputes to
// compare, so a computation that throws throws inside the scheduling phase.

import { describe, it, expect } from 'vitest';
import { signal, computed, effect, batch, pushErrorHandler, popErrorHandler } from '../src/reactivity/signal';

describe('a subscriber throwing during notifySet', () => {
    it('surfaces the error, and later writes still run their effects', () => {
        const source = signal(1);
        const guarded = computed(() => {
            if (source() === 2) throw new Error('boom');
            return source();
        }, { equals: (a, b) => a === b });
        expect(guarded()).toBe(1); // initialised: from now on its mark recomputes eagerly

        const other = signal(0);
        let seen = -1;
        effect(() => { seen = other(); });
        expect(seen).toBe(0);

        expect(() => source.set(2)).toThrow('boom');

        other.set(5);
        expect(seen, 'the effect did not run: the batch depth stayed raised').toBe(5);
    });

    it('a throwing write inside batch() leaves later writes working too', () => {
        const source = signal(1);
        const guarded = computed(() => {
            if (source() === 2) throw new Error('boom');
            return source();
        }, { equals: (a, b) => a === b });
        guarded();

        const other = signal(0);
        let seen = -1;
        effect(() => { seen = other(); });

        expect(() => batch(() => source.set(2))).toThrow('boom');

        other.set(7);
        expect(seen).toBe(7);
    });

    it('an error handler that throws during a flush leaves later writes working', () => {
        // flush() catches an effect's error and routes it to a handler; the handler is user code.
        const trigger = signal(0);
        pushErrorHandler(() => { throw new Error('handler'); });
        effect(() => { if (trigger() === 1) throw new Error('effect'); });
        popErrorHandler();

        const other = signal(0);
        let seen = -1;
        effect(() => { seen = other(); });

        expect(() => trigger.set(1)).toThrow('handler');

        other.set(9);
        expect(seen, 'the effect did not run: the flush left the batch depth raised').toBe(9);
    });
});
