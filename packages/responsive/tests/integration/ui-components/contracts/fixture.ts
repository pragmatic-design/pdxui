// The `test` every certify spec uses: one browser context per worker, reset between tests.
//
// Playwright's default gives every test a fresh context, and with it fresh connections to the scenario
// server. Over ~6,600 tests on Windows that churns the loopback until a connect fails: client
// TIME_WAIT to :5220 peaks at 11,467, `page.goto` gets ERR_CONNECTION_REFUSED in about one run in
// five, and `failOnFlakyTests` blocks the pre-push (Linux does not do it). With a context per
// worker: 0 refused in 5 runs, TIME_WAIT peak ~2,200, same duration.
//
// A worker keeps one context per set of context options, so `test.use({ viewport, hasTouch, … })`
// still gets what it asks for. Between tests the context is put back as a new one would be: every page
// closed, online, no routes, no cookies, no permissions, and the scenario origin's storage cleared.
// Every test gets a new PAGE: Playwright's own reuse mode keeps the page too, and that leaves viewport,
// emulation and listeners to the next test (3 flaky per run in offline-queue, offscreen-is-hidden and
// plain-move); with a new page those three pass 729 of 729 with no retry.
//
// Everything else of '@playwright/test' is re-exported, so a spec changes only where it imports from;
// `packages/core/tests/certify-worker-context.test.ts` fails on a spec that does not.
//
// The showcase uses it too (`packages/showcase/tests/fixture.ts`): its build suite alone left 3,298
// sockets in TIME_WAIT on its port, and inside the full gate `page.goto` was refused there as well.
// It signs every context in through a `storageState`, which the reset would wipe with the origin's
// storage, so the state is laid down again on each test's first navigation (`seedStorageState`).

import { readFileSync } from 'node:fs';
import { test as base, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';

export * from '@playwright/test';

type ContextOptionFixtures = Pick<BrowserContextOptions,
    'viewport' | 'hasTouch' | 'isMobile' | 'colorScheme' | 'locale' | 'deviceScaleFactor' | 'baseURL' | 'storageState'>;

type StorageState = { cookies?: Parameters<BrowserContext['addCookies']>[0]; origins?: { origin: string; localStorage: { name: string; value: string }[] }[] };

/**
 * Put back what a fresh context would have started with: the `storageState`'s cookies, and its
 * localStorage on the first navigation of this page to that origin. Once per page — a test that signs
 * out and reloads must stay signed out, as it would in a new context — which is what the
 * sessionStorage mark is for: it belongs to this tab and dies with it.
 */
async function seedStorageState(page: Page, state: string | StorageState | undefined): Promise<void> {
    if (!state) return;
    const parsed: StorageState = typeof state === 'string' ? JSON.parse(readFileSync(state, 'utf8')) as StorageState : state;
    if (parsed.cookies?.length) await page.context().addCookies(parsed.cookies);
    for (const { origin, localStorage: items } of parsed.origins ?? []) {
        if (!items.length) continue;
        await page.addInitScript(({ origin, items }) => {
            if (location.origin !== origin || sessionStorage.getItem('__pdx_storage_state')) return;
            sessionStorage.setItem('__pdx_storage_state', '1');
            for (const { name, value } of items) localStorage.setItem(name, value);
        }, { origin: new URL(origin).origin, items });
    }
}

/** The context options a test resolved to, without the unset ones: the key of its worker context. */
function contextOptions(o: ContextOptionFixtures): BrowserContextOptions {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as BrowserContextOptions;
}

async function resetContext(context: BrowserContext): Promise<void> {
    await Promise.all(context.pages().map((p) => p.close()));
    await context.setOffline(false);
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.clearCookies();
    await context.clearPermissions();
}

/**
 * What a reused context does with its HTTP cache between tests. `keep` is certify's: the scenario
 * pages load the same assets hundreds of times, and the cache is the point. `clear` is for a suite
 * whose tests measure a cold load — the showcase's first paint and waves — where an entry answered by a
 * 304 measures a returning visitor (300 bytes on the wire for a 34 KB body, #32). The connections
 * are reused either way; that is what the loopback needed.
 */
export type HttpCache = 'keep' | 'clear';

export const test = base.extend<{ httpCache: HttpCache }, { contextPool: Map<string, BrowserContext>; sharedContext: BrowserContext }>({
    httpCache: ['keep', { option: true }],

    /**
     * The context of a group that shares one page across its tests, the manifest and axe runners:
     * opened once per worker, never reset, closed with the worker. A group closes only its own page.
     * Not a context in every `beforeAll`, which under fullyParallel runs in every worker that takes
     * one of the group's tests: hundreds of contexts a run, and their connections.
     */
    sharedContext: [async ({ browser }: { browser: Browser }, use) => {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await use(context);
        await context.close();
    }, { scope: 'worker' }],

    contextPool: [async ({}, use) => {
        const pool = new Map<string, BrowserContext>();
        await use(pool);
        await Promise.all([...pool.values()].map((c) => c.close()));
    }, { scope: 'worker' }],

    context: async ({ browser, contextPool, contextOptions: rest, viewport, hasTouch, isMobile,
        colorScheme, locale, deviceScaleFactor, baseURL, storageState }, use) => {
        // `contextOptions` carries what has no fixture of its own (reducedMotion, forcedColors, …).
        // `storageState` is part of the key: a guest's context is never a signed-in one reset.
        const options = { ...rest, ...contextOptions({ viewport, hasTouch, isMobile, colorScheme, locale, deviceScaleFactor, baseURL, storageState }) };
        const key = JSON.stringify(options);
        let context = contextPool.get(key);
        if (!context) {
            context = await browser.newContext(options);
            contextPool.set(key, context);
        }
        await use(context);
        await resetContext(context);
    },

    page: async ({ context, baseURL, storageState, httpCache }, use) => {
        const page = await context.newPage();
        if (baseURL || httpCache === 'clear') {
            const cdp = await context.newCDPSession(page);
            // localStorage, sessionStorage, IndexedDB, cookies, service workers: what the last test on
            // this context left on the scenario origin. The HTTP cache stays unless asked (`httpCache`).
            if (baseURL) await cdp.send('Storage.clearDataForOrigin', { origin: new URL(baseURL).origin, storageTypes: 'all' });
            if (httpCache === 'clear') await cdp.send('Network.clearBrowserCache');
            await cdp.detach();
        }
        await seedStorageState(page, storageState as string | StorageState | undefined);
        await use(page);
    },
});
