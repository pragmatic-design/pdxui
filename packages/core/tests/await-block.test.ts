// awaitBlock() — what `@await (x as name) { … } @loading { … } @error (e, retry) { … }` compiles to (#145).
//
// The beta spec (docs/language/beta/template.md → «`@await` — on a resource, with `as`»; data.md, E4
// and E5): `@await` understands a source that speaks the async vocabulary — `state()`, `data()`,
// `error()`, `refetch()` — as well as a promise, binds the result in the body, and decides by the
// state, never by the value's truthiness. `{ minMs, maxMs }`: `minMs` is a delay before `@loading`,
// `maxMs` a timeout to `@error` with an AwaitTimeoutError; the timers restart when the source
// changes and stop when the block goes. The compiled half is packages/compiler/tests/await-as.test.ts.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { signal, collectDisposers } from '../src/reactivity/signal';
import { awaitBlock, awaitReady, AwaitTimeoutError } from '../src/renderer/await';
import { AwaitTimeoutError as Exported, awaitBlock as exportedBlock } from '../src/index';

const node = (text: string) => {
    const el = document.createElement('span');
    el.textContent = text;
    return el;
};

/** Mount a fragment in a scope; returns the host and the scope's dispose. */
function mount(make: () => DocumentFragment): { host: HTMLElement; dispose: () => void } {
    const host = document.createElement('div');
    const [frag, dispose] = collectDisposers(make);
    host.appendChild(frag);
    document.body.appendChild(host);
    return { host, dispose };
}

/** Let promise reactions and the effects they trigger run. */
const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

/** A promise the test settles by hand. */
function deferred<T = unknown>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    promise.catch((e: unknown) => e);
    return { promise, resolve, reject };
}

type State = 'idle' | 'pending' | 'success' | 'error';
/** A source speaking the async vocabulary, driven by hand. */
function fakeSource<T>(initial: { state: State; data?: T; error?: Error | null }) {
    const state = signal<State>(initial.state);
    const data = signal<T | undefined>(initial.data);
    const error = signal<Error | null>(initial.error ?? null);
    const refetch = vi.fn(() => { state.set('pending'); return Promise.resolve(); });
    return { state, data, error, refetch, source: { state, data, error, pending: () => state() === 'pending', refetch } };
}

const body = (value: () => unknown) => node(`body:${JSON.stringify(value())}`);
const loading = () => node('loading');
const failed = (err: unknown, retry: () => void) => {
    const el = node(`error:${(err as Error).name}:${(err as Error).message}`);
    el.addEventListener('click', retry);
    return el;
};

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('awaitBlock on a source', () => {
    it('shows @loading while pending, then the body with data() bound', async () => {
        const s = fakeSource<string[]>({ state: 'pending' });
        const { host } = mount(() => awaitBlock(() => s.source, body, loading, failed));
        expect(host.textContent).toBe('loading');
        s.data.set(['ada', 'bob']);
        s.state.set('success');
        await settle();
        expect(host.textContent).toBe('body:["ada","bob"]');
    });

    it('shows @error with error() on a failure with no data, and retry calls refetch()', async () => {
        const s = fakeSource<string[]>({ state: 'error', error: new Error('offline') });
        const { host } = mount(() => awaitBlock(() => s.source, body, loading, failed));
        expect(host.textContent).toBe('error:Error:offline');
        (host.querySelector('span') as HTMLElement).click();
        expect(s.refetch).toHaveBeenCalledTimes(1);
        await settle();
        expect(host.textContent, 'a refetch in flight with no data is pending again').toBe('loading');
    });

    it('keeps the body through a refresh, and through a refresh that failed over kept data (E4)', async () => {
        const s = fakeSource<number>({ state: 'success', data: 1 });
        const { host } = mount(() => awaitBlock(() => s.source, body, loading, failed));
        expect(host.textContent).toBe('body:1');
        const kept = host.firstElementChild;
        s.state.set('pending');
        await settle();
        expect(host.textContent).toBe('body:1');
        s.error.set(new Error('offline'));
        s.state.set('error');
        await settle();
        expect(host.textContent, '@error replaced the kept data').toBe('body:1');
        expect(host.firstElementChild, 'the body was rebuilt instead of kept').toBe(kept);
    });

    it('updates the bound value in place when data() changes', async () => {
        const s = fakeSource<number>({ state: 'success', data: 1 });
        const { host } = mount(() => awaitBlock(() => s.source, (v) => {
            const el = node('');
            el.textContent = String(v());
            return el;
        }, loading, failed));
        const first = host.firstElementChild;
        s.data.set(2);
        await settle();
        expect(host.firstElementChild, 'a new value rebuilt the body').toBe(first);
    });
});

describe('awaitBlock on a promise', () => {
    it('binds the resolved value, and a promise resolving null renders the body (E5)', async () => {
        const d = deferred<null>();
        const { host } = mount(() => awaitBlock(() => d.promise, body, loading, failed));
        expect(host.textContent).toBe('loading');
        d.resolve(null);
        await settle();
        expect(host.textContent).toBe('body:null');
    });

    it('reaches @error with the rejection reason', async () => {
        const d = deferred();
        const { host } = mount(() => awaitBlock(() => d.promise, body, loading, failed));
        d.reject(new Error('offline'));
        await settle();
        expect(host.textContent).toBe('error:Error:offline');
    });

    it('awaits a new promise put in the signal after a rejection', async () => {
        const first = deferred<number>();
        const p = signal<Promise<number>>(first.promise);
        const { host } = mount(() => awaitBlock(() => p(), body, loading, failed));
        first.reject(new Error('offline'));
        await settle();
        expect(host.textContent).toBe('error:Error:offline');
        const second = deferred<number>();
        p.set(second.promise);
        await settle();
        expect(host.textContent).toBe('loading');
        second.resolve(7);
        await settle();
        expect(host.textContent).toBe('body:7');
    });
});

describe('awaitBlock on a plain value (E5)', () => {
    const cases: [unknown, string][] = [
        [0, 'body:0'],
        ['', 'body:""'],
        [null, 'body:null'],
        [undefined, 'loading'],
        [false, 'loading'],
        [true, 'body:true'],
    ];
    for (const [value, expected] of cases) {
        it(`${String(value) || "''"} → ${expected}`, () => {
            const { host } = mount(() => awaitBlock(() => value, body, loading, null));
            expect(host.textContent).toBe(expected);
        });
    }

    it('a boolean is a condition: false stays pending, true renders the body', async () => {
        const ready = signal(false);
        const { host } = mount(() => awaitBlock(() => ready(), () => node('ok'), loading, null));
        expect(host.textContent).toBe('loading');
        ready.set(true);
        await settle();
        expect(host.textContent).toBe('ok');
    });
});

describe('awaitBlock timing', () => {
    it('maxMs: a promise still pending → @error with AwaitTimeoutError, then the body when it resolves', async () => {
        vi.useFakeTimers();
        const d = deferred<number>();
        const { host } = mount(() => awaitBlock(() => d.promise, body, loading, failed, { maxMs: 300 }));
        expect(host.textContent).toBe('loading');
        await vi.advanceTimersByTimeAsync(300);
        expect(host.textContent).toBe('error:AwaitTimeoutError:no result after 300ms');
        d.resolve(5);
        await vi.advanceTimersByTimeAsync(0);
        expect(host.textContent).toBe('body:5');
    });

    it('maxMs without @error: @loading stays, and the body never renders unresolved', async () => {
        vi.useFakeTimers();
        const d = deferred<number>();
        const { host } = mount(() => awaitBlock(() => d.promise, body, loading, null, { maxMs: 300 }));
        await vi.advanceTimersByTimeAsync(1000);
        expect(host.textContent).toBe('loading');
    });

    it('minMs: a result before the delay renders the body with no @loading frame', async () => {
        vi.useFakeTimers();
        const d = deferred<number>();
        const frames: string[] = [];
        const { host } = mount(() => awaitBlock(() => d.promise, body, () => { frames.push('loading'); return loading(); }, null, { minMs: 200 }));
        expect(host.textContent).toBe('');
        await vi.advanceTimersByTimeAsync(100);
        d.resolve(1);
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(500);
        expect(host.textContent).toBe('body:1');
        expect(frames, 'a spinner flashed for a result faster than minMs').toEqual([]);
    });

    it('minMs: a slow result shows @loading after the delay', async () => {
        vi.useFakeTimers();
        const d = deferred<number>();
        const { host } = mount(() => awaitBlock(() => d.promise, body, loading, null, { minMs: 200 }));
        await vi.advanceTimersByTimeAsync(200);
        expect(host.textContent).toBe('loading');
    });

    it('the timers restart when the source changes after a timeout', async () => {
        vi.useFakeTimers();
        const p = signal<Promise<number>>(deferred<number>().promise);
        const { host } = mount(() => awaitBlock(() => p(), body, loading, failed, { maxMs: 300 }));
        await vi.advanceTimersByTimeAsync(300);
        expect(host.textContent).toBe('error:AwaitTimeoutError:no result after 300ms');
        p.set(deferred<number>().promise);
        await vi.advanceTimersByTimeAsync(0);
        expect(host.textContent, 'a new source is awaited from the start').toBe('loading');
        await vi.advanceTimersByTimeAsync(299);
        expect(host.textContent).toBe('loading');
        await vi.advanceTimersByTimeAsync(1);
        expect(host.textContent).toBe('error:AwaitTimeoutError:no result after 300ms');
    });

    it('no timer fires once the block is removed', async () => {
        vi.useFakeTimers();
        const d = deferred<number>();
        let errors = 0;
        const { dispose } = mount(() => awaitBlock(() => d.promise, body, () => node('l'), (e, r) => { errors++; return failed(e, r); }, { minMs: 100, maxMs: 300 }));
        dispose();
        expect(vi.getTimerCount(), 'the block left a timer behind').toBe(0);
        await vi.advanceTimersByTimeAsync(1000);
        expect(errors).toBe(0);
    });
});

describe('the exports', () => {
    it('AwaitTimeoutError is named, distinct, and exported with awaitBlock', () => {
        const e = new AwaitTimeoutError(300);
        expect(e).toBeInstanceOf(Error);
        expect(e.name).toBe('AwaitTimeoutError');
        expect(Exported).toBe(AwaitTimeoutError);
        expect(exportedBlock).toBe(awaitBlock);
    });

    it('awaitReady speaks the same rules: a source, a plain value, a promise', async () => {
        expect(awaitReady(0)).toBe(true);
        expect(awaitReady(null)).toBe(true);
        expect(awaitReady(undefined)).toBe(false);
        expect(awaitReady(false)).toBe(false);
        expect(awaitReady(fakeSource({ state: 'pending' }).source)).toBe(false);
        expect(awaitReady(fakeSource({ state: 'success', data: 1 }).source)).toBe(true);
        expect(() => awaitReady(fakeSource({ state: 'error', error: new Error('x') }).source)).toThrow('x');
    });
});
