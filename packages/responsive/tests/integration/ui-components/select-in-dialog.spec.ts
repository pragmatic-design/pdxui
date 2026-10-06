// A select opened inside a dialog puts its menu under its trigger.
//
// The failure it guards against, at 1440×900: the trigger at x=564 and its dropdown at x=1104 —
// 540px away, with no relation to the trigger — then drifting from y=798 to y=534 as something
// recomputes and gets a different wrong answer.
//
// The cause is the same as on the drawer: an open `.pdx-dialog-panel` resting at
// `transform: scale(1) translateY(0)`. The identity matrix is still an ACTIVE transform, and an
// element carrying one becomes the containing block for every `position: fixed` descendant — so
// the dropdown is positioned against the panel instead of the viewport.
//
// ⚠️ `aria-expanded` is `true` and the listbox is in the accessibility tree throughout, so this is
// invisible to axe and to any assertion that reads ARIA instead of geometry.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=select-in-dialog';

type Read =
    | { ready: false }
    | {
          ready: true; panelTransform: string; dropdownOpen: boolean;
          dx: number; dyFromTriggerBottom: number;
          panelRect: { x: number; y: number; h: number };
      };

async function openBoth(page: Page): Promise<Read> {
    await openPage(page, BASE);
    await page.evaluate(() => (window as unknown as { __gotcha: { openDialog(): void } }).__gotcha.openDialog());
    await page.waitForSelector('.pdx-dialog-panel');
    await page.waitForTimeout(400); // the panel's open transition
    await page.evaluate(() => (window as unknown as { __gotcha: { openSelect(): void } }).__gotcha.openSelect());
    await page.waitForTimeout(300);
    return page.evaluate(() => (window as unknown as { __gotcha: { read(): Read } }).__gotcha.read());
}

test.describe('pdx-select inside pdx-dialog', () => {
    test('the open panel carries no transform', async ({ page }) => {
        const m = await openBoth(page);
        expect(m.ready).toBe(true);
        if (!m.ready) return;
        // 'none' or the identity matrix are NOT the same thing to the layout engine.
        expect(m.panelTransform, 'an open dialog panel must not be a containing block').toBe('none');
    });

    test('the dropdown opens under its trigger, not somewhere else', async ({ page }) => {
        const m = await openBoth(page);
        expect(m.ready).toBe(true);
        if (!m.ready) return;
        expect(m.dropdownOpen, 'the menu is actually open').toBe(true);
        expect(Math.abs(m.dx), `dropdown is ${m.dx}px from its trigger's left edge`).toBeLessThanOrEqual(8);
        expect(Math.abs(m.dyFromTriggerBottom), `and ${m.dyFromTriggerBottom}px from its bottom`).toBeLessThanOrEqual(16);
    });

    test('opening the menu does not move or resize the dialog', async ({ page }) => {
        // The second half of the failure: the panel slides up until its title leaves the box.
        await openPage(page, BASE);
        await page.evaluate(() => (window as unknown as { __gotcha: { openDialog(): void } }).__gotcha.openDialog());
        await page.waitForSelector('.pdx-dialog-panel');
        await page.waitForTimeout(400);
        const before = await page.evaluate(() => {
            const p = document.querySelector('.pdx-dialog-panel')!.getBoundingClientRect();
            return { x: Math.round(p.x), y: Math.round(p.y), h: Math.round(p.height) };
        });

        await page.evaluate(() => (window as unknown as { __gotcha: { openSelect(): void } }).__gotcha.openSelect());
        await page.waitForTimeout(300);
        const m = await openBoth(page);
        expect(m.ready).toBe(true);
        if (!m.ready) return;
        expect(m.panelRect).toEqual(before);
    });
});
