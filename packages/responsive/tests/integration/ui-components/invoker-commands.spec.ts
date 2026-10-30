// A button opens a dialog with no script (#140): `<button commandfor="d" command="--show">` makes
// the browser dispatch a `command` event on `d`, and pdx-dialog calls its exposed `show()`. The
// behaviour is the browser's Invoker Commands API, so it is measured in Chromium; the core half, with
// the event built by hand, is packages/core/tests/expose-commands.test.ts.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=invoker-commands';

type Read = { open: boolean; panelPresent: boolean };

function read(page: Page): Promise<Read> {
    return page.evaluate(() => (window as unknown as { __gotcha: { read(): Read } }).__gotcha.read());
}

test.describe('an exposed method is an invoker command', () => {
    test('command="--show" opens pdx-dialog, and command="--close" closes it', async ({ page }) => {
        await openPage(page, BASE);
        expect((await read(page)).open, 'open before anyone asked').toBe(false);

        await page.locator('[data-test="show"]').click();
        // The host has no box of its own: what is waited for is the state, not a visible host.
        await page.waitForSelector('pdx-dialog:state(open)', { state: 'attached' });
        expect((await read(page)).open).toBe(true);

        await page.locator('[data-test="close"]').click();
        await expect.poll(async () => (await read(page)).open).toBe(false);
    });

    test('the control: a command the dialog does not expose opens nothing', async ({ page }) => {
        await openPage(page, BASE);
        await page.locator('[data-test="nope"]').click();
        // The command event is dispatched during the click; an opened dialog renders its backdrop in
        // the next frame. Two frames after the click, an open would show.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const m = await read(page);
        expect(m.open, '--open is not a method of pdx-dialog').toBe(false);
        expect(m.panelPresent).toBe(false);
    });
});
