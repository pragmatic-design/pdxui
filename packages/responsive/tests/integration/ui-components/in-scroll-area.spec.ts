// A component inside pdx-scroll-area is built once, as it is in a plain div.
//
// A move is a disconnect: if each one sets every component inside up again, a pdx-mention in a
// pdx-scroll-area gets three `.pdx-mention-wrap`, three textareas, three suggestion menus, and the
// user types into the first, whose menu never opens. The scroll area moves its children into a
// viewport a frame after they mount, and useScrollbar wraps that viewport: two moves.
// pdx-app-layout moves the children of its main area the same way, so it is measured too. happy-dom
// connects children before parents and never shows the order a browser produces.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';
import { FRAME_BUILT_TAGS } from './frame-built-components';

type Pair = { tag: string; div: number; area: number };
type Api = {
    pair(tag: string, container?: string): Promise<Pair>;
    mentionInArea(): Promise<{ wraps: number; textareas: number }>;
};

async function open(page: Page): Promise<void> {
    await openPage(page, '/gotchas.html?case=in-scroll-area');
}

test.describe('pdx-mention inside pdx-scroll-area', () => {
    test('builds one wrap and one textarea', async ({ page }) => {
        await open(page);
        const m = await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.mentionInArea());
        expect(m.wraps, 'the mention built itself more than once').toBe(1);
        expect(m.textareas).toBe(1);
    });

    test('typing @Mar opens its menu with an option', async ({ page }) => {
        await open(page);
        await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.mentionInArea());
        const textarea = page.locator('pdx-scroll-area pdx-mention textarea').first();
        await textarea.click();
        await textarea.pressSequentially('@Mar');
        const option = page.locator('pdx-scroll-area pdx-mention [role="option"]').first();
        await expect(option, 'the menu of the textarea the user types into never opened').toBeVisible();
    });
});

// Every component that builds its DOM in a frame: the same element count inside the scroll area as
// in a plain div. The list is the components a form or a panel puts in a scrolling region.
const TAGS = FRAME_BUILT_TAGS;

test.describe('components built in a frame, inside pdx-scroll-area', () => {
    for (const tag of TAGS) {
        test(`${tag} has the same DOM as in a plain div`, async ({ page }) => {
            await open(page);
            const r = await page.evaluate((t) => (window as unknown as { __gotcha: Api }).__gotcha.pair(t), tag);
            expect(r.div, `${tag} did not mount in a plain div: the case measures nothing`).toBeGreaterThanOrEqual(0);
            expect(r.area, `${tag} holds ${r.area} elements in the scroll area and ${r.div} in a div`).toBe(r.div);
        });
    }
});

// pdx-app-layout moves the children without a region into its main area, one frame after mount: the
// same move, so the same list is measured in its main area.
test.describe('components built in a frame, inside pdx-app-layout', () => {
    for (const tag of TAGS) {
        test(`${tag} has the same DOM as in a plain div`, async ({ page }) => {
            await open(page);
            const r = await page.evaluate(([t, c]) => (window as unknown as { __gotcha: Api }).__gotcha.pair(t, c), [tag, 'pdx-app-layout']);
            expect(r.div, `${tag} did not mount in a plain div: the case measures nothing`).toBeGreaterThanOrEqual(0);
            expect(r.area, `${tag} holds ${r.area} elements in the app layout and ${r.div} in a div`).toBe(r.div);
        });
    }
});
