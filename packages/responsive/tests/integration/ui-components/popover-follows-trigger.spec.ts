// A panel opened under its trigger stays under it when the trigger changes size.
//
// usePopover places the panel `fixed`, from the trigger's rectangle at the moment it opens, and moves
// it again on a scroll, a window resize, or a change of the panel's own size. A trigger that grows
// after the panel is open — a web font that arrives late and changes the line height, a multi-select
// that gains a row of chips — leaves the panel where it was: over the trigger it is attached to.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';

interface Rects { trigger: { bottom: number }; panel: { top: number } }

async function read(page: Page): Promise<Rects> {
    // Two frames: the page's own event for "a layout change has been through rendering and the
    // observers it fires", not a guess at how long that takes.
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    return page.evaluate(() => {
        const host = document.querySelector('section:not([hidden]) [data-test="sel-open"]')!;
        const trigger = host.querySelector('.pdx-select-trigger')!.getBoundingClientRect();
        const panel = host.querySelector('.pdx-select-dropdown.open')!.getBoundingClientRect();
        return { trigger: { bottom: trigger.bottom }, panel: { top: panel.top } };
    });
}

test.describe('pdx-select: the open panel follows its trigger', () => {
    test.beforeEach(async ({ page }) => {
        await goToScenario(page, 'select-open', 'neutral', { page: 'tier-2' });
    });

    test('the control: opened, the panel sits under the trigger', async ({ page }) => {
        const r = await read(page);
        expect(r.panel.top, 'the panel does not start under the trigger').toBeGreaterThanOrEqual(r.trigger.bottom - 2);
    });

    test('a trigger that grows after the panel opened pushes the panel down with it', async ({ page }) => {
        const before = await read(page);
        await page.evaluate(() => {
            const trigger = document.querySelector<HTMLElement>('section:not([hidden]) [data-test="sel-open"] .pdx-select-trigger')!;
            trigger.style.minHeight = `${trigger.getBoundingClientRect().height + 40}px`;
        });
        const after = await read(page);
        expect(after.trigger.bottom, 'the trigger did not grow, so this measures nothing').toBeGreaterThan(before.trigger.bottom + 30);
        expect(after.panel.top, 'the panel stayed where it was, over the trigger that grew').toBeGreaterThanOrEqual(after.trigger.bottom - 2);
    });
});
