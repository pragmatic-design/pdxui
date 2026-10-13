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
import { test, expect, type Page } from './fixture';

const PAGES = [
    // Ready means the data is in, not the frame: a page measured before its data is a smaller page.
    { path: '/', ready: '[data-test="kpi-open"]' },
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

test('the API says version 2', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-test="dashboard"]')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __PDX_DEVTOOLS__: Devtools }).__PDX_DEVTOOLS__.v)).toBe(2);
});
