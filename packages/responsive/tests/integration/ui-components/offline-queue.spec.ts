// The offline queue, measured against a real network drop.
//
// `offline.test.ts` has five tests and they all run past a getter the test itself writes:
//
//     Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
//
// so no request in them ever fails. The middleware is exercised against a property, not against a
// network — the same shape as a test that measures rects it wrote itself. And offline is the worse case, because everything hard about it is on the
// other side of that stub: a fetch that rejects, a queue that has to survive a reload, a replay
// whose order matters.
//
// Here `context.setOffline(true)` takes the network away at the transport layer, and the page talks
// to a real endpoint on the scenarios dev server (`offline-endpoint.ts`). "The mutation was
// replayed" is then a fact about the SERVER, which this spec asks through Playwright's `request`
// fixture — a Node-side context, still online while the browser context is not.
//
// The unit tests stay: they are fast and they cover the branches. They are just not the only thing
// standing behind the claim.
import { test, expect, type Page, type APIRequestContext } from './contracts/fixture';
import { openPage } from './contracts/measure';

const HOST = 'http://localhost:5220';

interface Received {
    seq: number;
    method: string;
    path: string;
    body: unknown;
}

interface Outcome {
    ok: boolean;
    data?: unknown;
    error?: string;
    offline?: boolean;
}

interface Queued { method: string; url: string; size: number }
interface Replayed { method: string; url: string; ok: boolean; error: string | null }
interface Persisted { method: string; url: string; body: unknown }

declare global {
    interface Window {
        __offline: {
            run: string;
            post(path: string, body?: unknown): Promise<Outcome>;
            put(path: string, body?: unknown): Promise<Outcome>;
            get(path: string): Promise<Outcome>;
            del(path: string): Promise<Outcome>;
            onLine(): boolean;
            connectivity(): string[];
            queued(): Queued[];
            replayed(): Replayed[];
            errors(): { path: string; method: string; name: string }[];
            persisted(): Promise<Persisted[] | null>;
            databases(): Promise<(string | undefined)[]>;
        };
    }
}

/** A namespace on the endpoint, per test: certify is fullyParallel against one shared dev server. */
function newRun(name: string): string {
    return `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function harnessUrl(run: string, opts: { persist?: boolean; retry?: boolean } = {}): string {
    const q = new URLSearchParams({ run });
    if (opts.persist) q.set('persist', '1');
    if (opts.retry === false) q.set('retry', '0');
    return `/offline-queue.html?${q.toString()}`;
}

async function received(request: APIRequestContext, run: string): Promise<Received[]> {
    const response = await request.get(`${HOST}/__offline/log/${run}`);
    expect(response.ok(), 'the endpoint did not answer the log').toBeTruthy();
    return (await response.json()).received as Received[];
}

/** What arrived, as `METHOD path body.n` — the shape every ordering expectation below is written in. */
function trace(entries: Received[]): string[] {
    return entries.map((e) => `${e.method} ${e.path} ${JSON.stringify(e.body)}`);
}

/** Go offline and wait until the page agrees, rather than sleeping and hoping. */
async function goOffline(page: Page): Promise<void> {
    await page.context().setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false, undefined, { timeout: 5_000 });
}

async function goOnline(page: Page): Promise<void> {
    await page.context().setOffline(false);
    await page.waitForFunction(() => navigator.onLine === true, undefined, { timeout: 5_000 });
}

test.describe('offlineMiddleware, against a real network drop', () => {
    test('the harness is actually offline — the control for everything below', async ({ page, request }) => {
        const run = newRun('control');
        await openPage(page, harnessUrl(run));

        // Online: it works. Without this half, "the request failed" proves nothing about offline.
        const before = await page.evaluate(() => window.__offline.post('/before', { n: 0 }));
        expect(before.ok, 'the endpoint is not reachable while online').toBe(true);
        expect(trace(await received(request, run))).toEqual(['POST /before {"n":0}']);

        await goOffline(page);
        expect(await page.evaluate(() => window.__offline.onLine())).toBe(false);
        expect(await page.evaluate(() => window.__offline.connectivity())).toEqual(['offline']);

        // And the drop is at the transport, not just a flag: a GET is passed straight through by
        // the middleware, so its failure is the network's, not the queue's.
        const during = await page.evaluate(() => window.__offline.get('/probe'));
        expect(during.ok, 'a GET succeeded while the context was offline').toBe(false);
        expect(trace(await received(request, run)), 'the endpoint was reached while offline')
            .toEqual(['POST /before {"n":0}']);
    });

    test('a mutation issued offline is queued, not lost, and the caller gets an OfflineError', async ({ page, request }) => {
        const run = newRun('queued');
        await openPage(page, harnessUrl(run));
        await goOffline(page);

        const outcome = await page.evaluate(() => window.__offline.post('/tickets', { title: 'no signal' }));
        expect(outcome.ok).toBe(false);
        expect(outcome.error, 'the caller cannot tell this apart from a server error').toBe('OfflineError');
        expect(outcome.offline, 'the error is not an OfflineError instance').toBe(true);

        expect(await page.evaluate(() => window.__offline.queued())).toHaveLength(1);
        expect(trace(await received(request, run)), 'it reached the server after all').toEqual([]);
    });

    test('reconnecting replays it, and the endpoint receives it', async ({ page, request }) => {
        const run = newRun('replay');
        await openPage(page, harnessUrl(run));
        await goOffline(page);
        await page.evaluate(() => window.__offline.post('/tickets', { title: 'queued' }));
        expect(trace(await received(request, run))).toEqual([]);

        await goOnline(page);
        await expect.poll(async () => trace(await received(request, run)), { timeout: 10_000 })
            .toEqual(['POST /tickets {"title":"queued"}']);

        const replayed = await page.evaluate(() => window.__offline.replayed());
        expect(replayed).toHaveLength(1);
        expect(replayed[0].ok, 'onReplay reported a failure for a request the server accepted').toBe(true);
    });

    test('three mutations queued offline arrive in the order they were made', async ({ page, request }) => {
        const run = newRun('order');
        await openPage(page, harnessUrl(run));
        await goOffline(page);
        for (const n of [1, 2, 3]) {
            await page.evaluate((i) => window.__offline.post('/tickets', { n: i }), n);
        }
        expect(await page.evaluate(() => window.__offline.queued())).toHaveLength(3);

        await goOnline(page);
        // FIFO is the guarantee the docs make and nothing checked: two writes to the same record in
        // the wrong order is the difference between the right value and the wrong one.
        await expect.poll(async () => trace(await received(request, run)), { timeout: 10_000 })
            .toEqual(['POST /tickets {"n":1}', 'POST /tickets {"n":2}', 'POST /tickets {"n":3}']);
    });

    test('a mutation made DURING the replay waits for it instead of overtaking it', async ({ page, request }) => {
        // The edge of the FIFO guarantee. The device reconnects, the queue starts draining, and the
        // user saves something else — a middleware that consults `navigator.onLine` and nothing else
        // sends that write straight out, and it can reach the server before writes that were made
        // minutes earlier.
        //
        // "During the drain" is made deterministic rather than raced for: the FIRST replayed write
        // is held for 1.5 s in the browser's network layer, and nothing else is delayed. So the
        // drain is provably stuck on entry 1 — the handler says so — while the fourth is issued,
        // and that fourth has no delay of its own. Unless it waits for the drain, it arrives FIRST,
        // ahead of the three writes it was made after.
        const run = newRun('midflight');
        await openPage(page, harnessUrl(run));
        await goOffline(page);
        for (const n of [1, 2, 3]) {
            await page.evaluate((i) => window.__offline.post('/tickets', { n: i }), n);
        }
        expect(await page.evaluate(() => window.__offline.queued()),
            'the three writes were not queued, so there is no drain to overtake').toHaveLength(3);

        let firstHeld = 0;
        await page.route('**/__offline/api/**', async (route) => {
            if ((route.request().postData() ?? '').includes('"n":1')) {
                firstHeld++;
                await new Promise((r) => setTimeout(r, 1_500));
            }
            await route.continue();
        });
        await goOnline(page);

        // The drain is in flight and held on its first entry: two more are still queued behind it.
        await expect.poll(() => firstHeld, { timeout: 10_000 }).toBe(1);
        expect(trace(await received(request, run)), 'the first write reached the server already')
            .toEqual([]);

        const fourth = page.evaluate(() => window.__offline.post('/tickets', { n: 4 }));

        // All four arrive, in the order they were made.
        await expect.poll(async () => trace(await received(request, run)), { timeout: 15_000 })
            .toEqual([
                'POST /tickets {"n":1}', 'POST /tickets {"n":2}',
                'POST /tickets {"n":3}', 'POST /tickets {"n":4}',
            ]);

        // And the CALLER still gets its own result, at the call site — not an OfflineError, and not
        // an `onReplay` callback. That is the whole reason this option was chosen over queueing it.
        const outcome = await fourth;
        expect(outcome.ok, 'the mutation that waited did not report its own success').toBe(true);
        expect(await page.evaluate(() => window.__offline.replayed()),
            'the fourth write was replayed as if it had been queued').toHaveLength(3);
    });

    test('a mutation is queued once, not once per retry attempt', async ({ page, request }) => {
        // retryMiddleware is ON by default and sits OUTSIDE the caller's middleware, so every retry
        // re-enters the offline middleware. PUT is idempotent, so it is retried — and unless the
        // middleware guards against it, ONE offline PUT is queued FOUR times (sizes 1..4) and the
        // server receives the same write four times on reconnect. Duplicate writes, from a queue whose whole purpose
        // is to get the write there exactly once.
        const run = newRun('retry');
        await openPage(page, harnessUrl(run));
        await goOffline(page);

        const started = Date.now();
        const outcome = await page.evaluate(() => window.__offline.put('/tickets/7', { title: 'edited' }));
        const elapsed = Date.now() - started;

        expect(outcome.error).toBe('OfflineError');
        expect(await page.evaluate(() => window.__offline.queued()), 'the PUT was queued more than once')
            .toHaveLength(1);
        // It also failed FAST: there is nothing to back off from when the device is offline, and the
        // three default retries cost ~1.8s of waiting before the caller heard anything.
        expect(elapsed, 'the caller waited through the retry backoff').toBeLessThan(1_000);

        await goOnline(page);
        await expect.poll(async () => trace(await received(request, run)), { timeout: 10_000 })
            .toEqual(['PUT /tickets/7 {"title":"edited"}']);
    });

    test('a GET while offline is not queued: it fails now, because stale data later is worse', async ({ page, request }) => {
        const run = newRun('get');
        await openPage(page, harnessUrl(run));
        await goOffline(page);

        const outcome = await page.evaluate(() => window.__offline.get('/tickets'));
        expect(outcome.ok).toBe(false);
        expect(outcome.offline, 'a GET was treated as something to replay later').toBe(false);
        expect(await page.evaluate(() => window.__offline.queued())).toEqual([]);

        await goOnline(page);
        // Nothing to replay, so nothing arrives — a read must not turn up later against a page that
        // has moved on.
        await page.waitForTimeout(1_000);
        expect(trace(await received(request, run))).toEqual([]);
    });

    test('the default queue is memory only: a reload loses it, and nothing says otherwise on disk', async ({ page }) => {
        const run = newRun('memory');
        await openPage(page, harnessUrl(run));
        await goOffline(page);
        await page.evaluate(() => window.__offline.post('/tickets', { n: 1 }));

        // `persist` defaults to false. This is the measurement behind the sentence in the docs: with
        // the default, a queued mutation lives in one JavaScript object and a reload is the end of it.
        expect(await page.evaluate(() => window.__offline.databases()), 'something was written to IndexedDB')
            .not.toContain('pdx-offline');
    });

    test('with persist, the queue survives a reload AND is replayed', async ({ page, request }) => {
        // A reload, done the way a user does it: the page that queued the
        // mutations is gone before the network comes back, so nothing it held in memory can replay.
        //
        // `about:blank` rather than page.close(): measured, a closed page's frame outlives the close
        // long enough to handle the `online` event and drain HALF the queue, which quietly turns
        // this into a test of the page that was supposed to be gone. Navigating away needs no
        // network and tears the JS context down at a point this spec controls.
        const run = newRun('reload');
        const url = harnessUrl(run, { persist: true });
        await openPage(page, url);
        await goOffline(page);
        await page.evaluate(() => window.__offline.post('/tickets', { n: 1 }));
        await page.evaluate(() => window.__offline.post('/tickets', { n: 2 }));

        await expect.poll(async () => (await page.evaluate(() => window.__offline.persisted()))?.length ?? 0,
            { timeout: 5_000 }).toBe(2);

        await page.goto('about:blank');
        await goOnline(page);
        // The harness is gone and the network is back: nothing should have been sent by anyone.
        await page.waitForTimeout(500);
        expect(trace(await received(request, run)), 'a page that no longer exists sent something').toEqual([]);

        await openPage(page, url);
        // The restored queue rides out on the app's first use of its client, because a middleware
        // has no handler until a request gives it one — there is no moment before that at which it
        // could send anything. So this is the guarantee, stated as what an app does: load, then
        // read something.
        expect(trace(await received(request, run)), 'something was sent before the client was used')
            .toEqual([]);
        const first = await page.evaluate(() => window.__offline.get('/list'));
        expect(first.ok, 'the app could not read after the reload').toBe(true);

        // And the backlog goes FIRST. The two mutations are older than this read; a reload is not a
        // licence to reorder them.
        await expect.poll(async () => trace(await received(request, run)), { timeout: 10_000 })
            .toEqual(['POST /tickets {"n":1}', 'POST /tickets {"n":2}', 'GET /list null']);
        expect(await page.evaluate(() => window.__offline.persisted()), 'the queue was replayed but not cleared')
            .toEqual([]);
    });
});
