// Opening a pdx-tree branch turns its arrow with a transition, measured in Chromium (#1462).
//
// The twisty is a CSS chevron rotated by the row's aria-expanded, with a transform transition (#1279).
// Every expand rebuilt the visible rows, so the row of the branch just opened was a new element born at
// its final rotation: the transition had nothing to run from, and no frame showed the arrow between
// its two angles. An expand now updates the row in place.
import { test, expect } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

const ROW = 'section:not([hidden]) [data-test="tree-c"] .pdx-tree-item:nth-of-type(1)';

test('opening a branch turns its arrow through the angles between', async ({ page }) => {
    await goToScenario(page, 'tree-collapsed', 'neutral', { page: scenarioPage['tree-collapsed'] });
    await settle(page);

    // The rotation angle of the first row's twisty on each animation frame for 400 ms after the
    // click, read off the computed matrix: closed is -45°, open +45°.
    const angles = await page.evaluate(async (selector) => {
        const angle = () => {
            const twisty = document.querySelector(`${selector} > .pdx-tree-twisty`);
            const m = new DOMMatrix(getComputedStyle(twisty!).transform);
            return Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI);
        };
        (document.querySelector(selector) as HTMLElement).click();
        const seen: number[] = [];
        const start = performance.now();
        while (performance.now() - start < 400) {
            await new Promise((r) => requestAnimationFrame(r));
            seen.push(angle());
        }
        return seen;
    }, ROW);

    expect(angles.at(-1), 'the arrow ends turned down').toBe(45);
    expect(angles.some((a) => a > -45 && a < 45), `no frame between the two angles: ${angles.join(', ')}`).toBe(true);
});
