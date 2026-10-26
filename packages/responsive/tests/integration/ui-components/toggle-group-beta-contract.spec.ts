// pdx-toggle-group on the beta contract (#286): `disabled` is a custom state on the host, its role and
// ARIA are host bindings, `orientation` is a variant axis reflected on the host (no
// `pdx-toggle-group-vertical` class), a form submits and resets it, and the A-rules hold in a browser.
// One ARIA pattern per type, in full, as pdx-button-group's modes had them (#286 moves them here):
//   - `multiple` is a `group` of aria-pressed toggle buttons. A `group` may carry neither
//     aria-orientation, aria-invalid nor aria-required (axe's aria-allowed-attr): the label's marker says
//     it is required, and the group is described by the error.
//   - `single` is an APG radio group: a `radiogroup` of `radio` buttons with aria-checked, one tab stop
//     on the checked one, the arrows moving focus and selection and wrapping at the ends. A radiogroup
//     takes aria-orientation, aria-required and aria-invalid itself.
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

const ITEMS = '<pdx-toggle value="a">Alpha</pdx-toggle><pdx-toggle value="b">Beta</pdx-toggle>';

const entries = (page: Page) => page.evaluate(() =>
    [...new FormData(document.querySelector('#f form') as HTMLFormElement).entries()].map(([k, v]) => `${k}=${v}`));

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=toggle-group-beta-contract'); });

test('disabled is a custom state on the host', async ({ page }) => {
    await mount(page, `
        <pdx-toggle-group data-k="on" label="Pick" disabled>${ITEMS}</pdx-toggle-group>
        <pdx-toggle-group data-k="off" label="Pick">${ITEMS}</pdx-toggle-group>`);
    const states = (k: string) => page.locator(`#f [data-k="${k}"]`).evaluate((h) => h.matches(':state(disabled)'));
    expect(await states('on')).toBe(true);
    expect(await states('off')).toBe(false);
});

test('the host is the group: its role and ARIA follow its props, and orientation is reflected with no class', async ({ page }) => {
    await mount(page, `<pdx-toggle-group type="multiple" label="Pick" orientation="vertical" disabled>${ITEMS}</pdx-toggle-group>`);
    const group = page.getByRole('group', { name: 'Pick' });
    await expect(group).toHaveCount(1);
    expect(await group.evaluate((e) => e.tagName)).toBe('PDX-TOGGLE-GROUP');
    await expect(group).toHaveAttribute('aria-disabled', 'true');
    await expect(group).toHaveAttribute('orientation', 'vertical');
    await expect(group).not.toHaveAttribute('aria-orientation', /.*/);
    expect(await page.locator('#f .pdx-toggle-group-vertical').count()).toBe(0);
    await group.evaluate((e) => { e.removeAttribute('disabled'); (e as unknown as { orientation: string }).orientation = 'horizontal'; });
    await expect(group).toHaveAttribute('orientation', 'horizontal');
    await expect(group).not.toHaveAttribute('aria-disabled', /.*/);
    expect(await axe(page)).toEqual([]);
});

test('the design CSS joins the toggles by orientation: a row, or a column', async ({ page }) => {
    await mount(page, `
        <pdx-toggle-group data-k="h" label="H">${ITEMS}</pdx-toggle-group>
        <pdx-toggle-group data-k="v" label="V" orientation="vertical">${ITEMS}</pdx-toggle-group>`);
    const rects = (k: string) => page.locator(`#f [data-k="${k}"] [data-part="root"]`).evaluateAll((els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, top: r.top, bottom: r.bottom, right: r.right };
    }));
    // Joined: the second overlaps the first by its border, so the gap is at most zero.
    const [h1, h2] = await rects('h');
    expect(Math.abs(h2.top - h1.top)).toBeLessThanOrEqual(1);
    expect(h2.left - h1.right).toBeLessThanOrEqual(0);
    const [v1, v2] = await rects('v');
    expect(Math.abs(v2.left - v1.left)).toBeLessThanOrEqual(1);
    expect(v2.top - v1.bottom).toBeLessThanOrEqual(0);
    expect(v2.top).toBeGreaterThan(v1.top);
});

test('a vertical group rounds only its outer corners: the top of the first toggle, the bottom of the last', async ({ page }) => {
    await mount(page, `<pdx-toggle-group label="V" orientation="vertical">${ITEMS}</pdx-toggle-group>`);
    const corners = await page.locator('#f [data-part="root"]').evaluateAll((els) => els.map((e) => {
        const s = getComputedStyle(e);
        return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius]
            .map((r) => parseFloat(r) > 0);
    }));
    // [top-left, top-right, bottom-right, bottom-left], rounded or not.
    expect(corners).toEqual([[true, true, false, false], [false, false, true, true]]);
});

test('a form submits one entry per pressed toggle of a multiple group, and resets it', async ({ page }) => {
    await mount(page, `<form><pdx-toggle-group name="style" type="multiple" label="Style" value="a">${ITEMS}</pdx-toggle-group></form>`);
    await expect.poll(() => entries(page)).toEqual(['style=a']);
    await page.getByRole('button', { name: 'Beta' }).click();
    await expect.poll(() => entries(page)).toEqual(['style=a', 'style=b']);
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(() => entries(page)).toEqual(['style=a']);
    await expect(page.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-pressed', 'false');
});

test('a form submits the single group\'s choice, nothing when none, and resets it', async ({ page }) => {
    await mount(page, `<form><pdx-toggle-group name="align" type="single" label="Align" value="a">${ITEMS}</pdx-toggle-group></form>`);
    await expect.poll(() => entries(page)).toEqual(['align=a']);
    await page.getByRole('radio', { name: 'Beta' }).click();
    await expect.poll(() => entries(page)).toEqual(['align=b']);
    await page.getByRole('radio', { name: 'Beta' }).click();
    await expect.poll(() => entries(page)).toEqual([]);
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(() => entries(page)).toEqual(['align=a']);
});

test('A1 — in a required pdx-form-field the group is named by the label, and axe allows it', async ({ page }) => {
    await mount(page, `<pdx-form-field label="Style" required><pdx-toggle-group type="multiple">${ITEMS}</pdx-toggle-group></pdx-form-field>`);
    const group = page.getByRole('group', { name: 'Style' });
    await expect(group).toHaveCount(1);
    expect(await group.evaluate((e) => e.tagName)).toBe('PDX-TOGGLE-GROUP');
    await expect(group).not.toHaveAttribute('aria-required', /.*/);
    expect(await axe(page)).toEqual([]);
});

test('A2 — in a pdx-form-field in error the group is described by the message, and axe allows it', async ({ page }) => {
    await mount(page, `<pdx-form-field label="Style" error="Pick one" show-error><pdx-toggle-group type="multiple">${ITEMS}</pdx-toggle-group></pdx-form-field>`);
    const group = page.getByRole('group', { name: 'Style' });
    await expect(group).toHaveAccessibleDescription('Pick one');
    await expect(group).not.toHaveAttribute('aria-invalid', /.*/);
    expect(await axe(page)).toEqual([]);
});

// ── type="single": the APG radio group ──

const THREE = '<pdx-toggle value="l">Left</pdx-toggle><pdx-toggle value="c">Center</pdx-toggle><pdx-toggle value="r">Right</pdx-toggle>';
const radios = (page: Page) => page.locator('#f [data-part="root"]').evaluateAll((els) =>
    els.map((e) => [e.getAttribute('role'), e.getAttribute('aria-checked'), e.getAttribute('aria-pressed'), e.getAttribute('tabindex')]));

test('single is a radiogroup of radios: aria-checked, no aria-pressed, the tab stop on the checked one', async ({ page }) => {
    await mount(page, `<pdx-toggle-group type="single" label="Align" value="c">${THREE}</pdx-toggle-group>`);
    const group = page.getByRole('radiogroup', { name: 'Align' });
    await expect(group).toHaveCount(1);
    expect(await group.evaluate((e) => e.tagName)).toBe('PDX-TOGGLE-GROUP');
    await expect(group).toHaveAttribute('aria-orientation', 'horizontal');
    await expect.poll(() => radios(page)).toEqual([
        ['radio', 'false', null, '-1'],
        ['radio', 'true', null, '0'],
        ['radio', 'false', null, '-1'],
    ]);
    expect(await axe(page)).toEqual([]);
});

test('single: the checked radio has the pressed look, drawn from its aria-checked', async ({ page }) => {
    await mount(page, `<pdx-toggle-group type="single" label="Align" variant="solid" value="c">${THREE}</pdx-toggle-group>
        <span data-k="primary" style="color: var(--pdx-color-primary)"></span>`);
    await expect(page.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
    const bg = (name: string) => page.getByRole('radio', { name }).evaluate((e) => getComputedStyle(e).backgroundColor);
    const primary = await page.locator('#f [data-k="primary"]').evaluate((e) => getComputedStyle(e).color);
    expect(await bg('Center')).toBe(primary);
    expect(await bg('Left')).not.toBe(primary);
});

test('single with nothing checked puts the tab stop on the first enabled radio', async ({ page }) => {
    await mount(page, `<pdx-toggle-group type="single" label="Align"><pdx-toggle value="l" disabled>Left</pdx-toggle><pdx-toggle value="c">Center</pdx-toggle></pdx-toggle-group>`);
    await expect.poll(() => radios(page).then((r) => r.map((x) => x[3]))).toEqual(['-1', '0']);
});

test('single: the arrows move focus and selection, and wrap at the ends', async ({ page }) => {
    await mount(page, `<pdx-toggle-group type="single" label="Align" value="c">${THREE}</pdx-toggle-group>`);
    const group = page.locator('#f pdx-toggle-group');
    await page.getByRole('radio', { name: 'Center' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Right' })).toBeFocused();
    await expect(page.getByRole('radio', { name: 'Right' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => group.evaluate((e) => (e as unknown as { value: string }).value)).toBe('r');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Left' })).toBeFocused();
    await expect(page.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'Right' })).toBeFocused();
    await expect(page.getByRole('radio', { name: 'Right' })).toHaveAttribute('aria-checked', 'true');
    // The tab stop follows the selection.
    await expect.poll(() => radios(page).then((r) => r.map((x) => x[3]))).toEqual(['-1', '-1', '0']);
});

// Keys faster than frames: the toggles' `pressed` attributes are written in the frame after a value
// change, so an arrow that decides from them reads a stale selection. CI's runner was slow enough to
// hit it (#723's run): a frame after the first key marked Right pressed, and the third key came before
// the frame that unmarked it. Here that order is forced.
test('single: arrows pressed faster than a frame still select what they reach', async ({ page }) => {
    await mount(page, `<pdx-toggle-group type="single" label="Align" value="c">${THREE}</pdx-toggle-group>`);
    await page.getByRole('radio', { name: 'Center' }).focus();
    await page.evaluate(async () => {
        const press = (key: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        press('ArrowRight');
        // One frame: the group marks Right pressed.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        // Two keys in one task: Left is chosen, and Right is reached before a frame unmarks it.
        press('ArrowRight');
        press('ArrowLeft');
    });
    await expect(page.getByRole('radio', { name: 'Right' })).toBeFocused();
    await expect.poll(() => page.locator('#f pdx-toggle-group').evaluate((g) => (g as unknown as { value: string }).value)).toBe('r');
    await expect(page.getByRole('radio', { name: 'Right' })).toHaveAttribute('aria-checked', 'true');
});

test('multiple: the arrows move focus only, and every toggle keeps its aria-pressed', async ({ page }) => {
    await mount(page, `<pdx-toggle-group type="multiple" label="Style" value="c">${THREE}</pdx-toggle-group>`);
    await page.getByRole('button', { name: 'Center' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'Right' })).toBeFocused();
    await expect.poll(() => radios(page)).toEqual([
        [null, null, 'false', null],
        [null, null, 'true', null],
        [null, null, 'false', null],
    ]);
});

test('switching the type switches the pattern', async ({ page }) => {
    await mount(page, `<pdx-toggle-group type="single" label="Align" value="c">${THREE}</pdx-toggle-group>`);
    await page.locator('#f pdx-toggle-group').evaluate((e) => e.setAttribute('type', 'multiple'));
    await expect(page.getByRole('group', { name: 'Align' })).not.toHaveAttribute('aria-orientation', /.*/);
    await expect.poll(() => radios(page)).toEqual([
        [null, null, 'false', null],
        [null, null, 'true', null],
        [null, null, 'false', null],
    ]);
    expect(await axe(page)).toEqual([]);
});

test('A1 — a single group in a required pdx-form-field: the radiogroup is aria-required, and axe allows it', async ({ page }) => {
    await mount(page, `<pdx-form-field label="Align" required><pdx-toggle-group type="single">${THREE}</pdx-toggle-group></pdx-form-field>`);
    const group = page.getByRole('radiogroup', { name: /Align/ });
    await expect(group).toHaveAttribute('aria-required', 'true');
    expect(await axe(page)).toEqual([]);
});

test('A2 — a single group in a pdx-form-field in error: the radiogroup is aria-invalid and described by the message', async ({ page }) => {
    await mount(page, `<pdx-form-field label="Align" error="Pick one" show-error><pdx-toggle-group type="single">${THREE}</pdx-toggle-group></pdx-form-field>`);
    const group = page.getByRole('radiogroup', { name: 'Align' });
    await expect(group).toHaveAttribute('aria-invalid', 'true');
    await expect(group).toHaveAccessibleDescription('Pick one');
    expect(await axe(page)).toEqual([]);
});
