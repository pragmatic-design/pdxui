// The two drag event models, measured side by side.
//
// This repository has three drag implementations, and the page this spec backs says which answers
// which problem:
//
//   useDrag / useDropZone / useSortable   POINTER events. Intermediate state as signals
//                                         (isDragging, overIndex, edge), and hit-testing done by
//                                         `useDrag` itself from its own pointermove.
//   pdx-data-grid row reorder             HTML5 `dataTransfer` (grid-body.ts), with a per-grid
//                                         token so a row cannot land in another grid.
//   shared/column-chooser.ts              HTML5 again, its own handlers, `onReorder(fromField,
//                                         toField)` — by field NAME, not by index.
//
// The fact the page rests on, and the one a reader meets the first time they try to drag a grid row
// onto a sidebar: **the two models do not meet.** `useDropZone` is hit-tested from `useDrag`'s
// pointermove and listens for no `drag*` event at all, so an HTML5 drag passes straight over it.
// That is asserted here, with Playwright's real drag-and-drop rather than a dispatched event.
//
// Same shape as `repeating-rows-mechanisms.test.ts`: the prose cannot drift from the
// code, because the code is measured next to it.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';
// The `window.__drag` declaration lives in ONE place — two of them do not compose.
import './contracts/drag-harness';


async function open(page: Page): Promise<void> {
    await openPage(page, '/drag-primitives.html?case=mechanisms');
    await expect(page.locator('[data-test="mech-grid"] [role="row"][data-row-index]')).toHaveCount(3);
}

const events = (page: Page) => page.evaluate(() => window.__drag.events);

test.describe('the pointer model: useDrag onto useDropZone', () => {
    test('a pointer drag lights the zone and delivers its data', async ({ page }) => {
        await open(page);
        const puck = (await page.locator('[data-test="mech-puck"]').boundingBox())!;
        const zone = (await page.locator('[data-test="mech-zone"]').boundingBox())!;

        await page.mouse.move(puck.x + puck.width / 2, puck.y + puck.height / 2);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) {
            await page.mouse.move(
                puck.x + puck.width / 2 + ((zone.x + zone.width / 2 - puck.x - puck.width / 2) * i) / 10,
                puck.y + puck.height / 2 + ((zone.y + zone.height / 2 - puck.y - puck.height / 2) * i) / 10);
        }
        await page.evaluate(() => window.__drag.frame());
        expect((await page.evaluate(() => window.__drag.state())).over).toBe(true);

        await page.mouse.up();
        expect(await events(page)).toEqual([
            { type: 'enter', data: { id: 'puck' } },
            { type: 'drop', data: { id: 'puck' } },
        ]);
    });
});

test.describe('the dataTransfer model: the grid reorders its own rows', () => {
    test('a row dragged onto another row emits pdx-row-reorder', async ({ page }) => {
        await open(page);
        const rows = page.locator('[data-test="mech-grid"] [role="row"][data-row-index]');
        await rows.nth(0).dragTo(rows.nth(2));

        const seen = await events(page);
        expect(seen.filter((e) => e.type === 'row-reorder'), 'the grid did not reorder its own row')
            .toEqual([{ type: 'row-reorder', detail: expect.objectContaining({ from: 0, to: 2 }) }]);
    });

    // The fact that decides how the page is written, and it is not the obvious one.
    //
    // A plain mouse press-and-move over a `draggable="true"` element does NOT stay a pointer
    // gesture: the browser PROMOTES it to a native HTML5 drag, and the grid's dragstart/drop fire.
    // Measured — asserting the opposite is red.
    //
    // So the two models are not two gestures a user can tell apart. They are two things the CODE
    // receives from the same gesture, and the choice is made by the element: mark it `draggable` and
    // the browser takes the pointer stream away from you.
    test('a plain mouse drag over a draggable row IS an HTML5 drag: the browser promotes it', async ({ page }) => {
        await open(page);
        const first = (await page.locator('[data-test="mech-grid"] [role="row"][data-row-index]').nth(0).boundingBox())!;
        const third = (await page.locator('[data-test="mech-grid"] [role="row"][data-row-index]').nth(2).boundingBox())!;

        await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) {
            await page.mouse.move(first.x + first.width / 2, first.y + ((third.y - first.y) * i) / 10);
        }
        await page.mouse.up();

        expect(await events(page), 'the browser did not promote the mouse gesture on a draggable row')
            .toEqual([{ type: 'row-reorder', detail: expect.objectContaining({ from: 0, to: 2 }) }]);
    });
});

test.describe('the two models do not meet', () => {
    test('a grid row dragged onto a useDropZone never reaches it', async ({ page }) => {
        await open(page);
        const row = page.locator('[data-test="mech-grid"] [role="row"][data-row-index]').nth(0);
        const zone = page.locator('[data-test="mech-zone"]');

        await row.dragTo(zone);

        expect((await page.evaluate(() => window.__drag.state())).over,
            'the zone lit up for an HTML5 drag — useDropZone is hit-tested from useDrag\'s pointermove and listens for no drag event').toBe(false);
        expect(await events(page),
            'a drop zone received a grid row; the page says the two models are separate').toEqual([]);
    });

    test('and the reverse: a useDrag payload dropped on a grid row is not a reorder', async ({ page }) => {
        await open(page);
        const puck = (await page.locator('[data-test="mech-puck"]').boundingBox())!;
        const row = (await page.locator('[data-test="mech-grid"] [role="row"][data-row-index]').nth(1).boundingBox())!;

        await page.mouse.move(puck.x + puck.width / 2, puck.y + puck.height / 2);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) {
            await page.mouse.move(
                puck.x + puck.width / 2 + ((row.x + row.width / 2 - puck.x - puck.width / 2) * i) / 10,
                puck.y + puck.height / 2 + ((row.y + row.height / 2 - puck.y - puck.height / 2) * i) / 10);
        }
        await page.mouse.up();

        expect((await events(page)).filter((e) => e.type === 'row-reorder'),
            'the grid answered a pointer drop').toEqual([]);
    });
});
