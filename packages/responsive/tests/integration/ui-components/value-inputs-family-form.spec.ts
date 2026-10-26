// The value-input family in one form (#286, «How we will know»): the three components that took no part
// in a form before the issue — pdx-toggle-group, pdx-rich-text, pdx-json-editor — submit their values
// together in one FormData, and one form.reset() puts every one back to the value it mounted with.
// Each is measured alone in its own spec; this is the form an app writes, with all three in it.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const SCHEMA = { label: 'Profile', fields: [{ k: 'name', label: 'Name' }] };

/**
 * Put the form in a fresh <div id="f">, give the json editor its schema and value BEFORE it is
 * connected — what a reset puts back is the value a component mounted with (#135) — and wait for it.
 */
async function mount(page: Page): Promise<void> {
    await page.evaluate(async (schema) => {
        const markup = `<form>
            <pdx-toggle-group name="style" type="multiple" label="Style" value="b">
                <pdx-toggle value="b">Bold</pdx-toggle><pdx-toggle value="i">Italic</pdx-toggle>
            </pdx-toggle-group>
            <pdx-rich-text name="body" output="html" label="Body" value="<p>Hello</p>"></pdx-rich-text>
            <pdx-json-editor name="profile"></pdx-json-editor>
        </form>`;
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        Object.assign(f.querySelector('pdx-json-editor')!, { schema, value: { name: 'Ada' } });
        document.body.appendChild(f);
    }, SCHEMA);
    await expect(page.locator('#f pdx-json-editor [data-part="entry"]').first()).toBeVisible();
}

/** The form's entries: each name with its values, the JSON document parsed. */
const read = (page: Page) => page.evaluate(() => {
    const data = new FormData(document.querySelector('#f form') as HTMLFormElement);
    const profile = data.get('profile');
    return {
        style: data.getAll('style'),
        body: String(data.get('body') ?? ''),
        profile: profile == null ? null : JSON.parse(String(profile)),
    };
});

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=value-inputs-family-form'); });

test('one form submits the toggle group, the rich text and the json editor, and one reset restores all three', async ({ page }) => {
    await mount(page);
    await expect.poll(async () => {
        const r = await read(page);
        return [r.style, r.body.includes('Hello'), r.profile];
    }).toEqual([['b'], true, { name: 'Ada' }]);

    await page.getByRole('button', { name: 'Italic', exact: true }).click();
    await page.locator('#f pdx-rich-text').evaluate((el) => (el as unknown as { setHTML(h: string): void }).setHTML('<p>Changed</p>'));
    await page.getByRole('textbox', { name: 'Name' }).fill('Grace');
    await expect.poll(async () => {
        const r = await read(page);
        return [r.style, r.body.includes('Changed'), r.profile];
    }).toEqual([['b', 'i'], true, { name: 'Grace' }]);

    await page.evaluate(() => (document.querySelector('#f form') as HTMLFormElement).reset());
    await expect.poll(async () => {
        const r = await read(page);
        return [r.style, r.body.includes('Hello'), r.profile];
    }).toEqual([['b'], true, { name: 'Ada' }]);
});
