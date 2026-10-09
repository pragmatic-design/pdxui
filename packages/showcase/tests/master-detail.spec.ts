/**
 * Master-detail on nested routes: the child changes, the parent does not.
 *
 * `production-build.spec.ts` already asserts that a child renders inside its parent and that a
 * `history.pushState` between two children does not remount it. This is the rest, and the
 * difference that matters is that these navigate the way a person does — by CLICKING a link — so
 * what is exercised is `<pdx-link>`, the router and the outlet together, not a synthetic popstate.
 *
 * The parent's mount counter lives on `globalThis` and outlives the component on purpose
 * (`ticket.pdx`), which is what makes "the parent was not rebuilt" a measurement rather than an
 * impression.
 */
import { test, expect, type Page } from './fixture';

/** Sign in through the form, as a person does — the same steps as `auth.spec.ts`. */
async function signIn(page: Page, username: string): Promise<void> {
    await page.goto('/login?next=%2Faccount');
    await expect(page.locator('[data-test="login-form"]')).toBeVisible();
    await page.locator('[data-test="username"] input').fill(username);
    await page.locator('[data-test="password"] input').fill('pdx');
    await page.locator('[data-test="sign-in"] button').click();
    await expect(page.locator('[data-test="login"]'), 'the sign-in did not complete').toHaveCount(0);
}

async function openTicket(page: Page, path = '/tickets/1/interventions/2'): Promise<void> {
    await page.goto(path);
    await expect(page.locator('[data-test="ticket"] h1')).toBeVisible();
}

const mounts = (page: Page) => page.locator('[data-test="ticket-mounts"]').textContent();

test('clicking through three children never rebuilds the parent', async ({ page }) => {
    await openTicket(page);
    const before = await mounts(page);

    await page.locator('[data-test="tab-i3"]').click();
    await expect(page.locator('[data-test="intervention"] h2')).toHaveText('Intervention 3');

    await page.locator('[data-test="tab-i2"]').click();
    await expect(page.locator('[data-test="intervention"] h2')).toHaveText('Intervention 2');

    await page.locator('[data-test="tab-i3"]').click();
    await expect(page.locator('[data-test="intervention"] h2')).toHaveText('Intervention 3');

    expect(await mounts(page), 'the parent was rebuilt for a change that only concerned the child')
        .toBe(before);
});

test('the parent keeps its own state across a child change', async ({ page }) => {
    // Not just the element: the STATE. The section the visitor chose is the parent's, and a child
    // change must not reset it — a counter surviving while the choice is lost would be a counter
    // that proves nothing.
    //
    // A child route is the whole body, so the history steps aside while the child is open; the
    // state is what comes BACK. The history staying on screen under the child would be a stacking
    // of the two.
    await openTicket(page);
    const before = await mounts(page);
    await page.locator('[data-test="tab-history"]').click();
    await expect(page.locator('[data-test="history"]')).toBeVisible();
    await expect(page.locator('[data-test="chart"]')).toBeVisible();

    await page.locator('[data-test="tab-i3"]').click();
    await expect(page.locator('[data-test="intervention"] h2')).toHaveText('Intervention 3');
    await expect(page.locator('[data-test="history"]'), 'the history stayed under the child').toBeHidden();

    await page.goBack();
    await expect(page.locator('[data-test="history"]'),
        'the parent lost the section the user had opened').toBeVisible();
    await expect(page.locator('[data-test="chart"]'), 'the chart was built again').toHaveCount(1);
    expect(await mounts(page), 'the parent was rebuilt').toBe(before);
});

// Worth knowing: a row that only asserts the parent passes when the tab never navigates at all —
// a broken `<pdx-link>` property binding, say. A green assertion about a link that does nothing.

test('a refused tab keeps the ticket on screen, and says no where the tab was', async ({ page }) => {
    // A child's 403 renders in its parent's outlet. A `__pdx_guard_redirect` that is the string
    // '/login' would send every denial to the sign-in form before the refusal could be rendered —
    // including for a visitor who is already signed in, and whose problem a login cannot fix.
    //
    // `billing.pdx` declares `@guard 'tickets.billing'` and no role in this showcase holds it, so
    // the tab is refused for everybody: a fixture that cannot pass by accident.
    await signIn(page, 'admin');
    await openTicket(page);
    const before = await mounts(page);

    await page.locator('[data-test="tab-billing"]').click();

    // By NAME, not by position: the refusal renders its own h1 inside the ticket, which is the
    // point of the fix — `[data-test="ticket"] h1` matches two elements once it works.
    await expect(page.getByRole('heading', { name: 'Ticket 1' }),
        'the whole page went down for a permission on one of its tabs').toBeVisible();
    await expect(page.locator('[data-test="tabs"]'), 'the tabs went with it').toBeVisible();
    await expect(page.locator('[data-test="billing"]'), 'the refused page rendered anyway')
        .toHaveCount(0);

    // The refusal, where the tab's content would have been — inside the parent, not instead of it.
    const refusal = page.locator('[data-test="ticket"]').getByRole('alert', { name: /403/ });
    await expect(refusal, 'no refusal was shown at all').toBeVisible();
    await expect(refusal.locator('h1')).toHaveText('403');

    expect(new URL(page.url()).pathname,
        'the visitor was sent somewhere instead of being refused').toBe('/tickets/1/billing');
    expect(await mounts(page), 'the parent was rebuilt around the refusal').toBe(before);
});

test('control — a visitor whose session ends here goes to the login, not to a refusal', async ({ page }) => {
    // The other half of the same decision: with no session, the login is exactly what the visitor
    // needs. No guest reaches this ticket — every route is behind the login — so the session ENDS
    // on the page — and the sign-in carries the page to come back to.
    await page.goto('/tickets/1/interventions/2');
    await expect(page.locator('[data-test="ticket"] h1')).toBeVisible();

    await page.locator('[data-test="session"] [data-test="profile"]').click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page.locator('[data-test="login"]'),
        'a visitor with no session was refused instead of being asked to sign in').toBeVisible();
    expect(new URL(page.url()).pathname + new URL(page.url()).search)
        .toBe('/login?next=%2Ftickets%2F1%2Finterventions%2F2');
});

test('a deep link builds the whole chain from cold', async ({ page }) => {
    // Straight to the child URL, nothing loaded before it: the parent, its tabs and the child all
    // have to come up from one navigation.
    await page.goto('/tickets/1/interventions/3');
    await expect(page.locator('[data-test="ticket"] h1')).toHaveText('Ticket 1');
    await expect(page.locator('[data-test="tabs"]')).toBeVisible();
    await expect(page.locator('[data-test="ticket"] [data-test="intervention"] h2')).toHaveText('Intervention 3');
});

test('back and forward walk the chain, and the parent still is not rebuilt', async ({ page }) => {
    await openTicket(page);
    const before = await mounts(page);

    await page.locator('[data-test="tab-i3"]').click();
    await expect(page.locator('[data-test="intervention"] h2')).toHaveText('Intervention 3');

    await page.goBack();
    await expect(page.locator('[data-test="intervention"] h2'), 'Back did not return to the first child')
        .toHaveText('Intervention 2');
    await page.goForward();
    await expect(page.locator('[data-test="intervention"] h2')).toHaveText('Intervention 3');

    expect(await mounts(page), 'history navigation rebuilt the parent').toBe(before);
});

test('@defer keeps the chart out of the route payload, and fetches it when the tab is opened', async ({ page }) => {
    // Both halves of what `@defer` promises: the render is postponed AND the code is. The network assertion is what tells
    // them apart — a chart that shipped with the route and was merely hidden would pass a test
    // that only looked at the DOM.
    const scripts: string[] = [];
    page.on('request', (r) => {
        if (r.resourceType() === 'script') scripts.push(r.url().split('/').pop() ?? '');
    });

    await openTicket(page);
    await expect(page.locator('[data-test="chart"]'), 'the chart was built before its trigger').toHaveCount(0);
    await expect(page.locator('[data-test="chart-placeholder"]')).toHaveCount(1);
    expect(scripts.filter(s => s.includes('chart')),
        'the chart is in the route payload — @defer postponed only the render').toEqual([]);

    await page.locator('[data-test="tab-history"]').click();
    await expect(page.locator('[data-test="chart"]'), 'the trigger fired and nothing was built').toBeVisible();

    await expect.poll(() => scripts.filter(s => s.includes('chart')).length,
        { message: `no chart chunk was fetched when the tab was opened (${scripts.join(', ')})` })
        .toBeGreaterThan(0);
});

test('back to a scrolled list lands where it was left', async ({ page }) => {
    // Three things this test has to avoid, and each of them makes it pass or fail for the wrong
    // reason.
    //
    // 1 · A TALL window. Ten rows in one do not scroll, and the assertion becomes 0 against 0.
    //     Hence 420px, and hence the explicit check that the list scrolled at all.
    //
    // 2 · `locator.click()`. **This is what makes scroll restoration look broken.**
    //     Playwright scrolls its target into view before clicking, the link sits at page-y 24,
    //     and at an offset of 400 it is off screen — so the window goes back to 0 BEFORE the
    //     router saves, and the router faithfully saves 0. Measured at the save itself:
    //     `key="/tickets" y=0` with the locator, `y=400` with the click dispatched in the page.
    //     The save, the key and the retry are not at fault.
    //
    // 3 · The BROWSER. `history.scrollRestoration` is `auto` and nothing in the router changes
    //     it, so Chromium restores the offset on a traversal by itself and a green test would
    //     say nothing about this framework. Set to `manual`, only the router can do it — and it
    //     still does: 400 either way.
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto('/tickets');
    await expect(page.locator('[data-test="grid"] [role="row"]').first()).toBeVisible();

    await page.evaluate(() => { history.scrollRestoration = 'manual'; });
    await page.evaluate(() => window.scrollTo(0, 400));
    const left = await page.evaluate(() => window.scrollY);
    expect(left, 'the list did not scroll, so this test would measure 0 against 0').toBeGreaterThan(300);

    // Away through the rail's Board, a favourite on a first visit: the menu lists no single ticket,
    // and what is measured is the way BACK to the list.
    await page.evaluate(() => (document.querySelector('[data-test="to-board"]') as HTMLElement).click());
    await expect(page.locator('.app main [data-test="board"]')).toBeVisible();

    await page.goBack();
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY),
        { message: 'back landed at the top: the offset was saved and not restored' })
        .toBeGreaterThan(left - 60);
});
