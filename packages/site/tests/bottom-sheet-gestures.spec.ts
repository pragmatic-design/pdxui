/**
 * pdx-bottom-sheet closes the way its demo says, and its detents are reachable from the keyboard.
 * Drag geometry is layout, so this is measured in Chromium.
 *
 * - The release velocity is not the distance between the last pointermove and the pointerup: they
 *   arrive at the same position, about 0, and a fast swipe would never dismiss.
 * - A slow drag to the bottom closes the sheet; it does not snap back to the smallest detent.
 * - The drag handle has a role, a tab stop and a name.
 *
 * The gestures go through CDP with their own timestamps: the component reads the events' time, so
 * the speed of a gesture is what the test says it is, not what a loaded machine makes of it.
 */
import { test, expect, type Page } from '@playwright/test';

const SHEET = 'pdx-bottom-sheet[label="Basic bottom sheet"]';

async function openBasic(page: Page) {
    await page.goto('/components/pdx-bottom-sheet', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open Bottom Sheet' }).first().click();
    const sheet = page.locator(`${SHEET} .pdx-bottom-sheet`);
    await expect(sheet).toHaveAttribute('data-open', '');
    // Settled at its first detent (40% of the viewport) AND arrived: its bottom edge on the viewport's.
    // The height is set at once, but the sheet slides in with a 300 ms transform whose curve ends
    // slowly, so a sheet of the right height can still be 20 px low. Waiting for the height only, the
    // handle is measured on its way up (centre at 465–472 px) and pressed there, while its resting
    // place is 433–461 px: the press sits 4–11 px BELOW the settled handle. The drag starts only when
    // the sheet is still sliding at the press; when it has arrived, the press hits the header, no drag,
    // and the sheet stays open — 2 runs in 10 under four workers.
    const vh = page.viewportSize()!.height;
    await expect.poll(async () => {
        const b = (await sheet.boundingBox())!;
        return [Math.round(b.height), Math.round(b.y + b.height)];
    }).toEqual([Math.round(vh * 0.4), vh]);
    return sheet;
}

/**
 * Presses the handle, moves through `moves` ([clientY, ms after the press]) and releases at the last
 * position `releaseAt` ms after the press. Each event carries its timestamp.
 */
async function dragHandle(page: Page, moves: [number, number][], releaseAt: number) {
    const box = (await page.locator(`${SHEET} .pdx-bottom-sheet-handle`).boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const t0 = Date.now() / 1000;
    // The CDP union, not `string`: `Input.dispatchMouseEvent` takes four names and a typo in one
    // of them is a test that dispatches nothing.
    const send = (type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel',
        atY: number, ms: number, buttons: number) =>
        cdp.send('Input.dispatchMouseEvent', {
            type, x, y: atY, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1, timestamp: t0 + ms / 1000,
        });
    await send('mousePressed', y, 0, 1);
    for (const [dy, ms] of moves) await send('mouseMoved', y + dy, ms, 1);
    await send('mouseReleased', y + moves[moves.length - 1][0], releaseAt, 0);
    await cdp.detach();
}

test('a fast swipe down from the smallest detent dismisses the sheet', async ({ page }) => {
    const sheet = await openBasic(page);
    // 120 px in 64 ms: about 1900 px/s, released as the finger moves.
    await dragHandle(page, [[30, 16], [60, 32], [90, 48], [120, 64]], 64);
    await expect(sheet).not.toHaveAttribute('data-open');
});

test('the same swipe, rested before lifting, snaps back to the smallest detent', async ({ page }) => {
    // The control: without the rest this closes. It also proves Chromium stamps the events with the
    // CDP timestamps — with the handling time, the release would follow the last move and read fast.
    const sheet = await openBasic(page);
    await dragHandle(page, [[30, 16], [60, 32], [90, 48], [120, 64]], 400);
    const vh = page.viewportSize()!.height;
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.height)).toBe(Math.round(vh * 0.4));
    await expect(sheet).toHaveAttribute('data-open', '');
});

test('a slow drag to the bottom closes the sheet', async ({ page }) => {
    const sheet = await openBasic(page);
    const box = (await page.locator(`${SHEET} .pdx-bottom-sheet-handle`).boundingBox())!;
    const toBottom = page.viewportSize()!.height - 4 - (box.y + box.height / 2);
    // Down to the bottom edge over 1.2 s, then a 300 ms rest: a slow release, below half the smallest detent.
    const moves: [number, number][] = Array.from({ length: 12 }, (_, i) => [toBottom * (i + 1) / 12, 100 * (i + 1)]);
    await dragHandle(page, moves, 1500);
    await expect(sheet).not.toHaveAttribute('data-open');
});

test('the handle is a named slider: ArrowUp raises the sheet to the next detent', async ({ page }) => {
    const sheet = await openBasic(page);
    const handle = page.getByRole('slider', { name: 'Sheet height' });
    await handle.focus();
    await expect(handle).toBeFocused();
    const before = (await sheet.boundingBox())!.height;
    await page.keyboard.press('ArrowUp');
    const vh = page.viewportSize()!.height;
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.height)).toBe(Math.round(vh * 0.85));
    expect(before).toBeLessThan(vh * 0.85);
    await expect(handle).toHaveAttribute('aria-valuenow', '1');
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.height)).toBe(Math.round(vh * 0.4));
    // Escape from the handle closes the sheet, through the overlay stack.
    await page.keyboard.press('Escape');
    await expect(sheet).not.toHaveAttribute('data-open');
});
