// The form's two writes follow the policy the specification gives them (#279; beta spec, data.md,
// «@form», F2 and F7).
//
//   - F2: a second submit while one runs is dropped — and waits for the running one, so whoever
//     awaits it (a test, a «saved» toast) runs after the save, not before it;
//   - F7: an autosave keeps one save per field in flight and at most one waiting; when the save in
//     flight settles, the waiting one starts with the newest value. Two writes of one field never run
//     together, so the older can no longer land last.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createForm } from '../src/index';

const flush = () => new Promise((r) => setTimeout(r, 0));
const submitEvent = () => new Event('submit', { cancelable: true });

/** A promise the test settles by hand. */
function held() {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

afterEach(() => vi.useRealTimers());

describe('F2 — a second submit waits for the first', () => {
    it('runs the submit once, and the second call resolves only when the first does', async () => {
        const form = createForm({ initialValues: { name: 'ann' } });
        const save = held();
        const fn = vi.fn(() => save.promise);
        const onSubmit = form.handleSubmit(fn);

        const first = onSubmit(submitEvent());
        await flush();
        const secondEvent = submitEvent();
        const second = onSubmit(secondEvent);
        expect(secondEvent.defaultPrevented, 'the dropped submit let the browser submit').toBe(true);

        let secondDone = false;
        void second.then(() => { secondDone = true; });
        await flush();
        expect(fn, 'the second press submitted again').toHaveBeenCalledTimes(1);
        expect(secondDone, 'the dropped submit resolved before the save had happened').toBe(false);

        save.resolve();
        await Promise.all([first, second]);
        expect(secondDone).toBe(true);
        expect(form.state()).toBe('success');
    });

    it('control — a submit after the first has settled runs again', async () => {
        const form = createForm({ initialValues: { name: 'ann' } });
        const fn = vi.fn(() => Promise.resolve());
        const onSubmit = form.handleSubmit(fn);
        await onSubmit(submitEvent());
        await onSubmit(submitEvent());
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

describe('F7 — an autosave keeps one save per field in flight, and sends the newest value next', () => {
    const DEBOUNCE = 500;

    it('no second save of a field starts while one runs; the next starts with the latest value', async () => {
        vi.useFakeTimers();
        const form = createForm({ initialValues: { name: 'a' }, saveMode: 'onChange', saveDebounce: DEBOUNCE });
        const saves: { value: unknown; done: ReturnType<typeof held> }[] = [];
        form.onFieldSave((_field, value) => {
            const done = held();
            saves.push({ value, done });
            return done.promise;
        });

        form.fields.name.onChange('A');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        expect(saves.map((s) => s.value), 'the first save did not start').toEqual(['A']);

        form.fields.name.onChange('B');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        form.fields.name.onChange('C');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        expect(saves.length, 'a second save of the field started while the first ran').toBe(1);

        saves[0].done.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(saves.map((s) => s.value), 'the waiting save did not start with the newest value, or started twice').toEqual(['A', 'C']);

        saves[1].done.resolve();
        await vi.advanceTimersByTimeAsync(DEBOUNCE * 3);
        expect(saves.length, 'a save started with nothing waiting').toBe(2);
        form.dispose();
    });

    it('a failed save lets the waiting one start too', async () => {
        vi.useFakeTimers();
        const form = createForm({ initialValues: { name: 'a' }, saveMode: 'onChange', saveDebounce: DEBOUNCE });
        const saves: { value: unknown; done: ReturnType<typeof held> }[] = [];
        form.onFieldSave((_field, value) => {
            const done = held();
            saves.push({ value, done });
            return done.promise.catch(() => { /* the save's failure is the callback's to report */ });
        });
        form.fields.name.onChange('A');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        form.fields.name.onChange('B');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        saves[0].done.reject(new Error('down'));
        await vi.advanceTimersByTimeAsync(0);
        expect(saves.map((s) => s.value)).toEqual(['A', 'B']);
        form.dispose();
    });

    it('two fields save independently: one in flight does not hold the other', async () => {
        vi.useFakeTimers();
        const form = createForm({ initialValues: { name: 'a', city: 'x' }, saveMode: 'onChange', saveDebounce: DEBOUNCE });
        const started: string[] = [];
        form.onFieldSave((field) => { started.push(field); return new Promise(() => {}); });
        form.fields.name.onChange('A');
        form.fields.city.onChange('Y');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        expect(started.sort()).toEqual(['city', 'name']);
        form.dispose();
    });

    it('a callback returning nothing saves on every debounce, as before', async () => {
        vi.useFakeTimers();
        const form = createForm({ initialValues: { name: 'a' }, saveMode: 'onChange', saveDebounce: DEBOUNCE });
        const values: unknown[] = [];
        form.onFieldSave((_field, value) => { values.push(value); });
        form.fields.name.onChange('A');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        form.fields.name.onChange('B');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        expect(values).toEqual(['A', 'B']);
        form.dispose();
    });

    it('dispose() drops a waiting save', async () => {
        vi.useFakeTimers();
        const form = createForm({ initialValues: { name: 'a' }, saveMode: 'onChange', saveDebounce: DEBOUNCE });
        const saves: ReturnType<typeof held>[] = [];
        form.onFieldSave(() => { const done = held(); saves.push(done); return done.promise; });
        form.fields.name.onChange('A');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        form.fields.name.onChange('B');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        form.dispose();
        saves[0].resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(saves.length, 'a waiting save started after dispose()').toBe(1);
    });
});
