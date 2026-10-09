/**
 * `pdx dev` serves the app's routes.
 *
 * The interpreted router learns what routes exist from `globalThis.__pdx_routes`, and a page module
 * fills it WHEN IT IS IMPORTED. There is no eager glob importing them all — that glob would put
 * every page in the first chunk — so dev needs a route table of its own, or every route renders the
 * router's "404 · Page not found". This file exists because every other spec in this package runs
 * against the build, and none of them would notice.
 *
 * The framework's own rule is that development requires no build, so this is not a small defect in
 * a demo: an app that takes the documented shape has to run in development.
 */
import { test, expect, type Page } from './fixture';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const notFound = (page: Page) => page.getByText('Page not found');

test('the landing route renders its page, not the 404', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-test="dashboard"]'), 'the dev server has no route table')
        .toBeVisible();
    await expect(notFound(page)).toHaveCount(0);
});

test('and so does a route the visitor navigates to', async ({ page }) => {
    await page.goto('/tickets');
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
    await expect(notFound(page)).toHaveCount(0);
});

test('an agent can ask the running page what it shows: __PDX_DEVTOOLS__ v1, as JSON', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-test="dashboard"]')).toBeVisible();
    // What an agent runs through `agent-browser eval`: a string, parsed on the other side.
    const raw = await page.evaluate(() => JSON.stringify((window as unknown as {
        __PDX_DEVTOOLS__: { v: number; inspect(t: string): unknown; route(): unknown };
    }).__PDX_DEVTOOLS__.inspect('pdx-dashboard')));
    const info = JSON.parse(raw) as { tag: string; file?: string; state: Record<string, unknown> };
    expect(info.tag).toBe('pdx-dashboard');
    expect(info.file).toBe('src/pages/dashboard.pdx');
    // A `$signal` of its setup, by the name the author wrote.
    expect(Object.keys(info.state)).toContain('neverReadByAnything');
    const route = await page.evaluate(() => (window as unknown as { __PDX_DEVTOOLS__: { route(): unknown } }).__PDX_DEVTOOLS__.route());
    expect(route).toMatchObject({ path: '/', matched: '/' });
});

test('a GUARDED route is guarded rather than missing', async ({ page }) => {
    // The difference worth keeping apart: a 404 says the route does not exist, and this one does —
    // it is refused. A dev server where every route is a 404 cannot tell the two apart. Signed in
    // (the suite is), the billing's permission is one no role holds: a 403 in the
    // ticket, where the refusal happened — not the login, and not «Page not found».
    await page.goto('/tickets/1/billing');
    await expect(page.locator('[data-test="ticket"]').getByRole('alert', { name: /403/ })).toBeVisible();
    await expect(notFound(page)).toHaveCount(0);
});

test('a page is loaded when it is first shown, not all of them at boot', async ({ page }) => {
    // The half that must NOT come back: the answer is a route table, not an eager glob of every
    // page. Opening `/` must not fetch the board, the intake wizard or the ticket screens.
    const asked: string[] = [];
    page.on('request', (r) => asked.push(r.url()));
    await page.goto('/');
    await expect(page.locator('[data-test="dashboard"]')).toBeVisible();

    const pages = asked.filter((u) => /\/src\/pages\/[a-z-]+\.pdx/.test(u))
        .map((u) => u.replace(/^.*\/src\/pages\//, '').replace(/\?.*$/, ''));
    expect([...new Set(pages)].sort(), 'the dev server imported pages nobody asked for')
        .toEqual(['dashboard.pdx']);
});

test('and the next one arrives on the navigation that needs it', async ({ page }) => {
    // The control for the line above: "imports nothing" would satisfy it perfectly.
    const asked: string[] = [];
    page.on('request', (r) => asked.push(r.url()));
    await page.goto('/');
    await expect(page.locator('[data-test="dashboard"]')).toBeVisible();

    // The rail's entry IS the link: its controls are beside it, so there is no nested «open in a new
    // tab» link for `querySelector('a')` to find instead.
    await page.evaluate(() => (document.querySelector('[data-test="to-board"]') as HTMLElement | null)?.click());
    await expect(page.locator('[data-test="board"]')).toBeVisible();
    expect(asked.some((u) => u.includes('/src/pages/board.pdx')),
        'the board rendered without its module being fetched').toBe(true);
});

test('and it still carries the diagnostics a production build strips', async ({ page }) => {
    // The other half of stripping diagnostics. A production bundle has none of these — `diagnostics.spec.ts`
    // names them — and a change that dropped them from DEV as well would satisfy that test just as
    // completely while deleting the thing they exist for.
    //
    // Read from the module the dev server SERVES, which is where the flag is resolved: Vite
    // replaces `process.env.NODE_ENV` with the mode, so `DEV` arrives as a literal and the branch
    // it guards is either kept or folded before the browser ever sees it.
    const packages = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..').replace(/\\/g, '/');

    const env = await page.request.get(`/@fs/${packages}/core/src/utils/env.ts`);
    expect(env.ok(), 'core/src/utils/env.ts is not being served — this test is reading nothing')
        .toBe(true);
    expect(await env.text(), 'the dev server resolved the dev flag to false')
        .toContain('export const DEV = true');

    const masonry = await page.request.get(`/@fs/${packages}/ui/src/masonry/pdx-masonry.ts`);
    expect(await masonry.text(), 'a diagnostic was removed from the dev build too, not just guarded')
        .toContain('is neither a number nor');
});
