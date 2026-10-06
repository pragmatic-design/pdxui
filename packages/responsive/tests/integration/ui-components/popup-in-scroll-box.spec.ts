// A popup opened inside a box that scrolls is not cut off by that box.
//
// A panel positioned `position: absolute` against the host is clipped by the nearest ancestor with
// `overflow` other than `visible` — a table that scrolls sideways, a scroll area, a card, a drawer
// body: a tree opened inside a scroll box of rows ends past the box's edge, cut.
//
// `pdx-select`, the sibling a reader compares `pdx-tree-select` and `pdx-cascader` with, positions
// its menu `fixed` through usePopover and escapes the box. This spec measures all of them the same
// way, rather than trusting that "CSS absolute is correct".
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=popup-in-scroll-box';

type Read =
    | { ready: false }
    | {
        ready: true; position: string; extendsBelowBox: number; hitIsPanel: boolean; dx: number; dyFromTriggerBottom: number;
        triggerFromBoxLeft: number;
    };

async function openAndRead(page: Page, kind: 'select' | 'tree' | 'cascader' | 'mention', prefix = ''): Promise<Read> {
    await openPage(page, BASE);
    await page.evaluate(([k, p]) => (window as unknown as { __gotcha: { open(k: string, p: string): void } }).__gotcha.open(k, p), [kind, prefix]);
    // Wait for the panel to be displayed and placed, rather than for a number of milliseconds.
    await page.waitForFunction((k) => {
        const r = (window as unknown as { __gotcha: { read(k: string): { ready: boolean } } }).__gotcha.read(k);
        return r.ready;
    }, kind);
    // usePopover places the panel in the animation frame after it opens (`requestAnimationFrame(
    // updatePosition)`). Two frames in the page is that event, not a guess at how long it takes — a
    // fixed 100ms wait is flaky in a parallel run.
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    return page.evaluate((k) => (window as unknown as { __gotcha: { read(k: string): Read } }).__gotcha.read(k), kind);
}

// `mention`: its menu follows the text caret, so "under its trigger" means under the
// caret — the case's read() measures the caret on its own, without the component's code.
for (const kind of ['select', 'tree', 'cascader', 'mention'] as const) {
    test.describe(`${kind} inside a scrolling box shorter than its panel`, () => {
        test('the panel reaches below the box', async ({ page }) => {
            // Not a result, a precondition: the other assertion only means something if there IS a
            // part of the panel outside the box for the box to cut.
            const m = await openAndRead(page, kind);
            expect(m.ready, 'the panel never opened').toBe(true);
            if (!m.ready) return;
            expect(m.extendsBelowBox, 'the panel fits inside the box, so the case measures nothing')
                .toBeGreaterThan(40);
        });

        test('the part below the box is visible — it is the panel that is found there', async ({ page }) => {
            const m = await openAndRead(page, kind);
            expect(m.ready).toBe(true);
            if (!m.ready) return;
            expect(m.hitIsPanel,
                `${kind}: the box clips the panel (position: ${m.position}) — a point of the panel below the box hits something else`)
                .toBe(true);
        });

        test('the panel opens under its trigger, not somewhere else', async ({ page }) => {
            // A `fixed` panel escapes the box and can still land in the wrong place. Placement is bottom-START: left edges aligned, top just under the trigger.
            const m = await openAndRead(page, kind);
            expect(m.ready).toBe(true);
            if (!m.ready) return;
            expect(Math.abs(m.dx), `${kind}: the panel is ${m.dx}px from its trigger's left edge`).toBeLessThanOrEqual(8);
            expect(Math.abs(m.dyFromTriggerBottom), `and ${m.dyFromTriggerBottom}px from its bottom`).toBeLessThanOrEqual(16);
        });
    });
}

test('mention: the menu follows a caret more than 200px from the left edge', async ({ page }) => {
    // A left of `Math.min(caretLeft, 200)` would stop following the caret past 200px. The text
    // before the '@' puts the caret there; if it wrapped, dy would say so.
    const m = await openAndRead(page, 'mention', 'we will ask the reviewer now ');
    expect(m.ready).toBe(true);
    if (!m.ready) return;
    expect(m.triggerFromBoxLeft, 'the caret is not past 200px, so the case measures nothing').toBeGreaterThan(200);
    expect(Math.abs(m.dx), `the menu is ${m.dx}px from the caret`).toBeLessThanOrEqual(8);
    expect(Math.abs(m.dyFromTriggerBottom), `and ${m.dyFromTriggerBottom}px below it`).toBeLessThanOrEqual(16);
});
