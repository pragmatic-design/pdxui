// pdx-sortable-list, dragged and typed for real.
//
// The unit suite (packages/ui/tests/unit/sortable-list.test.ts) covers the keyboard path and the
// contract that the component does not touch the caller's array — happy-dom is enough for both,
// because neither depends on where anything is on screen.
//
// A pointer drag does. happy-dom lays nothing out, so a drag there measures rects the test wrote.
// Here the browser lays the rows out and
// Playwright drives mouse.down, a path of mouse.move and mouse.up, and the component's own DOM says
// what happened.
//
// The manifest's keyboard dimension asserts where the focus goes. This asserts what the ROWS do,
// which the keyboard runner has no vocabulary for.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const LABELS = ['Alpha', 'Bravo', 'Charlie'];

declare global {
    interface Window { __sortable: { reorders: { from: number; to: number; id: unknown }[] } }
}

/**
 * The generated tier page, with the scenario the manifest declares — the same page `pnpm certify`
 * measures, so this spec cannot drift onto markup nobody else sees.
 */
async function open(page: Page, scenario = 'sortable-basic'): Promise<void> {
    await openPage(page, `/generated/tier-5b.html?scenario=${scenario}`);
    // Collect what the component emits: the reorder is an event, not a mutation, and the event is
    // the whole contract.
    await page.evaluate(() => {
        window.__sortable = { reorders: [] };
        document.querySelector('pdx-sortable-list')!.addEventListener('pdx-reorder', (e) => {
            window.__sortable.reorders.push((e as CustomEvent).detail);
        });
    });
}

const rowLabels = (page: Page) =>
    page.locator('section:not([hidden]) pdx-sortable-list .pdx-sortable-body').allTextContents();

function handle(page: Page, nth: number) {
    return page.locator('section:not([hidden]) pdx-sortable-list .pdx-sortable-item').nth(nth)
        .locator('.pdx-sortable-handle');
}

/** Press on `from` and walk the pointer to `to`, leaving the button down. */
async function grabAndMove(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
        await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
    }
}

async function centreOf(page: Page, nth: number): Promise<{ x: number; y: number; height: number }> {
    const box = await page.locator('section:not([hidden]) pdx-sortable-list .pdx-sortable-item').nth(nth).boundingBox();
    if (!box) throw new Error(`row ${nth} has no box`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, height: box.height };
}

test.describe('pdx-sortable-list, dragged with a pointer', () => {
    test('the scenario renders the rows the arithmetic below assumes', async ({ page }) => {
        await open(page);
        expect(await rowLabels(page)).toEqual(LABELS);
    });

    test('a row dragged past the next one emits the indices it landed on', async ({ page }) => {
        await open(page);
        const first = await centreOf(page, 0);
        const handleBox = await handle(page, 0).boundingBox();

        // Grab BY THE HANDLE: the component restricts the pointer to it, and a drag from the row's
        // text must do nothing — asserted below.
        await grabAndMove(page,
            { x: handleBox!.x + handleBox!.width / 2, y: handleBox!.y + handleBox!.height / 2 },
            { x: first.x, y: first.y + first.height + 5 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__sortable.reorders)).toEqual([{ from: 0, to: 1, id: 'a' }]);
    });

    test('a drag from the row body, away from the handle, reorders nothing', async ({ page }) => {
        await open(page);
        const box = await page.locator('section:not([hidden]) pdx-sortable-list .pdx-sortable-item').first().boundingBox();
        const from = { x: box!.x + box!.width - 15, y: box!.y + box!.height / 2 };

        await grabAndMove(page, from, { x: from.x, y: from.y + box!.height * 2 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__sortable.reorders),
            'the whole row was draggable — the handle restricts the pointer, and it did not').toEqual([]);
    });

    test('the rows below make room while the drag is in flight', async ({ page }) => {
        await open(page);
        const first = await centreOf(page, 0);
        const handleBox = await handle(page, 0).boundingBox();
        await grabAndMove(page,
            { x: handleBox!.x + handleBox!.width / 2, y: handleBox!.y + handleBox!.height / 2 },
            { x: first.x, y: first.y + first.height + 5 });

        const shifted = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('section:not([hidden]) pdx-sortable-list .pdx-sortable-item')]
                .map((li) => li.style.transform));
        expect(shifted[1], 'the row the pointer passed did not move aside').toMatch(/translateY\(-\d/);
        expect(shifted[2], 'a row the pointer never reached moved anyway').toBe('');

        await page.mouse.up();
    });

    test('a drop leaves no ghost and no inline style behind', async ({ page }) => {
        await open(page);
        const first = await centreOf(page, 0);
        const handleBox = await handle(page, 0).boundingBox();
        await grabAndMove(page,
            { x: handleBox!.x + handleBox!.width / 2, y: handleBox!.y + handleBox!.height / 2 },
            { x: first.x, y: first.y + first.height + 5 });
        await page.mouse.up();

        const left = await page.evaluate(() => ({
            ghosts: document.querySelectorAll('body > .pdx-sortable-item').length,
            styles: [...document.querySelectorAll<HTMLElement>('section:not([hidden]) pdx-sortable-list .pdx-sortable-item')]
                .map((li) => li.style.transform + li.style.opacity),
        }));
        expect(left.ghosts, 'a ghost row outlived the drop').toBe(0);
        expect(left.styles.join(''), 'a row kept a transform or an opacity').toBe('');
    });

    test('a disabled list does not reorder on a drag', async ({ page }) => {
        await open(page, 'sortable-disabled');
        const first = await centreOf(page, 0);
        const handleBox = await handle(page, 0).boundingBox();
        await grabAndMove(page,
            { x: handleBox!.x + handleBox!.width / 2, y: handleBox!.y + handleBox!.height / 2 },
            { x: first.x, y: first.y + first.height + 5 });
        await page.mouse.up();

        expect(await page.evaluate(() => window.__sortable.reorders)).toEqual([]);
    });
});

test.describe('pdx-sortable-list, reordered from the keyboard in a real browser', () => {
    test('Space lifts, an arrow moves the row, Space drops it', async ({ page }) => {
        await open(page);
        await handle(page, 0).focus();

        await page.keyboard.press('Space');
        await expect(page.locator('section:not([hidden]) .pdx-sortable-item-lifted')).toHaveCount(1);

        await page.keyboard.press('ArrowDown');
        expect(await rowLabels(page), 'the row did not move while lifted').toEqual(['Bravo', 'Alpha', 'Charlie']);

        await page.keyboard.press('Space');
        expect(await page.evaluate(() => window.__sortable.reorders)).toEqual([{ from: 0, to: 1, id: 'a' }]);
        await expect(page.locator('section:not([hidden]) .pdx-sortable-item-lifted')).toHaveCount(0);
    });

    test('Escape puts the row back where it was lifted from', async ({ page }) => {
        await open(page);
        await handle(page, 0).focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Escape');

        expect(await rowLabels(page)).toEqual(LABELS);
        expect(await page.evaluate(() => window.__sortable.reorders)).toEqual([]);
        // The focus follows the row back: a cancel that strands the user is a cancel they cannot undo.
        expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Reorder Alpha');
    });

    test('what a screen reader is told is a position, not an index', async ({ page }) => {
        await open(page);
        await handle(page, 0).focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowDown');

        // `announce()` clears the region and writes the message in the NEXT frame — the clear-then-set
        // that makes a screen reader read the same message twice in a row. So the text has to be
        // waited for, not read: read in the same tick, it is green alone and red inside the full
        // certify run, which is a flake in the test, not in the component.
        // `body >` is the announcer's own region: other components have live regions of their own.
        await expect(page.locator('body > [aria-live][role="status"]')).toContainText('Position 2 of 3');

        await page.keyboard.press('Escape');
    });

    test('the lift and the drop are announced too', async ({ page }) => {
        await open(page);
        await handle(page, 0).focus();
        const region = page.locator('body > [aria-live][role="status"]');

        await page.keyboard.press('Space');
        await expect(region).toContainText('Alpha lifted.');

        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Space');
        await expect(region).toContainText('Alpha dropped.');

        await page.keyboard.press('Escape');
    });
});
