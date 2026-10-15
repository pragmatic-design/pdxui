/**
 * `__PDX_DEVTOOLS__` v2 on the showcase (#271): `page()` and `outline()` describe a page for an agent
 * in a fraction of a full accessibility snapshot, and lose nothing it can act on.
 *
 * The baselines are docs/language/beta/agents.md → «Acceptance criteria», measured on these four pages
 * by the prototype of 2026-10-11, at ~4 characters per token:
 *
 *   · every named control of `main` is reachable from the outline — listed, or inside a row of data
 *     the outline summarises (reached through the row's ref). The controls are read from Playwright's
 *     own `ariaSnapshot()` of `main`: the reference is not computed by the code under test;
 *   · the page card is ≤ 200 tokens;
 *   · the outline of `main` is ≤ 50% of the full snapshot an agent reads today — agent-browser's,
 *     below.
 *
 * Runs against the dev server: the devtools global exists in development only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from './fixture';

const PAGES = [
    // Ready means the data is in, not the frame: a page measured before its data is a smaller page.
    // The charts are behind a `@defer (viewport)`: the KPIs alone left the measure to whichever of
    // the charts and their placeholder was on screen, 725 or 1190 characters from run to run.
    { path: '/', ready: '[data-test="chart-priority"]' },
    { path: '/customers', ready: '[data-test="customers"] [role="row"]' },
    { path: '/intake', ready: '[data-test="form-intake"] form' },
    { path: '/tickets/12', ready: '[data-test="ticket"]' },
];

const CONTROL = /- (button|link|textbox|searchbox|combobox|checkbox|radio|switch|spinbutton|tab|menuitem|option|slider) "((?:[^"\\]|\\.)*)"/g;

type Devtools = { v: number; page(): unknown; outline(o?: { maxItems?: number }): string };

/**
 * The full snapshot an agent pays for today: the one agent-browser prints, which is Playwright's
 * snapshot for AI — the whole page, a ref on every node. That is what the prototype measured the
 * outline against. It is Playwright's own private method (`_snapshotForAI`), which agent-browser
 * calls; if a Playwright upgrade renames it, this says so instead of measuring nothing.
 */
async function agentSnapshot(page: Page): Promise<string> {
    const p = page as unknown as { _snapshotForAI?: () => Promise<{ full?: string } | string> };
    expect(typeof p._snapshotForAI, 'Playwright no longer has _snapshotForAI: find what agent-browser calls now').toBe('function');
    const snap = await p._snapshotForAI!();
    const full = typeof snap === 'string' ? snap : snap.full ?? '';
    expect(full.length, 'the snapshot for AI came back empty').toBeGreaterThan(0);
    return full;
}

async function describe(page: Page): Promise<{ card: string; outline: string; full: string }> {
    const full = await page.locator('main').ariaSnapshot();
    const { card, outline } = await page.evaluate(() => {
        const dt = (window as unknown as { __PDX_DEVTOOLS__: Devtools }).__PDX_DEVTOOLS__;
        return { card: JSON.stringify(dt.page()), outline: dt.outline() };
    });
    return { card, outline, full };
}

for (const { path, ready } of PAGES) {
    test.describe(`${path}`, () => {
        test.beforeEach(async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.goto(path);
            await expect(page.locator(ready).first()).toBeVisible();
        });

        test('the card is at most 200 tokens, and the outline at most half the full snapshot', async ({ page }) => {
            const { card, outline } = await describe(page);
            const snapshot = await agentSnapshot(page);
            const cardTokens = card.length / 4;
            // The numbers, whether or not they pass: what a change to the outline moved.
            console.log(`[devtools-v2] ${path}: card ${Math.round(cardTokens)} tokens · outline ${outline.length} chars = ${Math.round(100 * outline.length / snapshot.length)}% of ${snapshot.length}`);
            expect(cardTokens, `page() is ${Math.round(cardTokens)} tokens: ${card}`).toBeLessThanOrEqual(200);
            expect(outline.length / snapshot.length, `outline ${outline.length} chars against ${snapshot.length}`).toBeLessThanOrEqual(0.5);
        });

        test('every named control of main is reachable from the outline', async ({ page }) => {
            const { outline, full } = await describe(page);
            const unreachable: string[] = [];
            for (const [, role, raw] of full.matchAll(CONTROL)) {
                const name = raw.replace(/\\(.)/g, '$1');
                if (outline.includes(JSON.stringify(name).slice(0, 101))) continue;
                // Not listed by name: reached through the row of data that holds it, which the outline
                // summarises with its ref.
                const inRow = await page.getByRole(role as Parameters<Page['getByRole']>[0], { name, exact: true })
                    .evaluateAll((els) => els.some((el) => !!el.closest('[data-pdx-item]')));
                if (!inRow) unreachable.push(`${role} "${name}"`);
            }
            expect(unreachable, `controls the outline loses:\n${outline}`).toEqual([]);
        });
    });
}

test('page() on /intake lists the requester and the email as required', async ({ page }) => {
    await page.goto('/intake');
    await expect(page.locator('[data-test="form-intake"] form')).toBeVisible();
    const card = await page.evaluate(() =>
        (window as unknown as { __PDX_DEVTOOLS__: { page(): { forms?: { required?: string[] }[] } } }).__PDX_DEVTOOLS__.page());
    const required = (card.forms ?? []).flatMap((f) => f.required ?? []);
    expect(required).toEqual(expect.arrayContaining(['requester', 'email']));
});

/** The ref the outline gives the requester field of /intake. */
async function requesterRef(page: Page): Promise<string> {
    await expect(page.locator('[data-test="form-intake"] form')).toBeVisible();
    const outline = await page.evaluate(() => (window as unknown as { __PDX_DEVTOOLS__: Devtools }).__PDX_DEVTOOLS__.outline());
    const line = outline.split('\n').find((l) => /textbox "Requester/.test(l));
    expect(line, `no requester field in the outline:\n${outline}`).toBeTruthy();
    return refsIn(line!)[0];
}

// A component's generated id counts the components mounted before it, so it changes with the
// navigation that led to the page: the outline must not give one as a selector (#391).
test('the requester field has the same selector on /intake opened directly and reached after /tickets', async ({ page }) => {
    await page.goto('/intake');
    const direct = await requesterRef(page);

    await page.goto('/tickets');
    // The record drawer mounts its own form fields, which the counters used to count.
    const firstRow = page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') }).first();
    await firstRow.getByRole('button', { name: /open/i }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit' });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    // Inside the app, with no reload: a reload would start the counters again.
    await page.evaluate(() => {
        history.pushState(null, '', '/intake');
        dispatchEvent(new PopStateEvent('popstate'));
    });
    const reached = await requesterRef(page);

    expect(reached, 'the selector changed with the navigation').toBe(direct);
    expect(direct, 'the selector is a generated id').not.toMatch(/pdx-ff-\d/);
    expect(await page.locator(direct).count(), `${direct} does not find one element`).toBe(1);
});

// ─── map() and shell() (#272) ─────────────────────────────────────

type MapRoute = { path: string; params?: { name: string; type: string }[]; title?: string; guard?: string; access?: boolean };

/** Every `@page` the showcase declares, read from its sources: the reference is not the code under test. */
function declaredPages(): string[] {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'pages');
    return readdirSync(dir).filter((f) => f.endsWith('.pdx'))
        .map((f) => /^@page\s+'([^']+)'/m.exec(readFileSync(join(dir, f), 'utf8'))?.[1])
        .filter((p): p is string => !!p);
}

/**
 * The refs an outline gives: each top-level `[…]`, split on ` | ` (a summary's next refs). Brackets
 * and bars inside a quoted name or attribute value are text, so the scan tracks the quotes.
 */
function refsIn(outline: string): string[] {
    const refs: string[] = [];
    let depth = 0;
    let quoted = false;
    let current = '';
    for (let i = 0; i < outline.length; i++) {
        const ch = outline[i];
        if (ch === '\\' && quoted) {
            if (depth > 0) current += ch + outline[i + 1];
            i++;
            continue;
        }
        if (ch === '"') quoted = !quoted;
        else if (!quoted && ch === '[') {
            if (depth++ === 0) { current = ''; continue; }
        } else if (!quoted && ch === ']') {
            if (--depth === 0) { refs.push(...current.split(' | ')); continue; }
        }
        if (depth > 0) current += ch;
    }
    return refs;
}

test('map() lists every @page route with its params, and closes a guarded route the user cannot enter', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-test="dashboard"]')).toBeVisible();
    const map = await page.evaluate(() => (window as unknown as { __PDX_DEVTOOLS__: { map(): MapRoute[] } }).__PDX_DEVTOOLS__.map());
    const declared = declaredPages();
    expect(declared.length, 'no @page read from the sources').toBeGreaterThan(20);
    for (const path of declared) {
        const route = map.find((r) => r.path === path);
        expect(route, `${path} is missing from map()`).toBeDefined();
        // The showcase's params carry no constraint, so each is a string.
        const params = Array.from(path.matchAll(/:([A-Za-z0-9_]+)/g), (m) => ({ name: m[1], type: 'string' }));
        expect(route!.params ?? [], `${path}: params`).toEqual(params);
    }
    // The suite signs in as the admin, whose role does not hold `tickets.billing`
    // (src/data/roles-seed.ts), and does hold `account.read`.
    expect(map.find((r) => r.path === '/tickets/:id/billing')).toMatchObject({ guard: 'tickets.billing', access: false });
    expect(map.find((r) => r.path === '/account')).toMatchObject({ guard: 'account.read', access: true });
});

test('map() names a route by its crumb once its strings are in', async ({ page }) => {
    // The showcase loads its dictionary by section: on /customers the customers' strings are in.
    await page.goto('/customers');
    await expect(page.locator('[data-test="customers"] [role="row"]').first()).toBeVisible();
    const map = await page.evaluate(() => (window as unknown as { __PDX_DEVTOOLS__: { map(): MapRoute[] } }).__PDX_DEVTOOLS__.map());
    expect(map.find((r) => r.path === '/customers')?.title).toBe('Customers');
    // And no route is named by a dictionary key.
    expect(map.filter((r) => r.title && /^[a-z]+(\.[A-Za-z]+)+$/.test(r.title)).map((r) => r.title)).toEqual([]);
});

test('shell() holds the sidebar\'s links and nothing of the route', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.locator('[data-test="customers"] [role="row"]').first()).toBeVisible();
    const shell = await page.evaluate(() => (window as unknown as { __PDX_DEVTOOLS__: { shell(): string } }).__PDX_DEVTOOLS__.shell());
    // The sidebar's links, read from Playwright's own snapshot of it.
    const sidebar = await page.locator('[data-test="sidebar"]').ariaSnapshot();
    const links = Array.from(sidebar.matchAll(/- link "((?:[^"\\]|\\.)*)"/g), (m) => m[1].replace(/\\(.)/g, '$1'));
    expect(links.length, 'no link read in the sidebar').toBeGreaterThan(5);
    for (const name of links) expect(shell, `the sidebar's link "${name}"`).toContain(JSON.stringify(name));
    // Every ref the shell gives is an element outside the route.
    const refs = refsIn(shell);
    expect(refs.length).toBeGreaterThan(0);
    const inside = await page.evaluate((sels) => sels.filter((s) => {
        const el = document.querySelector(s);
        return !el || !!el.closest('[data-pdx-route]');
    }), refs);
    expect(inside, `refs that miss, or land inside the route:\n${shell}`).toEqual([]);
});

test('a session of four pages — the shell once, then a card and an outline each — costs at most 40% of four full snapshots', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let session = 0;
    let full = 0;
    for (const [i, { path, ready }] of PAGES.entries()) {
        await page.goto(path);
        await expect(page.locator(ready).first()).toBeVisible();
        const { card, outline, shell } = await page.evaluate((first) => {
            const dt = (window as unknown as { __PDX_DEVTOOLS__: Devtools & { shell(): string } }).__PDX_DEVTOOLS__;
            return { card: JSON.stringify(dt.page()), outline: dt.outline(), shell: first ? dt.shell() : '' };
        }, i === 0);
        session += shell.length + card.length + outline.length;
        full += (await agentSnapshot(page)).length;
    }
    console.log(`[devtools-v2] session ${Math.round(session / 4)} tokens against ${Math.round(full / 4)} = ${Math.round(100 * session / full)}%`);
    expect(session / full).toBeLessThanOrEqual(0.4);
});

test('the API says version 2', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-test="dashboard"]')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __PDX_DEVTOOLS__: Devtools }).__PDX_DEVTOOLS__.v)).toBe(2);
});
