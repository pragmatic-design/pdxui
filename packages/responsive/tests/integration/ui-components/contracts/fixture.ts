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

import { test as base, type Browser, type BrowserContext, type BrowserContextOptions } from '@playwright/test';

export * from '@playwright/test';

type ContextOptionFixtures = Pick<BrowserContextOptions,
    'viewport' | 'hasTouch' | 'isMobile' | 'colorScheme' | 'locale' | 'deviceScaleFactor' | 'baseURL'>;

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

export const test = base.extend<{}, { contextPool: Map<string, BrowserContext>; sharedContext: BrowserContext }>({
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

    contextPool: [async ({ browser }: { browser: Browser }, use) => {
        const pool = new Map<string, BrowserContext>();
        await use(pool);
        await Promise.all([...pool.values()].map((c) => c.close()));
    }, { scope: 'worker' }],

    context: async ({ browser, contextPool, contextOptions: rest, viewport, hasTouch, isMobile,
        colorScheme, locale, deviceScaleFactor, baseURL }, use) => {
        // `contextOptions` carries what has no fixture of its own (reducedMotion, forcedColors, …).
        const options = { ...rest, ...contextOptions({ viewport, hasTouch, isMobile, colorScheme, locale, deviceScaleFactor, baseURL }) };
        const key = JSON.stringify(options);
        let context = contextPool.get(key);
        if (!context) {
            context = await browser.newContext(options);
            contextPool.set(key, context);
        }
        await use(context);
        await resetContext(context);
    },

    page: async ({ context, baseURL }, use) => {
        const page = await context.newPage();
        if (baseURL) {
            // localStorage, sessionStorage, IndexedDB, cookies, service workers: what the last test on
            // this context left on the scenario origin. The HTTP cache stays, and is the point.
            const cdp = await context.newCDPSession(page);
            await cdp.send('Storage.clearDataForOrigin', { origin: new URL(baseURL).origin, storageTypes: 'all' });
            await cdp.detach();
        }
        await use(page);
    },
});
