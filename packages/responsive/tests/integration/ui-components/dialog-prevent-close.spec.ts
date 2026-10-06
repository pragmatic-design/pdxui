// `prevent-close` does what the site says it does.
//
// It is declared on the component, documented in the props table, described in prose as "intercept
// close attempts", and shown in a live demo. A component that declares it and never reads it lets a
// dialog that must be answered be dismissed with Escape, never to come back.
//
// The semantics are the ones the name states: the prop blocks the USER's ways out — Escape, the
// backdrop, the ✕ — and not the author's. `close()` is the author asking, and it closes. The default
// does not block anything.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=dialog-prevent-close';

type Read = { open: boolean; panelPresent: boolean; beforeCloseCount: number };

async function open(page: Page): Promise<void> {
    await openPage(page, BASE);
    await page.evaluate(() => (window as unknown as { __gotcha: { openDialog(): void } }).__gotcha.openDialog());
    await page.waitForSelector('.pdx-dialog-backdrop[data-open]');
    await page.waitForTimeout(300);
}

function read(page: Page): Promise<Read> {
    return page.evaluate(() => (window as unknown as { __gotcha: { read(): Read } }).__gotcha.read());
}

async function act(page: Page, name: 'pressEscape' | 'clickX' | 'clickBackdrop' | 'callClose'): Promise<void> {
    await page.evaluate((n) => (window as unknown as { __gotcha: Record<string, () => void> }).__gotcha[n](), name);
    await page.waitForTimeout(300);
}

test.describe('pdx-dialog with prevent-close', () => {
    for (const [label, action] of [
        ['Escape', 'pressEscape'],
        ['the ✕', 'clickX'],
        ['the backdrop', 'clickBackdrop'],
    ] as const) {
        test(`${label} does not close it`, async ({ page }) => {
            await open(page);
            expect((await read(page)).open, 'it opened').toBe(true);

            await act(page, action);
            const m = await read(page);
            expect(m.open, `${label} closed a dialog that says prevent-close`).toBe(true);
            expect(m.panelPresent, 'and the panel is still on screen').toBe(true);
        });
    }

    test('still tells the consumer someone tried', async ({ page }) => {
        // Blocking silently would be worse than closing: an app wanting "are you sure?" needs to know
        // the attempt happened.
        await open(page);
        await act(page, 'pressEscape');
        expect((await read(page)).beforeCloseCount, 'pdx-before-close still fires').toBeGreaterThan(0);
    });

    test('close() from the author still closes it', async ({ page }) => {
        // The prop blocks the USER's exits, not the author's. Without this the consumer would have no
        // way out except assigning `open = false`, and `close()` would be a method that lies.
        await open(page);
        await act(page, 'callClose');
        const m = await read(page);
        expect(m.open, 'close() is the author asking, and it is answered').toBe(false);
    });
});
