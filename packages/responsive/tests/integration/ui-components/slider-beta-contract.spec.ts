// pdx-slider on the beta contract (#286): `disabled`, `invalid` and `dragging` are custom states on
// the host, its inner elements are parts, `orientation` is a variant axis reflected on the host (no
// `pdx-slider-vertical` class), `error` marks the thumbs aria-invalid, a form submits and resets it,
// and the A-rules hold in a browser. A `slider` may not carry aria-required (axe's aria-allowed-attr):
// the label's marker says the field is required; it does take aria-invalid.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for its components to render. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.width = '300px';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** axe's violations inside #f, with the axe runner's tags. */
async function axe(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('#f')
        .disableRules(['color-contrast'])
        .analyze();
    return results.violations.map((v) => `${v.id} (${v.nodes.length})`);
}

const statesOf = (page: Page, sel: string, names: string[]) =>
    page.locator(`#f ${sel}`).first().evaluate((h, ns) => ns.filter((n) => h.matches(`:state(${n})`)), names);

const entries = (page: Page) => page.evaluate(() =>
    [...new FormData(document.querySelector('#f form') as HTMLFormElement).entries()].map(([k, v]) => `${k}=${v}`));

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=slider-beta-contract'); });

test('disabled and invalid are custom states on the host, and the root carries no state class', async ({ page }) => {
    await mount(page, '<pdx-slider data-k="on" label="Volume" disabled error></pdx-slider><pdx-slider data-k="off" label="Volume"></pdx-slider>');
    expect(await statesOf(page, '[data-k="on"]', ['disabled', 'invalid'])).toEqual(['disabled', 'invalid']);
    expect(await statesOf(page, '[data-k="off"]', ['disabled', 'invalid'])).toEqual([]);
    const classes = await page.locator('#f [data-k="on"] [data-part="root"]').evaluate((e) => [...e.classList]);
    expect(classes).not.toContain('disabled');
    expect(classes).not.toContain('error');
});

test('dragging is a custom state while a pointer drags, and only then', async ({ page }) => {
    await mount(page, '<pdx-slider label="Volume" value="20"></pdx-slider>');
    const host = page.locator('#f pdx-slider');
    const track = page.locator('#f [data-part="track"]');
    const box = (await track.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => statesOf(page, 'pdx-slider', ['dragging'])).toEqual(['dragging']);
    expect(await page.locator('#f [data-part="root"]').evaluate((e) => [...e.classList])).not.toContain('pdx-slider-dragging');
    await page.mouse.up();
    await expect.poll(() => statesOf(page, 'pdx-slider', ['dragging'])).toEqual([]);
    expect(await host.evaluate((e) => (e as unknown as { value: number }).value)).toBe(50);
});

test('its inner elements are parts: root, track, fill, a thumb each, and a mark each', async ({ page }) => {
    await mount(page, '<pdx-slider data-k="one" label="Volume" marks="0,50,100"></pdx-slider><pdx-slider data-k="two" label="Price" range value="20,80"></pdx-slider>');
    const count = (k: string, part: string) => page.locator(`#f [data-k="${k}"] [data-part="${part}"]`).count();
    expect([await count('one', 'root'), await count('one', 'track'), await count('one', 'fill'), await count('one', 'thumb'), await count('one', 'mark')]).toEqual([1, 1, 1, 1, 3]);
    expect(await count('two', 'thumb')).toBe(2);
    expect(await page.locator('#f [data-k="two"] [data-part="thumb"]').evaluateAll((els) => els.map((e) => e.getAttribute('role')))).toEqual(['slider', 'slider']);
});

test('orientation is reflected on the host with no class, and the design CSS stands a vertical one up', async ({ page }) => {
    await mount(page, '<pdx-slider data-k="h" label="H"></pdx-slider><pdx-slider data-k="v" label="V" orientation="vertical"></pdx-slider>');
    await expect(page.locator('#f [data-k="h"]')).toHaveAttribute('orientation', 'horizontal');
    await expect(page.locator('#f [data-k="v"]')).toHaveAttribute('orientation', 'vertical');
    expect(await page.locator('#f .pdx-slider-vertical').count()).toBe(0);
    const track = (k: string) => page.locator(`#f [data-k="${k}"] [data-part="track"]`).evaluate((e) => {
        const r = e.getBoundingClientRect();
        return r.height > r.width ? 'tall' : 'wide';
    });
    expect(await track('h')).toBe('wide');
    expect(await track('v')).toBe('tall');
    await expect(page.locator('#f [data-k="v"] [data-part="thumb"]')).toHaveAttribute('aria-orientation', 'vertical');
});

test('the design CSS draws the states: invalid in the danger colour, disabled dimmed', async ({ page }) => {
    await mount(page, `<pdx-slider data-k="err" label="A" value="50" error></pdx-slider><pdx-slider data-k="ok" label="B" value="50"></pdx-slider>
        <pdx-slider data-k="dis" label="C" disabled></pdx-slider><span data-k="danger" style="color: var(--pdx-color-danger)"></span>`);
    const bg = (k: string) => page.locator(`#f [data-k="${k}"] [data-part="fill"]`).evaluate((e) => getComputedStyle(e).backgroundColor);
    const danger = await page.locator('#f [data-k="danger"]').evaluate((e) => getComputedStyle(e).color);
    expect(await bg('err')).toBe(danger);
    expect(await bg('ok')).not.toBe(danger);
    const opacity = await page.locator('#f [data-k="dis"] [data-part="root"]').evaluate((e) => Number(getComputedStyle(e).opacity));
    expect(opacity).toBeLessThan(1);
});

test('its own error marks every thumb aria-invalid, and the mark goes with it', async ({ page }) => {
    await mount(page, '<pdx-slider label="Price" range value="20,80" error></pdx-slider>');
    const marks = () => page.locator('#f [data-part="thumb"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-invalid')));
    await expect.poll(marks).toEqual(['true', 'true']);
    await page.locator('#f pdx-slider').evaluate((e) => e.removeAttribute('error'));
    await expect.poll(marks).toEqual([null, null]);
});

test('a form submits its value, two entries for a range, and resets it', async ({ page }) => {
    await mount(page, '<form><pdx-slider name="vol" label="Volume" value="30"></pdx-slider><pdx-slider name="price" label="Price" range value="20,80"></pdx-slider></form>');
    await expect.poll(() => entries(page)).toEqual(['vol=30', 'price=20', 'price=80']);
    await page.getByRole('slider', { name: 'Volume' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => entries(page)).toEqual(['vol=31', 'price=20', 'price=80']);
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(() => entries(page)).toEqual(['vol=30', 'price=20', 'price=80']);
});

test('A1 — in a required pdx-form-field the thumb is named by the label, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Volume" required><pdx-slider></pdx-slider></pdx-form-field>');
    const thumb = page.locator('#f [data-part="thumb"]');
    await expect(thumb).toHaveAccessibleName(/^Volume/);
    // A slider may not carry aria-required: the label's marker says it.
    await expect(thumb).not.toHaveAttribute('aria-required', /.*/);
    expect(await axe(page)).toEqual([]);
});

test('A2 — in a pdx-form-field in error every thumb is aria-invalid and described by the message', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Price" error="Too wide" show-error><pdx-slider range value="0,100"></pdx-slider></pdx-form-field>');
    const thumbs = page.locator('#f [data-part="thumb"]');
    await expect.poll(() => thumbs.evaluateAll((els) => els.map((e) => e.getAttribute('aria-invalid')))).toEqual(['true', 'true']);
    await expect(thumbs.nth(0)).toHaveAccessibleDescription('Too wide');
    await expect(thumbs.nth(1)).toHaveAccessibleDescription('Too wide');
    expect(await axe(page)).toEqual([]);
});
