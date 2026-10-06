/**
 * The breadcrumb nobody wrote, on the production build.
 *
 * The shell renders one `<pdx-breadcrumb>` with **no `items`**, and every screen gets its trail
 * from the routes it actually matched. What makes a route a step is the `label` on its `@page`:
 *
 *     @page '/tickets'                        { label: 'Tickets' }
 *     @page '/tickets/:id'                    { label: ticketLabel }
 *     @page '/tickets/:id/interventions/:n'   { label: 'Intervention :n' }
 *
 * Three declarations, no arrays, and nothing in any page to go stale. The middle one names a
 * FUNCTION, which is how a crumb names the record rather than the route — the rows below read
 * what the ticket is called, not «Ticket 1». The last assertion here is
 * the one a hand-written array cannot pass: nothing in `app.pdx` or in the three pages mentions a
 * crumb, so a renamed route renames the breadcrumb by itself.
 */
import { test, expect, type Page } from '@playwright/test';

const crumbs = (page: Page) => page.locator('[data-test="crumbs"] .pdx-breadcrumb-item');

test('a deep link shows the whole trail, without the page assembling one', async ({ page }) => {
    await page.goto('/tickets/1/interventions/2');
    await expect(crumbs(page)).toHaveCount(3);

    await expect(crumbs(page)).toHaveText([/Tickets/, /T-1000 · Printer on floor 2 is jammed/, /Intervention 2/]);
});

test('the params are in the crumbs, because "1" is not a name', async ({ page }) => {
    // A crumb reading "Ticket" on every ticket would be a heading, not a trail. Two declarative
    // forms reach the record: a string that names a param (`'Intervention :n'`) and a function the
    // page declares, which is the only one that can say what the record is CALLED.
    await page.goto('/tickets/1/interventions/2');

    await expect(crumbs(page).nth(1)).toHaveText(/T-1000 · Printer on floor 2 is jammed/);
    await expect(crumbs(page).nth(2)).toHaveText(/Intervention 2/);
});

test('every crumb but the last is a link, and the last says it is the page', async ({ page }) => {
    await page.goto('/tickets/1/interventions/2');
    await expect(crumbs(page)).toHaveCount(3);

    const links = page.locator('[data-test="crumbs"] a');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute('href', '/tickets');
    await expect(links.nth(1)).toHaveAttribute('href', '/tickets/1');

    // The page you are on is not somewhere to go — and a screen reader is told which one it is.
    const current = page.locator('[data-test="crumbs"] [aria-current="page"]');
    await expect(current).toHaveText(/Intervention 2/);
    await expect(current.locator('a')).toHaveCount(0);
});

test('clicking the middle crumb goes there, and the trail shortens', async ({ page }) => {
    await page.goto('/tickets/1/interventions/2');
    await expect(crumbs(page)).toHaveCount(3);

    await page.locator('[data-test="crumbs"] a', { hasText: 'T-1000' }).click();

    await expect(page).toHaveURL(/\/tickets\/1$/);
    await expect(crumbs(page)).toHaveText([/Tickets/, /T-1000 · Printer on floor 2 is jammed/]);
});

test('the trail follows a navigation the breadcrumb was not told about', async ({ page }) => {
    // Nothing re-renders the breadcrumb on purpose: it reads a signal the router writes.
    // Through the ticket's own tab: the menu lists no record.
    await page.goto('/tickets/1');
    await expect(crumbs(page)).toHaveText([/Tickets/, /T-1000 · Printer on floor 2 is jammed/]);

    await page.locator('[data-test="tab-i2"]').click();

    await expect(crumbs(page)).toHaveText([/Tickets/, /T-1000 · Printer on floor 2 is jammed/, /Intervention 2/]);
});

test('a route with no label contributes no crumb', async ({ page }) => {
    // `/board` and `/intake` declare no label, so they say nothing rather than showing a URL
    // segment a reader already has in the address bar. The control for "derive it from the path".
    await page.goto('/board');

    await expect(crumbs(page)).toHaveCount(0);
});

/**
 * A crumb that names the RECORD, not the route.
 *
 * `label: 'Ticket :id'` is as far as a string goes: it can reach a param, and "1" is not what a
 * ticket is called. `@page '/tickets/:id' { label: ticketLabel }` names a function the page
 * declares, hoisted to module scope and registered by reference — the shape `@loader` has, and for
 * the same reason: a label runs while the breadcrumb builds, outside any
 * component, so it cannot reach `setup(ctx)`.
 *
 * What does NOT change is everything this file is about: the page passes no `items`, the shell's
 * `<pdx-breadcrumb>` is still empty, and the trail is still assembled from the routes that matched.
 */
test('the last crumb names the record, and the trail is still nobody’s array', async ({ page }) => {
    await page.goto('/tickets/1');

    await expect(crumbs(page).nth(1),
        'the crumb names the ROUTE: "Ticket 1" is a path segment with a word in front of it')
        .toHaveText(/T-1000 · Printer on floor 2 is jammed/);

    // The control, and the reason this row lives in THIS file: the page did not assemble a trail.
    await expect(page.locator('[data-test="ticket"] pdx-breadcrumb'))
        .not.toHaveAttribute('items', /./);
    await expect(crumbs(page)).toHaveCount(2);
});

test('and the record’s name survives a navigation, because the function reruns', async ({ page }) => {
    // The crumb is computed per navigation, from the params of the route that matched. Ticket 2 is
    // a different record, so the same declaration has to say something different.
    await page.goto('/tickets/2');
    // Ticket 2 is index 1 of the seed, and its subject is SUBJECTS[(1 * 5) % 12].
    await expect(crumbs(page).nth(1)).toHaveText(/T-1001 · Invoice export ends at row 500/);
});

test('an id the store has no row for still draws a trail', async ({ page }) => {
    // The fallback inside `ticketLabel` is not decoration: a deep link to a record that is not
    // there is the ordinary case for a link someone kept, and a crumb reading «undefined» is worse
    // than a generic one. The crumb is generic; the trail is intact. Generic in the page's language,
    // and naming the number the link asked for: «Ticket 9999», the ticket page's own title key.
    await page.goto('/tickets/9999');

    await expect(crumbs(page)).toHaveText([/Tickets/, /^Ticket 9999$/]);
});

