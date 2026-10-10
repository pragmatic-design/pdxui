// The landing page is a service desk's dashboard.
//
// It is what a desk opens in the morning: four counts, each one the way into the list it counts;
// the tickets nobody has taken yet; and the load by status and by priority.
//
// The numbers are the SEED's, and the seed is arithmetic (`src/data/seed.ts`): 36
// tickets, the status on a 12-step cycle of 5 open / 3 waiting / 4 closed — so 15 / 9 / 12 — and the
// assignee cycling nobody / three agents, shifted by one every fourth ticket. The open ones with
// nobody on them are ids 1, 8 and 17 (T-1000, T-1007, T-1016), opened on the 1st, 8th and 17th:
// three, in that order.
import { test, expect, type Page } from './fixture';
import { demo } from './demo';

const tile = (page: Page, key: string) => page.locator(`[data-test="kpi-${key}"]`);
const value = (page: Page, key: string) => page.locator(`[data-test="kpi-${key}"] [data-test="kpi-value"]`);

async function openDashboard(page: Page, height = 900): Promise<void> {
    await page.setViewportSize({ width: 1440, height });
    await page.goto('/');
    await expect(page.locator('[data-test="dashboard"]')).toBeVisible();
}

test('four counts, and they are the store\'s', async ({ page }) => {
    await openDashboard(page);
    await expect(value(page, 'open')).toHaveText('15');
    await expect(value(page, 'waiting')).toHaveText('9');
    await expect(value(page, 'closed')).toHaveText('12');
    await expect(value(page, 'unassigned')).toHaveText('3');
});

for (const [key, query, matching] of [
    ['open', '?status=open', '15 matching'],
    ['waiting', '?status=waiting', '9 matching'],
    ['closed', '?status=closed', '12 matching'],
    ['unassigned', '?status=open&assignee=none', '3 matching'],
] as const) {
    test(`the «${key}» count is the way into the list it counts`, async ({ page }) => {
        await openDashboard(page);
        await tile(page, key).click();
        // The query matched literally: its `?` is a metacharacter, and so would be any `.` or `+` (#72).
        await expect(page).toHaveURL(new RegExp(`/tickets${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
        // The same number on both sides: a tile that says 3 and a list that shows 36 is a lie.
        await expect(page.locator('[data-test="total"]')).toHaveText(matching);
    });
}

test('the queue: the open tickets nobody has taken, oldest first, each one a way in', async ({ page }) => {
    await openDashboard(page);
    const rows = page.locator('[data-test="queue"] .pdx-list-item');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('T-1000');
    await expect(rows.last()).toContainText('T-1016');

    await rows.first().click();
    await expect(page).toHaveURL(/\/tickets\/1$/);
});

test('the counts are live: a ticket raised at another desk is counted without a reload', async ({ page }) => {
    await openDashboard(page);
    await expect(value(page, 'open')).toHaveText('15');
    // A colleague's ticket is raised open and unassigned (`live.ts`), so two counts move.
    await demo(page, 'push-raise');
    await expect(value(page, 'open'), 'the count did not follow the server').toHaveText('16');
    await expect(value(page, 'unassigned')).toHaveText('4');
    await expect(page.locator('[data-test="queue"] .pdx-list-item')).toHaveCount(4);
});

test('the charts are not in the first payload: fetched when scrolled into view', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (r) => {
        if (r.resourceType() === 'script') scripts.push(r.url().split('/').pop() ?? '');
    });
    // Short, so the charts start below the fold AND below the trigger's 100px of `rootMargin`
    // (`core/src/renderer/defer.ts`): at 560 the whole page fits and `@defer` fires at once.
    await openDashboard(page, 360);
    const top = await page.locator('[data-test="charts"]').evaluate((el) => el.getBoundingClientRect().top);
    expect(top, 'the charts are within reach of the trigger: this row would measure nothing').toBeGreaterThan(360 + 100);
    await expect(page.locator('[data-test="chart-status"]'), 'the chart was built before its trigger').toHaveCount(0);
    expect(scripts.filter((s) => s.includes('chart')),
        'the chart is in the landing payload — @defer postponed only the render').toEqual([]);

    await page.locator('[data-test="charts"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-test="chart-status"]')).toBeVisible();
    await expect(page.locator('[data-test="chart-priority"]')).toBeVisible();
    await expect.poll(() => scripts.filter((s) => s.includes('chart')).length,
        { message: `no chart chunk was fetched on scroll (${scripts.join(', ')})` }).toBeGreaterThan(0);
});

test('the status chart is a doughnut whose legend names its slices', async ({ page }) => {
    // A doughnut's legend names its slices, not its series: a doughnut has one series.
    await openDashboard(page);
    await page.locator('[data-test="charts"]').scrollIntoViewIfNeeded();
    const chart = page.locator('[data-test="chart-status"]');
    await expect(chart).toHaveAttribute('type', 'doughnut');
    await expect(chart.locator('.pdx-chart-legend-item'), 'the slices are named by nothing')
        .toHaveText(['Open', 'Waiting', 'Closed']);
});

// ─── The seed looks like a desk ──────────────────────────────────
//
// Status and priority cycled on the same index give 12 / 12 / 12, every open ticket low and every
// waiting one normal — no open work high — and a queue reading one subject three times. A chart
// honest about that data makes the data look fake. These rows hold the SHAPE, not the numbers.

test('the status counts are not all the same', async ({ page }) => {
    await openDashboard(page);
    const counts = await Promise.all(['open', 'waiting', 'closed'].map(k => value(page, k).innerText()));
    expect(new Set(counts).size, `the counts read ${counts.join(' / ')}`).toBeGreaterThan(1);
});

test('the open work spans every priority: no bar of the priority chart is empty', async ({ page }) => {
    await openDashboard(page);
    await page.locator('[data-test="charts"]').scrollIntoViewIfNeeded();
    // The chart's data table: what a screen reader reads, and the numbers the bars are drawn from.
    const cells = page.locator('[data-test="chart-priority"] .pdx-chart-data tbody td');
    await expect(cells).toHaveCount(3);
    const values = (await cells.allInnerTexts()).map(t => Number(t.replace(/\D/g, '')));
    expect(values.every(v => v > 0), `the bars read ${values.join(' / ')}`).toBe(true);
});

test('the queue is different tickets: no subject twice', async ({ page }) => {
    await openDashboard(page);
    const rows = page.locator('[data-test="queue"] .pdx-list-item');
    await expect(rows.first()).toBeVisible();
    // «T-1000 · Printer on floor 2 is jammed · Northwind»: the subject is the middle part.
    const subjects = (await rows.allInnerTexts()).map(t => t.split('·')[1]?.trim());
    expect(new Set(subjects).size, `the queue reads ${subjects.join(' | ')}`).toBe(subjects.length);
});

test('control — the page carries no build instrument any more', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole('button', { name: /one more|uno in più/i })).toHaveCount(0);
    await expect(page.locator('[data-test="dashboard"]')).not.toContainText(/cascade|cascata/i);
});
