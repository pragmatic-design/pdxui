/**
 * Every screen of the design review, at every width, in both schemes.
 *
 * List, detail, the create modal, the empty and the error state ·
 * 1440, 1024 and 390 · light and dark · the design-score reading beside each.
 *
 * Two states are reached the way the suites already reach them, so what is photographed is what is
 * tested: the EMPTY state is a filter that matches nothing (`?status=archiviato`, tickets-crud.spec)
 * — the «nothing yet» state cannot be reached, the mock always has rows — and the ERROR is the
 * server refusing a bulk archive (`refuse-next`, after-the-action.spec).
 *
 * Writes the PNGs and a `manifest.json` to `test-results/review/`.
 */
import { test, expect, type Page } from '@playwright/test';
import { demo } from '../demo';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', '..', 'test-results', 'review');
const SCORE = resolve(HERE, '..', '..', '..', 'responsive', 'design-score', 'latest.json');

const WIDTHS = [1440, 1024, 390];
const SCHEMES = ['light', 'dark'] as const;

interface Screen {
    id: string;
    title: string;
    /** The route the design score measured this screen on, if it did. */
    scored?: string;
    open(page: Page): Promise<void>;
}

const openList = async (page: Page, query = '') => {
    await page.goto(`/tickets${query}`);
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
};

const SCREENS: Screen[] = [
    {
        id: 'list', title: 'List', scored: '/tickets',
        async open(page) {
            await openList(page);
            await expect(page.locator('[data-test="grid"] [role="gridcell"]').first()).toBeVisible();
        },
    },
    {
        id: 'detail', title: 'Detail', scored: '/tickets/1',
        async open(page) {
            await page.goto('/tickets/1');
            await expect(page.locator('[data-test="ticket"]')).toBeVisible();
        },
    },
    {
        id: 'create', title: 'Create (modal)',
        async open(page) {
            await openList(page);
            await page.locator('[data-test="new"] button').click();
            await expect(page.locator('[data-test="create-dialog"] .pdx-dialog-panel')).toBeVisible();
        },
    },
    {
        id: 'empty', title: 'Empty (a filter that matches nothing)',
        async open(page) {
            await openList(page, '?status=archiviato');
            await expect(page.locator('[data-test="empty-filtered"]')).toBeVisible();
        },
    },
    {
        id: 'error', title: 'Error (the server refuses an archive)',
        async open(page) {
            await openList(page);
            await demo(page, 'refuse-next');
            const row = page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') }).first();
            await row.locator('input[type="checkbox"]').check();
            await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive|delete/i }).first().click();
            await expect(page.locator('.pdx-toast').filter({ hasText: /referenced by an open intervention/i })).toBeVisible();
        },
    },
];

/** A colour read mid-transition is a colour neither scheme paints. */
async function settled(page: Page): Promise<void> {
    await page.waitForFunction(() => document.getAnimations()
        .filter((a) => a instanceof CSSTransition)
        .every((a) => a.playState !== 'running'));
}

test('capture the design review', async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const shots: { screen: string; title: string; width: number; scheme: string; file: string }[] = [];

    for (const scheme of SCHEMES) {
        for (const width of WIDTHS) {
            // A fresh context per scheme and width: the scheme is the visitor's stored choice, which
            // core reads at boot — the same way a returning visitor sees it.
            const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US' });
            await context.addInitScript((s) => localStorage.setItem('pdx-scheme', s), scheme);
            const page = await context.newPage();

            for (const screen of SCREENS) {
                await screen.open(page);
                expect(await page.evaluate(() => document.documentElement.getAttribute('pdx-scheme'))).toBe(scheme);
                await settled(page);
                const file = `${screen.id}-${width}-${scheme}.png`;
                await page.screenshot({ path: join(OUT, file), fullPage: screen.id !== 'create' });
                shots.push({ screen: screen.id, title: screen.title, width, scheme, file });
            }
            await context.close();
        }
    }

    const score = existsSync(SCORE) ? JSON.parse(readFileSync(SCORE, 'utf8')) : null;
    const scores = Object.fromEntries(SCREENS.map((s) => [s.id,
        s.scored && score ? Object.fromEntries(WIDTHS.map((w) => [w, score[`${s.scored}@${w}`] ?? null])) : null]));

    writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({
        captured: new Date().toISOString(),
        screens: SCREENS.map((s) => ({ id: s.id, title: s.title, scored: s.scored ?? null })),
        widths: WIDTHS,
        schemes: SCHEMES,
        shots,
        scores,
    }, null, 2)}\n`);
    console.log(`${shots.length} screenshots in ${OUT}`);
});
