/**
 * `<style scoped>` stops at nested components (#152), in Chromium, on the default target
 * (baseline-2026): the donut scope `@scope ([data-pdx-H], [data-pdx-H-in]) to ([data-pdx-root] > *)`.
 *
 * The fixture's parent (`tests/fixtures/scoped/sc-parent.pdx`) is aggressive: `button`, `.note` and
 * `pdx-button` rules in its scoped block. Its own button takes them. The button a `<pdx-button>`
 * renders, and the one its child component renders, do not. What the parent writes inside a child's
 * tag — projected into the child's slot — is still the parent's, and takes them. The child's host is
 * in reach, so the parent still places it, and `:scope` is the parent's own host.
 *
 * The fixture is a page of its own, served by the dev server beside the showcase.
 */
import { test, expect } from './fixture';

const FIXTURE = '/tests/fixtures/scoped/index.html';
declare global { interface Window { __scReady?: boolean } }

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__scReady === true && !!document.querySelector('#lib button') && !!document.querySelector('#child-own'));
});

const RED = 'rgb(255, 0, 0)';
const GREEN = 'rgb(0, 128, 0)';

test('the parent\'s own elements take its rules, and :scope is its host', async ({ page }) => {
    await expect(page.locator('#own')).toHaveCSS('color', RED);
    await expect(page.locator('app-sc-parent')).toHaveCSS('outline-color', 'rgb(1, 2, 3)');
});

test('the inside of a nested component is out of reach: the library button, the child\'s own button', async ({ page }) => {
    await expect(page.locator('#lib button'), 'the parent\'s `button` restyled the button pdx-button renders').not.toHaveCSS('color', RED);
    await expect(page.locator('#child-own'), 'the parent\'s `button` restyled the button its child renders').not.toHaveCSS('color', RED);
});

test('what the parent projects into a child stays the parent\'s, deep elements included', async ({ page }) => {
    await expect(page.locator('#projected'), 'a slotted root lost the parent\'s rule').toHaveCSS('color', GREEN);
    await expect(page.locator('#projected-button'), 'an element inside the slotted content lost the parent\'s rule').toHaveCSS('color', RED);
    await expect(page.locator('#in-lib'), 'content slotted into a library component lost the parent\'s rule').toHaveCSS('color', GREEN);
});

test('the parent still places a child: its host is in reach', async ({ page }) => {
    await expect(page.locator('#lib')).toHaveCSS('margin-left', '17px');
});

// `@variants` and `@variant` (#153), in `tests/fixtures/scoped/sc-variant.pdx`.
test('a variant is a prop reflected on the host, and its rules follow it', async ({ page }) => {
    const host = page.locator('#variant');
    const root = host.locator('[data-part="root"]');
    await expect(host, 'the default is reflected on the host').toHaveAttribute('tone', 'plain');
    await expect(host).toHaveAttribute('size', 'md');
    await expect(root, 'control: the default takes the base rules').toHaveCSS('color', 'rgb(0, 0, 255)');
    await expect(root).toHaveCSS('padding-top', '8px');

    await host.evaluate((el) => { (el as unknown as { tone: string }).tone = 'loud'; });
    await expect(host, 'a prop set from script is reflected').toHaveAttribute('tone', 'loud');
    await expect(root).toHaveCSS('color', 'rgb(255, 0, 0)');
    await expect(root, 'a compound rule waits for both axes').not.toHaveCSS('font-weight', '700');

    await host.evaluate((el) => el.setAttribute('size', 'sm'));
    await expect(root).toHaveCSS('padding-top', '2px');
    await expect(root, 'the compound rule, both axes set').toHaveCSS('font-weight', '700');
    await expect(host, 'a rule on the host itself').toHaveCSS('display', 'inline-block');
});
