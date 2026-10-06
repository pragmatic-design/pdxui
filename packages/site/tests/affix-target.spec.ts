/**
 * pdx-affix inside a scroll container reports when it sticks, and reads its target.
 *
 * With `target` set — the mode its gallery uses — sticking is not enough: `pdx-change { affixed }`
 * fires, `pdx-affix-fixed` is added, and the selector is queried (not just any non-empty string
 * accepted). Sticky state is layout, so it is measured here, in Chromium, on the gallery itself.
 */
import { test, expect, type Page } from '@playwright/test';

async function openGallery(page: Page): Promise<void> {
    await page.goto('/components/pdx-affix', { waitUntil: 'domcontentloaded' });
    await page.locator('.cmp-gallery #affix-container pdx-affix').waitFor();
    // Record every pdx-change the gallery's affix fires, from now on.
    await page.evaluate(() => {
        const w = window as unknown as { __affix: boolean[] };
        w.__affix = [];
        document.querySelector('.cmp-gallery #affix-container pdx-affix')!
            .addEventListener('pdx-change', (e) => w.__affix.push((e as CustomEvent<{ affixed: boolean }>).detail.affixed));
    });
}

const events = (page: Page) => page.evaluate(() => (window as unknown as { __affix: boolean[] }).__affix);
const scrollTo = (page: Page, top: number) =>
    page.locator('.cmp-gallery #affix-container').evaluate((el, y) => { el.scrollTop = y; }, top);

test('scrolling the container past the bar fires pdx-change { affixed: true } once, and back { affixed: false } once', async ({ page }) => {
    await openGallery(page);
    const affix = page.locator('.cmp-gallery #affix-container pdx-affix');
    await expect(affix).not.toHaveClass(/pdx-affix-fixed/);

    await scrollTo(page, 400);
    await expect.poll(() => events(page), 'no pdx-change when the bar stuck').toEqual([true]);
    await expect(affix).toHaveClass(/pdx-affix-fixed/);
    // It is really stuck: at the container's top.
    const [bar, box] = await Promise.all([
        affix.evaluate((el) => el.getBoundingClientRect().top),
        page.locator('.cmp-gallery #affix-container').evaluate((el) => el.getBoundingClientRect().top),
    ]);
    expect(Math.abs(bar - box), `bar at ${bar}, container at ${box}`).toBeLessThanOrEqual(2);
    // The gallery shows the event it documents.
    await expect(page.locator('.cmp-gallery .affix-state')).toContainText('Affixed: yes');

    await scrollTo(page, 420); // still stuck: no second event
    await scrollTo(page, 0);
    await expect.poll(() => events(page), 'no pdx-change when the bar came unstuck').toEqual([true, false]);
    await expect(affix).not.toHaveClass(/pdx-affix-fixed/);
    await expect(page.locator('.cmp-gallery .affix-state')).toContainText('Affixed: no');
});

test('offsetBottom in a container: stuck to the bottom while its place is below, released when it scrolls into view', async ({ page }) => {
    await openGallery(page);
    await page.evaluate(() => {
        const w = window as unknown as { __bottom: boolean[] };
        w.__bottom = [];
        const box = document.createElement('div');
        box.id = 'affix-bottom-box';
        box.style.cssText = 'height:200px;overflow-y:auto;position:relative';
        box.innerHTML = '<div style="height:600px"></div>';
        const a = document.createElement('pdx-affix');
        a.setAttribute('target', '#affix-bottom-box');
        a.setAttribute('offset-bottom', '0');
        a.innerHTML = '<div style="height:32px">bottom bar</div>';
        a.addEventListener('pdx-change', (e) => w.__bottom.push((e as CustomEvent<{ affixed: boolean }>).detail.affixed));
        box.appendChild(a);
        box.insertAdjacentHTML('beforeend', '<div style="height:50px"></div>');
        document.querySelector('.cmp-gallery')!.appendChild(box);
    });
    const bottom = () => page.evaluate(() => (window as unknown as { __bottom: boolean[] }).__bottom);
    // Its place (600px down) is below the 200px box: it starts stuck to the bottom.
    await expect.poll(bottom).toEqual([true]);
    await page.locator('#affix-bottom-box').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(bottom).toEqual([true, false]);
    await expect(page.locator('#affix-bottom-box pdx-affix')).not.toHaveClass(/pdx-affix-fixed/);
});

// `a target that matches nothing is reported` is not tested here: this suite reads a PRODUCTION
// build, and a diagnostic is behind `DEV` and leaves that build — the console it would read is one
// the visitor does not have.
//
// It is `packages/ui/tests/unit/affix-target-warning.test.ts`, where the flag is on, with its
// control: a target that EXISTS is not reported. What stays here is this file's own subject, the
// affixing itself, which needs a browser's layout to measure.
