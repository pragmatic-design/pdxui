/**
 * The showcase, as the production build serves it.
 *
 * The assertions here are about CONTENT, never about status codes. A static build that is a shell
 * with no components in it answers 200 to every request, and `vite preview`'s SPA fallback returns
 * index.html for the files Vite never emitted. A 200 is exactly what a missing file looks like on
 * this server.
 *
 * This is also where `vite build` output is executed, rather than the dev path.
 */
import { test, expect, type Page } from './fixture';
import { demo } from './demo';

/** Wait for the app to have mounted, not merely for the document to have loaded. */
async function open(page: Page, path: string): Promise<void> {
    await page.goto(path);
    await expect(page.locator('pdx-app .app-bar')).toBeVisible();
}

test('the built app mounts its shell and its first page', async ({ page }) => {
    await open(page, '/');

    await expect(page.locator('[data-test="dashboard"] h1')).toHaveText('Service desk');
    // A component from @pdxui/ui, auto-imported by the compiler and registered in the bundle:
    // the dashboard's queue, whose three rows are the seed's open tickets with nobody on them.
    await expect(page.locator('pdx-list .pdx-sortable-item, pdx-list .pdx-list-item')).toHaveCount(3);
});

test('a signal still works after the production compiler has been through it', async ({ page }) => {
    await open(page, '/');

    // The dashboard's counts are a signal the feed writes: a colleague's ticket, pressed from the Demo panel, has
    // to reach the number on screen through whatever the build did to the page.
    const open_ = page.locator('[data-test="kpi-open"] [data-test="kpi-value"]');
    // 15 open in the seed (`src/data/seed.ts`: 5 of every 12), and one raised.
    await expect(open_).toHaveText('15');
    await demo(page, 'push-raise');
    await expect(open_, 'the signal did not update — reactivity did not survive the build')
        .toHaveText('16');
});

test('the page the app is styled by is a real stylesheet, not the index fallback', async ({ page }) => {
    await open(page, '/');

    const sheets = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet]')].map(l => l.href));
    expect(sheets.length, 'the build emitted no stylesheet').toBeGreaterThan(0);

    const res = await page.evaluate(async (href) => {
        const r = await fetch(href);
        return { status: r.status, body: (await r.text()).slice(0, 40) };
    }, sheets[0]);
    expect(res.status).toBe(200);
    expect(res.body, 'a missing asset is answered with index.html').not.toContain('<!DOCTYPE');
});

test.describe('extracting the component CSS did not change the cascade', () => {
    /**
     * A component's scoped block written into `<head>` when its module is evaluated — that is,
     * AFTER the design system's stylesheet — also wins by arriving last. Extracted, it lands
     * wherever the bundler puts it in the emitted stylesheet, and that reason is gone. Two others
     * remain: scoping adds `[data-pdx-…]` to the selector, and the design
     * system declares its rules inside `@layer pdx.*` while a component's block is unlayered. Both
     * survive extraction — but "survive" is a deduction, and this is the measurement.
     *
     * `font-size` is the property because `.pdx-txt-title` declares it, so there is a real contest.
     * The contest is the dashboard's KPI value — `.kpi-value { font-size: 2.25rem }` on an element
     * that also carries `.pdx-txt-title`.
     */
    const fontSize = (page: Page, selector: string): Promise<number> =>
        page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    test('a component rule beats the design-system class it overrides', async ({ page }) => {
        await open(page, '/');
        expect(await fontSize(page, '[data-test="kpi-value"]'),
            'the design system won — the component block no longer beats it').toBe(36);
    });

    test('control — the design-system rule is live, and it is what the override displaces', async ({ page }) => {
        // Same class, same page, not targeted by the component's block: the page's own `h1`.
        // Without this, the test above would also pass on a build where `.pdx-txt-title` had
        // stopped applying at all, which is a different defect wearing the same green.
        await open(page, '/');
        const plain = await fontSize(page, '[data-test="title"]');

        expect(plain, 'the design system did not load — the title is at the browser default')
            .toBeGreaterThan(20);
        expect(plain, 'the override reached the control too, so it measures nothing').not.toBe(36);
    });
});

test.describe('nested routes, in the built app', () => {
    test('a child route renders inside its parent', async ({ page }) => {
        await open(page, '/tickets/1/interventions/2');

        await expect(page.locator('[data-test="ticket"] h1'), 'the parent page is not on screen')
            .toHaveText('Ticket 1');
        await expect(page.locator('[data-test="intervention"] h2')).toHaveText('Intervention 2');
        await expect(
            page.locator('[data-test="ticket"] [data-test="intervention"]'),
            'the child rendered outside its parent — the chain did not survive the production router',
        ).toHaveCount(1);
    });

    test('both levels of params reach the child', async ({ page }) => {
        await open(page, '/tickets/1/interventions/2');
        await expect(page.locator('[data-test="intervention-ticket"]')).toHaveText('1');
    });

    test('moving between children does not remount the parent', async ({ page }) => {
        await open(page, '/tickets/1/interventions/2');
        const before = await page.locator('[data-test="ticket-mounts"]').textContent();

        await page.evaluate(() => history.pushState(null, '', '/tickets/1/interventions/3'));
        await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
        await expect(page.locator('[data-test="intervention"] h2')).toHaveText('Intervention 3');

        await expect(page.locator('[data-test="ticket-mounts"]'),
            'the parent was rebuilt for a change that only concerned the child').toHaveText(before!);
    });

    test('a bare parent URL is the parent alone, not a 404', async ({ page }) => {
        await open(page, '/tickets/1');

        await expect(page.locator('[data-test="ticket"] h1')).toHaveText('Ticket 1');
        await expect(page.locator('[data-test="intervention"]')).toHaveCount(0);
        await expect(page.locator('text=Page not found')).toHaveCount(0);
    });
});

test('the app logs nothing to the console while it boots', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));

    await open(page, '/tickets/1/interventions/2');
    expect(errors).toEqual([]);
});
