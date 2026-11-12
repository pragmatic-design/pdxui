// pdx-localized-input (#1024), measured in a browser. One text in several cultures, `{ [culture]:
// string }`. The cultures are a tablist, each tab named in its own language with a missing marker in its
// accessible name, the current culture first. There is one field per culture, with its `lang` and
// `dir`, named "label (language)". `required` asks every culture or the default one, through the form
// model's `missing` (#1039). The form submits the JSON.
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

const value = (page: Page) => page.locator('#f pdx-localized-input').evaluate((h) => (h as unknown as { value: unknown }).value);
const validity = (page: Page) => page.locator('#f pdx-localized-input').evaluate((h) => (h as unknown as { validity: ValidityState }).validity.valueMissing);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=localized-input-beta-contract'); });

test('the cultures are tabs named in their own language, the current one first, each a field with its lang', async ({ page }) => {
    await mount(page, `<pdx-localized-input label="Title" cultures='["it","en","fr"]'></pdx-localized-input>`);
    const tabs = page.locator('#f [role="tab"]');
    await expect(tabs).toHaveCount(3);
    // The page's locale is English: English first, the others in their order.
    expect(await tabs.evaluateAll((t) => t.map((x) => x.getAttribute('lang')))).toEqual(['en', 'it', 'fr']);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /^italiano/ })).toBeVisible();
    const field = page.getByRole('textbox', { name: 'Title (English)' });
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute('lang', 'en');
});

test('typing writes one culture of the value, and clearing it takes the culture off', async ({ page }) => {
    await mount(page, `<pdx-localized-input label="Title" cultures='["en","it"]'></pdx-localized-input>`);
    await page.getByRole('textbox', { name: 'Title (English)' }).fill('Hello');
    await expect.poll(() => value(page)).toEqual({ en: 'Hello' });
    await page.getByRole('tab', { name: /^italiano/ }).click();
    await page.getByRole('textbox', { name: 'Title (italiano)' }).fill('Ciao');
    await expect.poll(() => value(page)).toEqual({ en: 'Hello', it: 'Ciao' });
    await page.getByRole('textbox', { name: 'Title (italiano)' }).fill('');
    await expect.poll(() => value(page)).toEqual({ en: 'Hello' });
});

test('a culture with no text says so in its tab name, and stops saying so once filled', async ({ page }) => {
    await mount(page, `<pdx-localized-input label="Title" cultures='["en","it"]'></pdx-localized-input>`);
    await expect(page.getByRole('tab', { name: 'italiano, missing' })).toBeVisible();
    await page.getByRole('tab', { name: /^italiano/ }).click();
    await page.getByRole('textbox', { name: 'Title (italiano)' }).fill('Ciao');
    await expect(page.getByRole('tab', { name: 'italiano' })).toBeVisible();
    expect(await page.locator('#f pdx-localized-input').evaluate((h) => h.matches(':state(incomplete)'))).toBe(true);
});

test('required asks every culture; required-scope="default" asks the default one', async ({ page }) => {
    await mount(page, `<form><pdx-localized-input name="t" label="Title" required cultures='["en","it"]'></pdx-localized-input></form>`);
    await expect.poll(() => validity(page)).toBe(true);
    await page.getByRole('textbox', { name: 'Title (English)' }).fill('Hello');
    await expect.poll(() => validity(page), 'one of two cultures').toBe(true);
    await page.getByRole('tab', { name: /^italiano/ }).click();
    await page.getByRole('textbox', { name: 'Title (italiano)' }).fill('Ciao');
    await expect.poll(() => validity(page)).toBe(false);

    await mount(page, `<form><pdx-localized-input name="t" label="Title" required required-scope="default" default-culture="en" cultures='["en","it"]'></pdx-localized-input></form>`);
    await expect.poll(() => validity(page)).toBe(true);
    await page.getByRole('textbox', { name: 'Title (English)' }).fill('Hello');
    await expect.poll(() => validity(page), 'the default culture is enough').toBe(false);
});

test('the form submits the JSON under its name, and a reset puts the mounted value back', async ({ page }) => {
    await mount(page, `<form><pdx-localized-input name="t" label="Title" cultures='["en","it"]' value='{"en":"Hi"}'></pdx-localized-input></form>`);
    const submitted = () => page.evaluate(() => new FormData(document.querySelector('#f form') as HTMLFormElement).get('t'));
    await expect.poll(submitted).toBe('{"en":"Hi"}');
    await page.getByRole('tab', { name: /^italiano/ }).click();
    await page.getByRole('textbox', { name: 'Title (italiano)' }).fill('Ciao');
    await expect.poll(submitted).toBe('{"en":"Hi","it":"Ciao"}');
    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(() => value(page)).toEqual({ en: 'Hi' });
    await page.getByRole('tab', { name: /^English/ }).click();
    await expect(page.getByRole('textbox', { name: 'Title (English)' })).toHaveValue('Hi');
    await page.getByRole('tab', { name: /^italiano/ }).click();
    await expect(page.getByRole('textbox', { name: 'Title (italiano)' }), 'the reset reached the field').toHaveValue('');
});

test('the arrows, Home and End move between the tabs, and the selection follows', async ({ page }) => {
    await mount(page, `<pdx-localized-input label="Title" cultures='["en","it","fr"]'></pdx-localized-input>`);
    await page.locator('#f [role="tab"]').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /^italiano/ })).toBeFocused();
    await expect(page.getByRole('tab', { name: /^italiano/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: /^français/ })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: /^English/ })).toBeFocused();
    expect(await page.locator('#f [role="tab"][tabindex="0"]').count()).toBe(1);
});

test('a right-to-left culture is written right to left', async ({ page }) => {
    await mount(page, `<pdx-localized-input label="Title" layout="stacked" cultures='["en","ar"]'></pdx-localized-input>`);
    await expect(page.locator('#f [data-part="field"][lang="ar"]')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('#f [data-part="field"][lang="en"]')).toHaveAttribute('dir', 'ltr');
});

test('stacked: no tablist, every culture a labelled field', async ({ page }) => {
    await mount(page, `<pdx-localized-input label="Title" layout="stacked" multiline cultures='["en","it"]'></pdx-localized-input>`);
    await expect(page.locator('#f [role="tablist"]')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Title (English)' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title (italiano)' })).toBeVisible();
    expect(await page.locator('#f [data-part="field"]').first().evaluate((e) => e.tagName)).toBe('TEXTAREA');
});

test('an empty culture shows the default culture\'s text as its placeholder', async ({ page }) => {
    await mount(page, `<pdx-localized-input label="Title" default-culture="en" layout="stacked" cultures='["en","it"]' value='{"en":"Hello"}'></pdx-localized-input>`);
    await expect(page.getByRole('textbox', { name: 'Title (italiano)' })).toHaveAttribute('placeholder', 'Hello');
});

test('disabled: every field is disabled', async ({ page }) => {
    await mount(page, `<pdx-localized-input label="Title" disabled layout="stacked" cultures='["en","it"]'></pdx-localized-input>`);
    await expect(page.getByRole('textbox', { name: 'Title (English)' })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Title (italiano)' })).toBeDisabled();
});

test('axe finds nothing, in tabs and stacked', async ({ page }) => {
    const axe = async () => (await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('#f')
        .disableRules(['color-contrast'])
        .analyze()).violations.map((v) => `${v.id} (${v.nodes.length})`);
    await mount(page, `<pdx-localized-input label="Title" cultures='["en","it","ar"]' value='{"en":"Hi"}'></pdx-localized-input>`);
    expect(await axe()).toEqual([]);
    await mount(page, `<pdx-localized-input label="Title" layout="stacked" cultures='["en","it"]'></pdx-localized-input>`);
    expect(await axe()).toEqual([]);
});
