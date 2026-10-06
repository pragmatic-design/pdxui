// Off screen has to mean hidden — to the keyboard and to a screen reader, not only to the eye.
//
// Two places where it can fail:
//
//   · a closed mobile navbar that slides away with a transform and nothing else keeps its four
//     buttons in the tab order: Tab walks into an invisible menu;
//   · a breadcrumb crumb with no `href` rendered as an `<a>` with no `href` is not focusable, not
//     announced as a link — while carrying a click handler that emits `pdx-select`. That is the
//     event-driven route the skill note recommends, so the recommendation would point at an
//     unreachable control.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=';

type NavRead = { hidden: boolean; overlay: boolean; inert: boolean; focusReachable: boolean; viewport: number };
type CrumbRead = { count: number; tags: string[]; focusable: boolean; cursor: string | null; selected: string[] };

async function openCase(page: Page, name: string): Promise<void> {
    await openPage(page, BASE + name);
}

function read<T>(page: Page): Promise<T> {
    return page.evaluate(() => (window as unknown as { __gotcha: { read(): unknown } }).__gotcha.read()) as Promise<T>;
}

test.describe('a closed mobile navbar is out of reach, not just out of sight', () => {
    test('carries inert while it is closed', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openCase(page, 'navbar-collapsed-prop');
        const m = await read<NavRead>(page);
        expect(m.overlay, 'the case is below the breakpoint').toBe(true);
        expect(m.hidden, 'and starts closed').toBe(true);
        expect(m.inert, 'a closed overlay navbar must be inert').toBe(true);
        expect(m.focusReachable, 'nothing inside it can take focus').toBe(false);
    });

    test('gives the focus back when it opens', async ({ page }) => {
        // `inert` that is never removed is worse than none: the menu would open unusable.
        await page.setViewportSize({ width: 390, height: 844 });
        await openCase(page, 'navbar-collapsed-prop');
        await page.evaluate(() =>
            (window as unknown as { __gotcha: { setCollapsed(v: boolean): void } }).__gotcha.setCollapsed(false));
        await page.waitForTimeout(400);
        const m = await read<NavRead>(page);
        expect(m.hidden).toBe(false);
        expect(m.inert, 'an open navbar is not inert').toBe(false);
        expect(m.focusReachable, 'and its entries can be focused').toBe(true);
    });

    test('is not inert on desktop, where it is in the grid', async ({ page }) => {
        // The control: `inert` belongs to the mobile overlay only.
        await page.setViewportSize({ width: 1440, height: 900 });
        await openCase(page, 'navbar-collapsed-prop');
        const m = await read<NavRead>(page);
        expect(m.overlay).toBe(false);
        expect(m.inert).toBe(false);
    });
});

test.describe('a breadcrumb crumb without href', () => {
    test('is focusable, and is a control rather than a dead link', async ({ page }) => {
        await openCase(page, 'breadcrumb-no-href');
        const m = await read<CrumbRead>(page);
        expect(m.count, 'two links plus the current page').toBe(2);
        expect(m.tags.every((t) => t === 'button'), `rendered as ${m.tags.join(', ')}`).toBe(true);
        expect(m.focusable, 'a crumb that emits an event has to be reachable by Tab').toBe(true);
        expect(m.cursor, 'and has to look clickable').toBe('pointer');
    });

    test('still emits pdx-select when activated', async ({ page }) => {
        await openCase(page, 'breadcrumb-no-href');
        await page.evaluate(() => (window as unknown as { __gotcha: { pressFirst(): void } }).__gotcha.pressFirst());
        const m = await read<CrumbRead>(page);
        expect(m.selected.length, 'the event still fires').toBeGreaterThan(0);
        expect(m.selected[0]).toBe('home');
    });
});
