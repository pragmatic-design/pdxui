// pdx-icon on the beta contract (#291). It drew its container with inline styles built in an effect —
// the layout, the size, the spin animation — and set a `--pdx-icon-rtl` that no rule read, so
// `rtl="mirror"` mirrored nothing. The container is its `root` part now, icon.css draws it, spinning is
// `:state(spin)` and a mirrored icon in a right-to-left context is `:state(mirror)`, drawn flipped.
// Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait until every icon in it has its SVG. */
async function mount(page: Page, html: string, icons: number): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await expect(page.locator('#f pdx-icon svg')).toHaveCount(icons);
}

const STATES = ['spin', 'mirror'];
const states = (page: Page, sel: string) => page.locator(sel).evaluate(
    (host, ns) => ns.filter((n) => host.matches(`:state(${n})`)), STATES);
const root = (page: Page, sel: string) => page.locator(`${sel} > [data-part="root"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=icon-beta-contract'); });

test('the container is the root part, drawn by the stylesheet: no inline layout or animation', async ({ page }) => {
    await mount(page, '<pdx-icon id="i" name="check"></pdx-icon>', 1);
    await expect(root(page, '#i')).toHaveCount(1);
    const drawn = await root(page, '#i').evaluate((r) => {
        const cs = getComputedStyle(r);
        return { display: cs.display, inline: (r as HTMLElement).style.cssText.match(/display|animation|align-items|line-height/g) ?? [] };
    });
    expect(drawn).toEqual({ display: 'inline-flex', inline: [] });
});

test('spin is :state(spin), and the root turns; without it, no state and no animation', async ({ page }) => {
    await mount(page, '<pdx-icon id="s" name="check" spin></pdx-icon><pdx-icon id="n" name="check"></pdx-icon>', 2);
    expect(await states(page, '#s')).toEqual(['spin']);
    expect(await root(page, '#s').evaluate((r) => getComputedStyle(r).animationName)).toBe('pdx-spin');
    expect(await states(page, '#n')).toEqual([]);
    expect(await root(page, '#n').evaluate((r) => getComputedStyle(r).animationName)).toBe('none');

    await page.locator('#s').evaluate((h) => { (h as unknown as { spin: boolean }).spin = false; });
    await expect.poll(() => states(page, '#s')).toEqual([]);
    expect(await root(page, '#s').evaluate((r) => getComputedStyle(r).animationName)).toBe('none');
});

test('rtl="mirror" is :state(mirror), and in a right-to-left context the icon is drawn flipped', async ({ page }) => {
    await mount(page, '<div dir="rtl"><pdx-icon id="r" name="check" rtl="mirror"></pdx-icon><pdx-icon id="k" name="check"></pdx-icon></div><div dir="ltr"><pdx-icon id="l" name="check" rtl="mirror"></pdx-icon></div>', 3);
    const transform = (sel: string) => root(page, sel).evaluate((r) => getComputedStyle(r).transform);
    expect(await states(page, '#r')).toEqual(['mirror']);
    expect(await transform('#r'), 'mirrored, right to left').toBe('matrix(-1, 0, 0, 1, 0, 0)');
    expect(await transform('#k'), 'control: not asked to mirror').toBe('none');
    expect(await transform('#l'), 'control: asked, but left to right').toBe('none');
});
