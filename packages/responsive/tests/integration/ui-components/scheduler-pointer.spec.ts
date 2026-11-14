// pdx-scheduler with the pointer (#1020, part 6), in Chromium with a real mouse.
// - A drag moves an event to another day and hour; `before-move` then `move`, and `events` written.
// - The app refuses with preventDefault(): nothing moves, `rejected` says `prevented`.
// - An edge resizes; a drag over empty slots creates an event; a click is still a click.
// - `prevent-overlap` refuses a place over another event; Escape drops the event back.
// - In the timeline a drag carries an event to another resource's row; in the month, to another day.
//
// On the `scheduler-week`, `scheduler-timeline` and `scheduler-month` scenarios: September 2026 in Rome.
// The week's grid starts at 08:00 with half-hour slots: row 1 is 08:00, row 3 09:00, row 7 11:00;
// Monday 21 is column 0.

import { test, expect, type Page, type Locator } from './contracts/fixture';
import { goToScenario, openPage } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const THEME = THEMES[0];
const root = '[data-test="scheduler"]';

async function open(page: Page, scenario: string) {
    await goToScenario(page, scenario, THEME, { page: scenarioPage[scenario], scheme: schemeFor(THEME) });
    return page.locator(`section:not([hidden]) ${root}`);
}

/** Record the scheduler's events of these names; with `refuse`, preventDefault() the ones named there. */
async function record(page: Page, names: string[], refuse: string[] = []): Promise<void> {
    await page.evaluate(([sel, list, no]) => {
        const w = window as unknown as { __events: { type: string; detail: unknown }[] };
        w.__events = [];
        const host = (document.querySelector(`section:not([hidden]) ${sel}`) ?? document.querySelector(sel)) as HTMLElement;
        for (const n of list) host.addEventListener(n, (e) => { w.__events.push({ type: n, detail: (e as CustomEvent).detail }); if (no.includes(n)) e.preventDefault(); });
    }, [root, names, refuse] as const);
}
type Recorded = { type: string; detail: Record<string, unknown> };
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Recorded[] }).__events);
const model = (page: Page) => page.evaluate((sel) => ((document.querySelector(`section:not([hidden]) ${sel}`) ?? document.querySelector(sel)) as unknown as { events: { id: string; start: string; end: string; resource?: unknown; title: string }[] }).events, root);

async function center(l: Locator): Promise<{ x: number; y: number }> {
    const b = await l.boundingBox();
    if (!b) throw new Error('not on screen');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Press on `from`, drag in steps to `to`, release. */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 6, from.y + 6, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
}

const cell = (s: Locator, row: number, col: number) => s.locator(`[role="gridcell"][data-row="${row}"][data-col="${col}"]`);

test.describe('the scheduler with the pointer, a week', () => {
    test('a drag moves an event to another day and hour, asking first', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-move', 'move', 'event-open']);
        await dragTo(page, await center(s.locator('[data-id="standup"]')), await center(cell(s, 7, 2)));
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-move', 'move']);
        expect(got[1].detail.to).toEqual({ start: '2026-09-23T11:00', end: '2026-09-23T11:30' });
        expect((await model(page)).find((e) => e.id === 'standup')).toEqual(expect.objectContaining({ start: '2026-09-23T11:00', end: '2026-09-23T11:30' }));
        await expect(cell(s, 7, 2).locator('[data-id="standup"]')).toHaveCount(1);
    });

    test('preventDefault() on before-move refuses it: nothing moves, rejected says why', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-move', 'move', 'rejected'], ['before-move']);
        await dragTo(page, await center(s.locator('[data-id="standup"]')), await center(cell(s, 7, 2)));
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-move', 'rejected']);
        expect(got[1].detail).toEqual(expect.objectContaining({ action: 'move', reason: 'prevented' }));
        expect((await model(page)).find((e) => e.id === 'standup')?.start).toBe('2026-09-21T09:00');
        await expect(cell(s, 3, 0).locator('[data-id="standup"]')).toHaveCount(1);
    });

    test('the bottom edge resizes; the end follows the slot under the pointer', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-resize', 'resize']);
        // Review, Tuesday 10:00–12:00: its end dragged into the 13:00 slot (row 11) ends it at 13:30.
        const edge = s.locator('[data-id="review"] [data-part="resizeHandle"][data-edge="end"]');
        await dragTo(page, await center(edge), await center(cell(s, 11, 1)));
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-resize', 'resize']);
        expect(got[1].detail).toEqual(expect.objectContaining({ edge: 'end', to: { start: '2026-09-22T10:00', end: '2026-09-22T13:30' } }));
    });

    test('a drag over empty slots creates an event there', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-create', 'create', 'slot-open']);
        // Thursday 24 (column 3), 14:00 (row 13) to 15:00 (row 15): 14:00–15:30 in Rome, 12:00–13:30 UTC.
        await dragTo(page, await center(cell(s, 13, 3)), await center(cell(s, 15, 3)));
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['before-create', 'create']);
        expect(got[0].detail).toEqual(expect.objectContaining({ start: '2026-09-24T12:00:00.000Z', end: '2026-09-24T13:30:00.000Z', resource: null, allDay: false }));
        const made = (await model(page)).at(-1);
        expect(made).toEqual(expect.objectContaining({ title: 'New event', start: '2026-09-24T12:00:00.000Z', end: '2026-09-24T13:30:00.000Z' }));
        await expect(s.getByRole('button', { name: /^New event, / })).toHaveCount(1);
    });

    test('a click without a drag is still a click, and a drag is not one', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['event-open', 'move']);
        await s.locator('[data-id="standup"]').click();
        await dragTo(page, await center(s.locator('[data-id="review"]')), await center(cell(s, 5, 4)));
        // An edge dragged away and back onto itself: the event stays the same element in its cell, so
        // press and release are on the same handle, which makes a click in the browser. It is the end
        // of a drag that changed nothing, not a click on the event.
        const edge = await center(s.locator('[data-id="standup"] [data-part="resizeHandle"][data-edge="end"]'));
        await page.mouse.move(edge.x, edge.y);
        await page.mouse.down();
        await page.mouse.move(edge.x, edge.y + 90, { steps: 6 });
        await page.mouse.move(edge.x, edge.y, { steps: 6 });
        await page.mouse.up();
        expect((await events(page)).map((e) => e.type)).toEqual(['event-open', 'move']);
    });

    test('Escape during a drag drops the event back', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await record(page, ['before-move', 'move']);
        const from = await center(s.locator('[data-id="standup"]'));
        const to = await center(cell(s, 7, 2));
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await expect(cell(s, 7, 2).locator('[data-id="standup"][data-dragging]')).toHaveCount(1);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        expect(await events(page)).toEqual([]);
        await expect(cell(s, 3, 0).locator('[data-id="standup"]:not([data-dragging])')).toHaveCount(1);
    });

    test('prevent-overlap refuses a place over another event, and says so', async ({ page }) => {
        const s = await open(page, 'scheduler-week');
        await s.evaluate((el) => { (el as unknown as { preventOverlap: boolean }).preventOverlap = true; });
        await record(page, ['before-move', 'move', 'rejected']);
        // Stand-up onto Tuesday 10:30 (row 6, column 1): over Review.
        await dragTo(page, await center(s.locator('[data-id="standup"]')), await center(cell(s, 6, 1)));
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['rejected']);
        expect(got[0].detail).toEqual(expect.objectContaining({ action: 'move', reason: 'overlap' }));
        expect((got[0].detail.conflicts as { id: string }[]).map((e) => e.id)).toEqual(['review']);
    });
});

test.describe('the scheduler receiving a drop from outside', () => {
    // scheduler-external.html: a puck made draggable with useDrag, carrying { title: 'Site visit',
    // duration: 60 }, beside a week from Monday 21 September with Review on Tuesday 10:00–12:00.
    async function openExternal(page: Page): Promise<Locator> {
        await openPage(page, '/scheduler-external.html');
        return page.locator(root);
    }
    const dropPuck = async (page: Page, s: Locator, row: number, col: number) => {
        // useDrag throttles its pointermove to a frame: walk slowly, and let the last frame land.
        const from = await center(page.locator('[data-test="puck"]'));
        const to = await center(cell(s, row, col));
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.mouse.up();
    };

    test('a drop on a slot asks external-drop, then creates the event from the data', async ({ page }) => {
        const s = await openExternal(page);
        await record(page, ['external-drop', 'create']);
        // Thursday 24 (column 3), 14:00 (row 13): an hour, from the data's duration; 12:00 UTC.
        await dropPuck(page, s, 13, 3);
        const got = await events(page);
        expect(got.map((e) => e.type)).toEqual(['external-drop', 'create']);
        expect(got[0].detail).toEqual(expect.objectContaining({ data: { title: 'Site visit', duration: 60 }, start: '2026-09-24T12:00:00.000Z', end: '2026-09-24T13:00:00.000Z', allDay: false }));
        expect((await model(page)).at(-1)).toEqual(expect.objectContaining({ title: 'Site visit', start: '2026-09-24T12:00:00.000Z', end: '2026-09-24T13:00:00.000Z' }));
    });

    test('preventDefault() on external-drop leaves the events as they were', async ({ page }) => {
        const s = await openExternal(page);
        await record(page, ['external-drop', 'create', 'rejected'], ['external-drop']);
        await dropPuck(page, s, 13, 3);
        expect((await events(page)).map((e) => e.type)).toEqual(['external-drop', 'rejected']);
        expect(await model(page)).toHaveLength(1);
    });
});

test.describe('the scheduler with the pointer, timeline and month', () => {
    test('in the timeline a drag carries an event to another resource', async ({ page }) => {
        const s = await open(page, 'scheduler-timeline');
        await record(page, ['move']);
        // The audit, Room A (row 1) from Tuesday, to Room B (row 2) on Wednesday (column 3).
        await dragTo(page, await center(s.locator('[data-id="audit"]')), await center(cell(s, 2, 3)));
        const [moved] = await events(page);
        expect(moved.detail.to).toEqual({ start: '2026-09-23T12:00', end: '2026-09-24T12:00', resource: 'b' });
    });

    test('in the month a drag carries an event to another day, at its own hour', async ({ page }) => {
        const s = await open(page, 'scheduler-month');
        await record(page, ['move']);
        // The call, Tuesday 22 at 10:30 (week row 3, column 1), to Wednesday 30 (row 4, column 2).
        await dragTo(page, await center(s.locator('[data-id="call"]')), await center(cell(s, 4, 2)));
        const [moved] = await events(page);
        expect(moved.detail.to).toEqual({ start: '2026-09-30T10:30', end: '2026-09-30T11:00' });
    });
});
