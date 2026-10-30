// pdx-file-upload on the beta contract (#287): its visual states are custom states, `:state(name)` on
// the host, and its drop zone carries no state class of its own; its parts are reached by `data-part`;
// it has no popup. The A-rules that apply to it (docs/language/beta/agents.md). Its drop zone is a
// button, which carries neither aria-required nor aria-invalid:
//   - A1, inside a required pdx-form-field the drop zone is named by the label, its marker with it;
//   - A2, inside a pdx-form-field in error the drop zone is described by the message;
//   - A4, while a file uploads the list is busy, and it is not once the upload is done.
// And the family's form test: one <form> holding pdx-transfer, pdx-calendar and pdx-file-upload gives
// the FormData a native form would, two File entries for two files, and `form.reset()` restores it.
// Measured in Chromium: `:state()`, FormData of a custom element, the accessible name and description.
import { test, expect, type Page, type Route } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f">, give every transfer `items`, and wait for it to draw. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
        for (const t of f.querySelectorAll('pdx-transfer')) {
            (t as unknown as { items: unknown[] }).items = [{ value: 'r', label: 'Read' }, { value: 'w', label: 'Write' }];
        }
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const host = (page: Page) => page.locator('#f pdx-file-upload');
const dropzone = (page: Page) => page.locator('#f pdx-file-upload [data-part="dropzone"]');
const list = (page: Page) => page.locator('#f pdx-file-upload [data-part="list"]');
const fileInput = (page: Page) => page.locator('#f pdx-file-upload input[type="file"]');
const STATES = ['disabled', 'dragover'];
const states = (page: Page) => host(page).evaluate((h, ns) => ns.filter((n) => h.matches(`:state(${n})`)), STATES);
const TWO_FILES = [
    { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('alpha') },
    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('bravo!') },
];
/** The form's entries, a file as `file:<name>:<size>`. */
const entries = (page: Page) => page.locator('#f form').evaluate((f) =>
    [...new FormData(f as HTMLFormElement)].map(([k, v]) => [k, v instanceof File ? `file:${v.name}:${v.size}` : v]));

/** Fire a drag event on the drop zone, as a drag over it does. */
const drag = (page: Page, type: string) => dropzone(page).evaluate((z, t) =>
    z.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true })), type);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=file-upload-beta-contract'); });

test.describe('states', () => {
    test('control — a plain file upload is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-file-upload label="Documents"></pdx-file-upload>');
        expect(await states(page)).toEqual([]);
    });

    test('disabled is the custom state :state(disabled), the drop zone has no class for it, and is drawn so', async ({ page }) => {
        await mount(page, '<pdx-file-upload label="Documents" disabled></pdx-file-upload>');
        expect(await states(page)).toEqual(['disabled']);
        expect(await dropzone(page).evaluate((z) => [...z.classList])).not.toContain('disabled');
        expect(await dropzone(page).evaluate((z) => getComputedStyle(z).cursor)).toBe('not-allowed');
    });

    test('disabled set after the mount follows', async ({ page }) => {
        await mount(page, '<pdx-file-upload label="Documents"></pdx-file-upload>');
        await host(page).evaluate((el) => el.setAttribute('disabled', ''));
        await expect.poll(() => states(page)).toEqual(['disabled']);
    });

    test('a drag over the drop zone is :state(dragover) with no class for it, and leaving ends it', async ({ page }) => {
        await mount(page, '<pdx-file-upload label="Documents"></pdx-file-upload>');
        const before = await dropzone(page).evaluate((z) => getComputedStyle(z).borderColor);
        await drag(page, 'dragover');
        await expect.poll(() => states(page)).toEqual(['dragover']);
        expect(await dropzone(page).evaluate((z) => [...z.classList])).not.toContain('dragover');
        expect(await dropzone(page).evaluate((z) => getComputedStyle(z).borderColor)).not.toBe(before);
        await drag(page, 'dragleave');
        await expect.poll(() => states(page)).toEqual([]);
    });
});

test.describe('parts', () => {
    test('the frame, the drop zone, the list, a file and its remove button are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-file-upload label="Documents" multiple></pdx-file-upload>');
        await fileInput(page).setInputFiles(TWO_FILES);
        await expect(page.locator('#f pdx-file-upload [data-part="file"]')).toHaveCount(2);
        const parts = await page.locator('#f pdx-file-upload [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['dropzone', 'file', 'list', 'remove', 'root']);
        await expect(dropzone(page)).toHaveAttribute('role', 'button');
        await expect(list(page)).toHaveAttribute('role', 'list');
    });
});

test.describe('A-rules', () => {
    test('A1 — in a required pdx-form-field the drop zone is named by the label', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Documents" required><pdx-file-upload></pdx-file-upload></pdx-form-field>');
        await expect(dropzone(page)).toHaveAccessibleName(/^Documents/);
    });

    test('A2 — in a pdx-form-field in error the drop zone is described by the message', async ({ page }) => {
        await mount(page, '<pdx-form-field label="Documents" error="Attach the signed contract" show-error><pdx-file-upload></pdx-file-upload></pdx-form-field>');
        await expect(dropzone(page)).toHaveAccessibleDescription('Attach the signed contract');
    });

    test('A4 — while a file uploads the list is busy and shows its progress; done, it is not busy', async ({ page }) => {
        let held: Route | null = null;
        await page.route('**/__file-upload-beta', (route) => { held = route; });
        await mount(page, '<pdx-file-upload label="Documents" action="/__file-upload-beta" auto></pdx-file-upload>');
        await fileInput(page).setInputFiles(TWO_FILES[0]);
        await expect(list(page)).toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('#f pdx-file-upload [data-part="progress"]')).toHaveCount(1);
        await expect.poll(() => held !== null).toBe(true);
        await held!.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        await expect(list(page)).not.toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('#f pdx-file-upload [data-part="progress"]')).toHaveCount(0);
    });
});

test.describe('the form', () => {
    test('transfer, calendar and file upload in one form give the FormData a native form would, and reset restores it', async ({ page }) => {
        await mount(page, '<form>'
            + '<pdx-transfer name="rights"></pdx-transfer>'
            + '<pdx-calendar inline name="due" value="2026-03-14"></pdx-calendar>'
            + '<pdx-file-upload name="docs" multiple></pdx-file-upload>'
            + '</form>');
        // Nothing picked: no right, the date, and the empty file a native file input sends.
        expect(await entries(page)).toEqual([['due', '2026-03-14'], ['docs', 'file::0']]);
        await page.locator('#f pdx-transfer').evaluate((t) => { (t as unknown as { value: string[] }).value = ['r', 'w']; });
        await fileInput(page).setInputFiles(TWO_FILES);
        await expect.poll(() => entries(page)).toEqual([
            ['rights', 'r'], ['rights', 'w'], ['due', '2026-03-14'], ['docs', 'file:a.txt:5'], ['docs', 'file:b.txt:6'],
        ]);
        await page.locator('#f form').evaluate((f) => (f as HTMLFormElement).reset());
        await expect.poll(() => entries(page)).toEqual([['due', '2026-03-14'], ['docs', 'file::0']]);
        await expect(page.locator('#f pdx-file-upload [data-part="file"]')).toHaveCount(0);
    });
});
