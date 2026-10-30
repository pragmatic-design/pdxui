// The site suite's `test`: Playwright's, with page creation given a budget of its own (#758).
//
// Under the pre-push run a test failed its 30 s having used 26.6 s of them creating the page, before
// its first line: the browser was starved, the test was not slow. Here `page` is created under a
// fixture timeout of its own, so a slow creation fails as a fixture timeout that names `page`, and the
// 30 s stay the test's. Not a bigger test timeout and not a retry: both would hide the starvation.
//
// Every spec imports `test` and `expect` from here; `site-fixture.test.ts` in core holds both.

import { test as base } from '@playwright/test';

export * from '@playwright/test';

// Settable only so that check can scale it down; the suite never sets it.
const PAGE_TIMEOUT = Number(process.env.PDX_SITE_PAGE_TIMEOUT ?? 60_000);

export const test = base.extend({
    // What Playwright's own `page` does outside its reuse mode, which this suite does not use: a
    // fixture that wrapped that one would wait for it under the test's timeout.
    page: [async ({ context }, use) => { await use(await context.newPage()); }, { scope: 'test', timeout: PAGE_TIMEOUT }],
});
