// The site fixture under a page that is slow to create: run by core's site-fixture.test.ts, never by
// the site suite (its config matches `*.spec.ts`, and this file is not one).

import { test as siteTest, expect } from '../fixture';

const DELAY = Number(process.env.PDX_PROBE_DELAY ?? 0);

// The browser starved: the page arrives DELAY ms after it is asked for.
const test = siteTest.extend({
    context: async ({ context }, use) => {
        const newPage = context.newPage.bind(context);
        context.newPage = async (...args) => {
            await new Promise((resolve) => setTimeout(resolve, DELAY));
            return newPage(...args);
        };
        await use(context);
    },
});

test('probe', async ({ page }) => {
    expect(page.isClosed()).toBe(false);
    expect(process.env.PDX_PROBE_FAIL, 'a failure of the test itself, with no slow fixture').toBeUndefined();
});
