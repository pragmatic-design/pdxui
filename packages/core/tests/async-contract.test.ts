// The execution contract of a read source (beta spec, docs/language/beta/data.md → «The execution
// contract»), one suite for every source: `resource()`, a compiled `@fetch`, `useQuery`.
//
// Each source is driven through a fake transport that records every call and answers when the test
// says so, so a race is written as the order of the answers rather than left to timers. The cases
// are numbered as the spec numbers its rules; this file holds:
//
//   - case 1 (E1, latest wins): two requests in flight, the older one answering last, does not
//     overwrite the newer one's data;
//   - case 8 (E8, disposed with its scope): a source created in a component's setup lets go of its
//     cache subscription when the component goes, so the entry is collected, and a retry waiting in
//     its backoff does not fire (#254).
//
// The issues for E2, E3, E6 and E7 add their cases here; the route-loader rows come with the loaders.

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const { component, html, resource, useQuery, signal, createCache, getDefaultCache } = core;

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

/** A transport that records each call and answers only when the test says so. */
function heldTransport<T>() {
    const calls: unknown[] = [];
    const pending: { resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
    return {
        calls,
        call(arg?: unknown): Promise<T> {
            calls.push(arg);
            return new Promise<T>((resolve, reject) => { pending.push({ resolve, reject }); });
        },
        answer(index: number, value: T) { pending[index].resolve(value); },
        fail(index: number, error: unknown = new Error('network')) { pending[index].reject(error); },
    };
}

let tagSeq = 0;
/** Define a component whose setup runs `make`, mount it, and hand back the element. */
async function mountWith(make: () => unknown): Promise<HTMLElement> {
    const tag = `pdx-async-contract-${++tagSeq}`;
    component(tag, { setup() { make(); return {}; }, render: () => html`<i></i>` });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await settle();
    return el;
}

/** Compile a `.pdx` source and run its module against core, as the build would (render-parity's bridge). */
function defineCompiled(name: string, src: string): void {
    const { code } = compile(src, `${name}.pdx`, [], undefined, {});
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
}

/** A JSON response, the shape the HTTP client reads. */
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

// ─── resource() ─────────────────────────────────────────────────────

describe('resource()', () => {
    it('case 1 — latest wins: an older answer arriving last does not overwrite the newer data', async () => {
        const t = heldTransport<string>();
        const id = signal(1);
        const cache = createCache({ gcInterval: 0 });
        const r = resource(() => t.call(id()), { key: () => `user:${id()}`, cache });
        await settle();
        id.set(2);
        await settle();
        expect(t.calls, 'the second request never started').toEqual([1, 2]);

        t.answer(1, 'two');
        await settle();
        t.answer(0, 'one');
        await settle();
        expect(r.data(), 'the older answer overwrote the newer one').toBe('two');
        r.dispose();
    });

    it('case 8 — created in a component, it releases its cache subscription when the component goes', async () => {
        const t = heldTransport<string[]>();
        const cache = createCache({ gcInterval: 0, gcTime: 0 });
        const el = await mountWith(() => resource(() => t.call(), { key: 'users', cache }));
        t.answer(0, ['ada']);
        await settle();
        expect(cache.get('users')?.subscribers, 'control: the mounted resource holds the entry').toBe(1);

        el.remove();
        await settle();
        expect(cache.get('users')?.subscribers, 'the destroyed component still holds its entry').toBe(0);
        cache.gc();
        expect(cache.has('users'), 'the entry outlived its gcTime: nothing let go of it').toBe(false);
    });

    it('case 8 — a retry waiting in its backoff does not fire after the component goes', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const t = heldTransport<string[]>();
        const cache = createCache({ gcInterval: 0 });
        const tag = `pdx-async-contract-${++tagSeq}`;
        component(tag, { setup() { resource(() => t.call(), { key: 'retrying', cache, retry: 1 }); return {}; }, render: () => html`<i></i>` });
        const el = document.createElement(tag);
        document.body.appendChild(el);
        await vi.advanceTimersByTimeAsync(0);
        expect(t.calls.length, 'the first request never started').toBe(1);

        t.fail(0);
        await vi.advanceTimersByTimeAsync(0); // the failure is in; the retry now waits in its backoff
        el.remove();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(t.calls.length, 'a request went out after its component was destroyed').toBe(1);
    });

    it('control: a resource created outside any component is not disposed by anything', async () => {
        const t = heldTransport<string>();
        const cache = createCache({ gcInterval: 0 });
        const r = resource(() => t.call(), { key: 'module-level', cache });
        t.answer(0, 'kept');
        await settle();
        expect(cache.get('module-level')?.subscribers).toBe(1);
        r.dispose();
        expect(cache.get('module-level')?.subscribers).toBe(0);
    });
});

// ─── a compiled @fetch ──────────────────────────────────────────────

describe('a compiled @fetch', () => {
    function stubFetch() {
        const t = heldTransport<Response>();
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => t.call(String(input))));
        core.setDefaultClient(core.createHttpClient({ retry: false, timeout: 0 }));
        return t;
    }

    it('case 1 — latest wins on a reactive URL', async () => {
        const t = stubFetch();
        defineCompiled('acfetchlatest', "<template><p>{{ user.data()?.name ?? '' }}</p><button @click=\"id = 2\">2</button></template>\n"
            + "<script setup>\nlet id = $signal(1);\n@fetch user: 'GET /api/ac-latest/${id}' as User;\n</script>\n");
        const el = document.createElement('pdx-acfetchlatest');
        document.body.appendChild(el);
        await settle();
        el.querySelector('button')!.click();
        await settle();
        expect(t.calls.length, 'the second request never started').toBe(2);

        t.answer(1, json({ name: 'two' }));
        await settle();
        t.answer(0, json({ name: 'one' }));
        await settle();
        expect(el.querySelector('p')!.textContent, 'the older answer overwrote the newer one').toBe('two');
    });

    it('case 8 — the component going releases the @fetch cache subscription', async () => {
        const t = stubFetch();
        defineCompiled('acfetchdispose', "<template><p>{{ users.data()?.length ?? 0 }}</p></template>\n"
            + "<script setup>\n@fetch users: 'GET /api/ac-dispose' as string[];\n</script>\n");
        const el = document.createElement('pdx-acfetchdispose');
        document.body.appendChild(el);
        await settle();
        t.answer(0, json(['ada']));
        await settle();
        const cache = getDefaultCache();
        expect(cache.get('GET:/api/ac-dispose')?.subscribers, 'control: the mounted @fetch holds the entry').toBe(1);

        el.remove();
        await settle();
        expect(cache.get('GET:/api/ac-dispose')?.subscribers, 'the destroyed component still holds its @fetch entry').toBe(0);
    });

    it('case 8 — a @fetch retry waiting in its backoff does not fire after the component goes', async () => {
        const t = stubFetch();
        defineCompiled('acfetchretry', "<template><p></p></template>\n"
            + "<script setup>\n@fetch users: 'GET /api/ac-retry' as string[] { retry: 1 };\n</script>\n");
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const el = document.createElement('pdx-acfetchretry');
        document.body.appendChild(el);
        await vi.advanceTimersByTimeAsync(0);
        expect(t.calls.length, 'the first request never started').toBe(1);

        t.fail(0, new TypeError('network'));
        await vi.advanceTimersByTimeAsync(0);
        el.remove();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(t.calls.length, 'a request went out after its component was destroyed').toBe(1);
    });
});

// ─── useQuery ───────────────────────────────────────────────────────

describe('useQuery', () => {
    it('case 1 — latest wins: an older answer arriving last does not overwrite the newer data', async () => {
        const t = heldTransport<string>();
        const id = signal(1);
        const q = useQuery(() => t.call(id()), { key: () => `ac-query:${id()}`, refetchOnFocus: false, refetchOnReconnect: false, retry: 0 });
        await settle();
        id.set(2);
        await settle();
        expect(t.calls).toEqual([1, 2]);

        t.answer(1, 'two');
        await settle();
        t.answer(0, 'one');
        await settle();
        expect(q.data(), 'the older answer overwrote the newer one').toBe('two');
        q.dispose();
    });
});
