// `:class` and `:class.x` on one element, in a browser.
//
// The `:class` binding adds and removes only its own classes. Rewriting the whole attribute as
// static + dynamic drops a class `:class.x` turned on at the next `:class` change while its
// condition is still true: `btn primary active` becomes `btn ghost`.
// Measured here and not in core's suite: happy-dom keeps a stale class list on an element that has
// had a `:class` attribute. SVG too, where the class is written through classList, not `className`.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

type Api = {
    mount(): void;
    set(variant: string, on: boolean): void;
    read(): { html: string | null; svg: string | null };
};
const read = (page: Page) => page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.read());
const set = (page: Page, v: string, o: boolean) =>
    page.evaluate(([variant, on]) => (window as unknown as { __gotcha: Api }).__gotcha.set(variant, on), [v, o] as const);
const tokens = (cls: string | null) => (cls ?? '').split(/\s+/).filter(Boolean).sort();

test.beforeEach(async ({ page }) => {
    await openPage(page, '/gotchas.html?case=class-and-toggle');
    await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.mount());
});

test('a :class change keeps the class :class.x turned on', async ({ page }) => {
    expect(tokens((await read(page)).html)).toEqual(['active', 'btn', 'primary']);
    await set(page, 'ghost', true);
    await expect.poll(async () => tokens((await read(page)).html), 'the toggled class was dropped').toEqual(['active', 'btn', 'ghost']);
});

test('turning :class.x off still removes only its class', async ({ page }) => {
    await set(page, 'ghost', false);
    await expect.poll(async () => tokens((await read(page)).html)).toEqual(['btn', 'ghost']);
});

test('the same on an SVG element', async ({ page }) => {
    expect(tokens((await read(page)).svg)).toEqual(['active', 'dot', 'primary']);
    await set(page, 'ghost', true);
    await expect.poll(async () => tokens((await read(page)).svg)).toEqual(['active', 'dot', 'ghost']);
});
