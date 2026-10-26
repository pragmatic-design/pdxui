// pdx-rich-text on the beta contract (#286): readonly is a custom state on the host, its inner
// elements are declared parts, its events are declared and do not bubble (#138), a form submits and
// resets it, and the A-rules hold in a browser.
//   - Its control is the editing area, a contenteditable `role="textbox"`. pdx-form-field did not know
//     it: it looked for native fields, a combobox and groups. A textbox may carry aria-required and
//     aria-invalid, so it takes the field's whole wiring.
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

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=rich-text-beta-contract'); });

test('readonly is a custom state on the host; the textbox is aria-readonly and carries no state class', async ({ page }) => {
    await mount(page, `
        <pdx-rich-text data-k="ro" label="Notes" readonly></pdx-rich-text>
        <pdx-rich-text data-k="rw" label="Draft"></pdx-rich-text>`);
    const ro = page.locator('#f [data-k="ro"]');
    await expect(ro.locator('[data-part="input"]')).toHaveAttribute('aria-readonly', 'true');
    expect(await ro.evaluate((h) => h.matches(':state(readonly)'))).toBe(true);
    expect(await ro.locator('[data-part="input"]').evaluate((e) => [...e.classList])).not.toContain('pdx-rt-readonly');
    const rw = page.locator('#f [data-k="rw"]');
    await expect(rw.locator('[data-part="input"]')).toHaveCount(1);
    expect(await rw.evaluate((h) => h.matches(':state(readonly)'))).toBe(false);
    await expect(rw.locator('[data-part="input"]')).not.toHaveAttribute('aria-readonly', /.*/);
});

test('the design CSS draws readonly from the host: the default cursor on the text', async ({ page }) => {
    await mount(page, `
        <pdx-rich-text data-k="ro" label="Notes" readonly></pdx-rich-text>
        <pdx-rich-text data-k="rw" label="Draft"></pdx-rich-text>`);
    await expect(page.locator('#f [data-k="ro"] [data-part="input"]')).toHaveCount(1);
    const cursor = (k: string) => page.locator(`#f [data-k="${k}"] [data-part="input"]`).evaluate((e) => getComputedStyle(e).cursor);
    expect(await cursor('ro')).toBe('default');
    expect(await cursor('rw')).not.toBe('default');
});

test('its parts: the toolbar, the field around the text, and the editing area', async ({ page }) => {
    await mount(page, '<pdx-rich-text label="Notes"></pdx-rich-text>');
    await expect(page.locator('#f [data-part="toolbar"]')).toHaveCount(1);
    await expect(page.locator('#f [data-part="field"]')).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('data-part', 'input');
});

test('pdx-focus, pdx-blur and pdx-ready reach a listener on the host, and do not bubble', async ({ page }) => {
    await page.evaluate(() => {
        const w = window as unknown as { heard: string[] };
        w.heard = [];
        document.body.addEventListener('pdx-ready', () => w.heard.push('body:ready'));
        document.body.addEventListener('pdx-focus', () => w.heard.push('body:focus'));
    });
    await page.evaluate(async () => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load('<pdx-rich-text></pdx-rich-text>');
        const w = window as unknown as { heard: string[] };
        const el = document.createElement('pdx-rich-text');
        el.setAttribute('label', 'Notes');
        el.addEventListener('pdx-ready', () => w.heard.push('host:ready'));
        el.addEventListener('pdx-focus', () => w.heard.push('host:focus'));
        el.addEventListener('pdx-blur', () => w.heard.push('host:blur'));
        const f = document.createElement('div');
        f.id = 'f';
        f.appendChild(el);
        document.body.appendChild(f);
    });
    const box = page.getByRole('textbox', { name: 'Notes' });
    await box.click();
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await expect.poll(() => page.evaluate(() => (window as unknown as { heard: string[] }).heard))
        .toEqual(['host:ready', 'host:focus', 'host:blur']);
});

test('a form submits it under its name, and form.reset() puts back the mounted content', async ({ page }) => {
    await mount(page, '<form><pdx-rich-text name="body" output="html" label="Body" value="<p>Hello</p>"></pdx-rich-text></form>');
    const read = () => page.evaluate(() => new FormData(document.querySelector('#f form') as HTMLFormElement).get('body'));
    await expect.poll(read).toContain('Hello');
    await page.locator('#f pdx-rich-text').evaluate((el) => (el as unknown as { setHTML(h: string): void }).setHTML('<p>Changed</p>'));
    await expect.poll(read).toContain('Changed');
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(read).toContain('Hello');
    await expect(page.getByRole('textbox', { name: 'Body' })).toHaveText('Hello');
});

test('A1 — inside a required pdx-form-field the textbox is named by the label and aria-required, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Notes" required><pdx-rich-text></pdx-rich-text></pdx-form-field>');
    const box = page.getByRole('textbox', { name: 'Notes' });
    await expect(box).toHaveAttribute('aria-required', 'true');
    expect(await axe(page)).toEqual([]);
});

test('A1 — a task list\'s checkbox inside the text is content: the textbox stays the field\'s control', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Notes" required><pdx-rich-text></pdx-rich-text></pdx-form-field>');
    await page.locator('#f pdx-rich-text').evaluate((el) => (el as unknown as { setJSON(j: unknown): void }).setJSON({
        type: 'doc',
        content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Buy milk' }] }] }] }],
    }));
    await expect(page.locator('#f [data-part="input"] input[type="checkbox"]')).toHaveCount(1);
    // The field re-wires when its content grows: the textbox keeps the wiring, the checkbox takes none.
    await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#f [data-part="input"] input[type="checkbox"]')).not.toHaveAttribute('aria-required', /.*/);
});

test('A2 — inside a pdx-form-field in error the textbox is aria-invalid and described by the message, and axe allows it', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Notes" error="Write something" show-error><pdx-rich-text></pdx-rich-text></pdx-form-field>');
    const box = page.getByRole('textbox', { name: 'Notes' });
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(box).toHaveAccessibleDescription('Write something');
    expect(await axe(page)).toEqual([]);
});

test('A2 control — when the error goes, so do aria-invalid and the description', async ({ page }) => {
    await mount(page, '<pdx-form-field label="Notes" error="Write something" show-error><pdx-rich-text></pdx-rich-text></pdx-form-field>');
    const box = page.getByRole('textbox', { name: 'Notes' });
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#f pdx-form-field').evaluate((el) => el.removeAttribute('show-error'));
    await expect(box).not.toHaveAttribute('aria-invalid', /.*/);
    await expect(box).toHaveAccessibleDescription('');
});
