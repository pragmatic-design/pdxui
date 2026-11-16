// pdx-scheduler with a finger (#1020, part 11b), in Chromium with real touches (CDP
// Input.dispatchTouchEvent, a touch context), so the browser's own scrolling is part of what is
// measured. The owner's decision (2026-11-16): a short tap opens an event, a finger that moves
// scrolls the grid, and a long press (~500 ms) lifts the event, which then follows the finger and is
// dropped where it is let go, asking before-move as the mouse does. An edge is dragged the same way.
//
// On `scheduler-week`: the week of Monday 21 September 2026 in Rome, 08:00–18:00 in half hours.
// Stand-up is Monday 09:00–09:30.

import { test, expect, type Page, type Locator, type CDPSession } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

test.use({ hasTouch: true });

const THEME = THEMES[0];
const root = '[data-test="scheduler"]';

async function open(page: Page): Promise<Locator> {
    await goToScenario(page, 'scheduler-week', THEME, { page: scenarioPage['scheduler-week'], scheme: schemeFor(THEME) });
    return page.locator(`section:not([hidden]) ${root}`);
}
async function record(page: Page, names: string[]): Promise<void> {
    await page.evaluate(([sel, list]) => {
        const w = window as unknown as { __events: { type: string; detail: unknown }[] };
        w.__events = [];
        const host = document.querySelector(`section:not([hidden]) ${sel}`) as HTMLElement;
        for (const n of list) host.addEventListener(n, (e) => { w.__events.push({ type: n, detail: (e as CustomEvent).detail }); });
    }, [root, names] as const);
}
const recorded = (page: Page) => page.evaluate(() => (window as unknown as { __events: { type: string }[] }).__events.map((e) => e.type));
const standup = (s: Locator) => s.locator('[data-part="event"][data-id="standup"]');
const standupStart = (s: Locator) => s.evaluate((el) => (el as HTMLElement & { events: { id: string; start: string }[] }).events.find((e) => e.id === 'standup')?.start);
const gridTop = (s: Locator) => s.locator('[data-part="grid"]').evaluate((g) => g.scrollTop);
const slotHeight = (s: Locator) => s.locator('[role="gridcell"][data-row="2"]').first().evaluate((c) => c.getBoundingClientRect().height);

/** A finger: down at (x, y), then along `path`, then up. */
async function finger(cdp: CDPSession, x: number, y: number, path: { x: number; y: number }[], hold?: () => Promise<void>): Promise<void> {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    if (hold) await hold();
    for (const p of path) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** The points from (x, y) down by `dy`, in `n` steps. */
const down = (x: number, y: number, dy: number, n = 6) => Array.from({ length: n }, (_, i) => ({ x, y: y + (dy * (i + 1)) / n }));

test('a long press lifts the event, it follows the finger and is dropped there, asking before-move; the grid does not scroll', async ({ page }) => {
    const s = await open(page);
    await record(page, ['before-move', 'move', 'event-open']);
    const cdp = await page.context().newCDPSession(page);
    const box = (await standup(s).boundingBox())!;
    const step = await slotHeight(s);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const before = await gridTop(s);
    await finger(cdp, x, y, down(x, y, step * 2), async () => {
        // The hold: the event is lifted when the scheduler says it drags.
        await expect.poll(() => s.evaluate((el) => el.matches(':state(dragging)')), { timeout: 2000 }).toBe(true);
    });
    await expect.poll(() => standupStart(s)).toBe('2026-09-21T10:00');
    expect(await recorded(page)).toEqual(['before-move', 'move']);
    expect(await gridTop(s)).toBe(before);
});

test('a finger that moves at once scrolls the grid and moves nothing', async ({ page }) => {
    const s = await open(page);
    await record(page, ['before-move', 'move']);
    const cdp = await page.context().newCDPSession(page);
    const box = (await standup(s).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const before = await gridTop(s);
    await finger(cdp, x, y, Array.from({ length: 8 }, (_, i) => ({ x, y: y - 20 * (i + 1) })));
    await expect.poll(() => gridTop(s)).toBeGreaterThan(before);
    expect(await standupStart(s)).toBe('2026-09-21T09:00');
    expect(await recorded(page)).toEqual([]);
    expect(await s.evaluate((el) => el.matches(':state(dragging)'))).toBe(false);
});

test('a short tap opens the event and moves nothing', async ({ page }) => {
    const s = await open(page);
    await record(page, ['before-move', 'event-open']);
    const box = (await standup(s).boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => recorded(page)).toEqual(['event-open']);
    expect(await standupStart(s)).toBe('2026-09-21T09:00');
});

test('a long press on the end edge resizes the event', async ({ page }) => {
    const s = await open(page);
    const cdp = await page.context().newCDPSession(page);
    const edge = (await standup(s).locator('[data-part="resizeHandle"][data-edge="end"]').boundingBox())!;
    // To the middle of Monday's 9:30 slot (row 4), as the mouse's resize test drags to a cell's centre.
    const to = (await s.locator('[role="gridcell"][data-row="4"][data-col="0"]').boundingBox())!;
    const x = edge.x + edge.width / 2;
    const y = edge.y + edge.height / 2;
    await finger(cdp, x, y, down(x, y, to.y + to.height / 2 - y), async () => {
        await expect.poll(() => s.evaluate((el) => el.matches(':state(dragging)')), { timeout: 2000 }).toBe(true);
    });
    await expect.poll(() => s.evaluate((el) => (el as HTMLElement & { events: { id: string; end: string }[] }).events.find((e) => e.id === 'standup')?.end)).toBe('2026-09-21T10:00');
});
