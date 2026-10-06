/**
 * One navigation, one page.
 *
 * A click must not mount a page TWICE. If `navigate()` in the generated router calls
 * `history.pushState` and then resolves the route by hand, the route resolves twice: `pushState`
 * fires the Navigation API's `navigate` event, which the same module listens to and also resolves.
 * Because the outlet awaits `onBeforeLeave` before recording the route it moved from, the second
 * resolution misses the same-route early return and activates again.
 *
 * The result is one removal and two additions per click. The cards on /components accumulate
 * 112 → 224 → 336 → 448, and the copy the visitor SEES is the stale one, which never updates its
 * params: "the first navigation works, then nothing renders". Going back to /components shows
 * `Unknown`.
 *
 * Every assertion below is about a CLICK, not a `goto`. A hard load and a client-side navigation
 * are different code paths, and this defect lives only in the second — a `goto` of every page
 * says the site is healthy while it is not.
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * A WALK, not a list of URLs.
 *
 * The parameterised routes are reached from links that only exist on their own section's page —
 * the docs sidebar carries `/docs/:slug`, the design nav carries `/design/:topic`, the component
 * index carries `/components/:tag`. An order that visits `/design/colors` while standing on the
 * docs page finds no link and proves nothing.
 *
 * So each hop is reachable from the one before it, and the walk crosses every route shape the site
 * declares before returning home.
 */
const HOPS = [
    '/docs',                  // from the header nav
    '/docs/router',           // /docs/:slug — from the docs sidebar
    '/components',            // header nav
    '/components/pdx-select', // /components/:tag — from a card on the index
    '/design',                // header nav
    '/design/colors',         // /design/:topic — from the design nav
    '/playground',            // header nav
    '/integrations',          // header nav
    '/search',                // header nav
    '/',                      // the brand lockup
];

interface Landed { url: string; children: number; tags: string[] }

async function landed(page: Page): Promise<Landed> {
    return page.evaluate(() => {
        const outlet = document.querySelector('pdx-router-outlet');
        return {
            url: location.pathname,
            children: outlet ? outlet.children.length : -1,
            tags: outlet ? Array.from(outlet.children).map(c => c.tagName.toLowerCase()) : [],
        };
    });
}

/** Click the site's own link to `href`; fail loudly rather than falling back to a goto. */
async function clickTo(page: Page, href: string): Promise<void> {
    const link = page.locator(`a[href="${href}"]`).first();
    await expect(link, `the site offers no link to ${href}, so this hop tests nothing`).toHaveCount(1);
    await link.click();
    await page.waitForFunction(h => location.pathname === h, href, { timeout: 10_000 });
    await page.waitForTimeout(400);
}

test('clicking through the site leaves exactly one page mounted', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)));

    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('pdx-router-outlet')).toHaveCount(1);
    await page.waitForTimeout(600);

    const start = await landed(page);
    expect(start.children, 'the landing page did not mount exactly one view').toBe(1);

    for (const href of HOPS) {
        await clickTo(page, href);
        const now = await landed(page);
        expect(now.url, `clicking ${href} did not get there`).toBe(href);
        expect(now.children, `${href} left ${now.children} views mounted: ${now.tags.join(', ')}`).toBe(1);
    }

    expect(errors, 'navigating the site threw').toEqual([]);
});

// The component-design page is reached the way a reader reaches it: from the docs sidebar,
// by a click. The nav is built from the glob of content/docs, so a page missing its front matter
// would build and simply never be listed.
test('the component-design rules are in the docs sidebar, and the page shows all of them', async ({ page }) => {
    await page.goto('/docs/router', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await clickTo(page, '/docs/component-design');

    const outlet = page.locator('pdx-router-outlet');
    await expect(outlet.getByRole('heading', { level: 1, name: 'Component Design' })).toBeVisible();
    // 18 rules, each a heading carrying its id: the same set the doc and the skill carry.
    await expect(outlet.getByRole('heading', { level: 3, name: /^CD-[A-Z]\d+ — / })).toHaveCount(18);
});

// A modified click is the browser's: a route that follows every click on a site link in the page,
// Ctrl/Cmd included, makes "open in a new tab" navigate the tab the reader is leaving.
test('a Ctrl/Cmd click on a site link opens a new tab and leaves this one where it is', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const link = page.locator('.site-nav a[href="/docs"]');
    await expect(link).toHaveCount(1);
    const [tab] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 10_000 }),
        link.click({ modifiers: ['ControlOrMeta'] }),
    ]);
    // A new tab starts at about:blank; the link's address comes after.
    await tab.waitForURL((u) => u.pathname === '/docs', { timeout: 10_000 });
    await page.waitForTimeout(400);
    expect(new URL(page.url()).pathname, 'the click navigated the tab it was made in').toBe('/');
    await tab.close();
});

test('going back restores the page that was left, not a second copy', async ({ page }) => {
    // The stale-copy symptom shows most plainly on back: /components renders the component
    // DETAIL view with no tag, under an `Unknown` heading, on top of the index that never left.
    await page.goto('/components', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const index = await landed(page);
    expect(index.children).toBe(1);

    await clickTo(page, '/components/pdx-button');
    expect((await landed(page)).children, 'the detail page mounted more than one view').toBe(1);

    await page.goBack();
    await page.waitForFunction(() => location.pathname === '/components', undefined, { timeout: 10_000 });
    await page.waitForTimeout(600);

    const back = await landed(page);
    expect(back.children, `back left ${back.children} views mounted: ${back.tags.join(', ')}`).toBe(1);
    expect(back.tags, 'back rendered something other than the index').toEqual(index.tags);
});
