/**
 * Data comes back IN, and the screen says what it is about to do before it does it.
 *
 * The grid's toolbar exports CSV; import is the other half, it is the half every line-of-business application is asked for, and it is where an
 * app is judged: a good one previews, marks the rows it cannot take WITH THEIR REASON, imports only
 * the rest, and hands back the refused ones so they can be fixed and tried again.
 *
 * The control that runs through the whole file: NOTHING is written before the commit.
 */
import { test, expect, type Page } from './fixture';

const rows = (page: Page) => page.locator('[data-test="preview"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });
const cell = (page: Page, row: number, field: string) =>
    rows(page).nth(row).locator(`[role="gridcell"][data-field="${field}"]`);

/** Five rows, of which two cannot be imported — and a column nobody claims. */
const FIVE = [
    'name,sector,tier,note',
    'Globex Industrial,Manufacturing,enterprise,keep',
    ',Retail,standard,no name',
    'Initech Services,Health,platinum,no such tier',
    'Umbrella Logistics,Logistics,business,keep',
    'Soylent Foods,Retail,standard,keep',
].join('\r\n');

async function openImport(page: Page): Promise<void> {
    await page.goto('/customers/import');
    await expect(page.locator('[data-test="import"]')).toBeVisible();
}

async function drop(page: Page, name: string, text: string): Promise<void> {
    await page.locator('[data-test="dropzone"] input[type="file"]').setInputFiles({
        name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf-8'),
    });
}

test('the preview says what would happen, and writes nothing', async ({ page }) => {
    await openImport(page);
    const before = await page.locator('[data-test="total"]').innerText();

    await drop(page, 'customers.csv', FIVE);

    await expect(rows(page), 'the preview did not show every row, only the good ones').toHaveCount(5);
    // The count is stated BEFORE the click, which is the whole point of a preview.
    await expect(page.locator('[data-test="preview-count"]')).toContainText('3');
    await expect(page.locator('[data-test="preview-count"]')).toContainText('5');

    // THE CONTROL. A screen that imported on drop would pass every other row in this file.
    await expect(page.locator('[data-test="total"]'), 'rows were written before the commit').toHaveText(before);
});

test('a row that cannot be imported is marked ON THE ROW, with its reason', async ({ page }) => {
    await openImport(page);
    await drop(page, 'customers.csv', FIVE);

    // Line 3 of the file is the one with no name; line 4 has a tier that does not exist.
    await expect(cell(page, 1, 'problem'), 'the refused row does not say why').toContainText(/name/i);
    await expect(cell(page, 2, 'problem')).toContainText(/platinum|tier/i);
    // Not a summary at the top: the reader has to see WHICH line of two hundred is wrong.
    await expect(cell(page, 1, 'line')).toHaveText('3');
    await expect(cell(page, 2, 'line')).toHaveText('4');

    // And the row reads as refused, not just its reason cell.
    await expect(rows(page).nth(1)).toHaveClass(/pdx-dg-row-invalid/);
    await expect(rows(page).nth(0), 'a good row was marked too').not.toHaveClass(/pdx-dg-row-invalid/);
});

test('and the mark is DRAWN, not only a class on the row', async ({ page }) => {
    // A class can be there with nothing painting it: a rule written `.list :global(…)` is not CSS,
    // and the browser drops it. The rows above only ask for the class.
    await openImport(page);
    await drop(page, 'customers.csv', FIVE);
    await expect(rows(page).nth(1)).toHaveClass(/pdx-dg-row-invalid/);

    const bg = (i: number) => rows(page).nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);
    const good = await bg(0);
    const refused = await bg(1);
    // Control: the good row keeps the grid's own ground, so a rule painting EVERY row fails here.
    expect(refused, `the refused row is painted like a good one (${good})`).not.toBe(good);
});

test('a column nobody claims is shown as ignored, not dropped in silence', async ({ page }) => {
    await openImport(page);
    await drop(page, 'customers.csv', FIVE);
    await expect(page.locator('[data-test="ignored"]')).toContainText('note');
});

test('the commit takes only the valid rows, and the list grows by exactly those', async ({ page }) => {
    await openImport(page);
    const before = Number((await page.locator('[data-test="total"]').innerText()).replace(/\D/g, ''));

    await drop(page, 'customers.csv', FIVE);
    await page.locator('[data-test="commit"]').click();

    await expect(page.locator('[data-test="outcome"]')).toBeVisible();
    await expect(page.locator('[data-test="outcome"]')).toContainText('3');
    await expect.poll(async () => Number((await page.locator('[data-test="total"]').innerText()).replace(/\D/g, '')),
        { message: 'the list did not grow by the three that were valid' }).toBe(before + 3);

    // The refused ones stay on screen: they are the work that is left.
    await expect(rows(page), 'the refused rows left with the good ones').toHaveCount(2);
    await expect(cell(page, 0, 'problem')).toContainText(/name/i);

    // And they come back out as a file, so they can be fixed and dropped again.
    const download = page.waitForEvent('download');
    await page.locator('[data-test="export-refused"]').click();
    const file = await download;
    const stream = await file.createReadStream();
    const csv = (await new Promise<Buffer>((resolve, reject) => {
        const parts: Buffer[] = [];
        stream.on('data', (c: Buffer) => parts.push(c));
        stream.on('end', () => resolve(Buffer.concat(parts)));
        stream.on('error', reject);
    })).toString('utf-8');

    expect(csv, 'the refused export does not carry the rows that were refused').toContain('Initech Services');
    expect(csv).toContain('platinum');
    expect(csv, 'it carried a row that went through').not.toContain('Globex Industrial');
});

// ─── What the page asks for, before anything is dropped ─────────
//
// The accepted types in words, not «.csv,text/csv», and the columns the file must have, stated
// before the drop — not learned from the door's refusals.

test('the drop zone names the file type in words, not as a MIME type', async ({ page }) => {
    await openImport(page);
    await expect(page.locator('[data-test="dropzone"] .pdx-file-dropzone-hint')).toHaveText('CSV');
    await expect(page.locator('[data-test="import"]'), 'a MIME type is on screen').not.toContainText('text/csv');
});

test('the expected columns are listed: which is required, and the values a column takes', async ({ page }) => {
    await openImport(page);
    const columns = page.locator('[data-test="expected-column"]');
    await expect(columns).toHaveCount(3);
    await expect(columns.nth(0)).toContainText('name');
    await expect(columns.nth(0)).toContainText(/required/i);
    await expect(columns.nth(1)).toContainText('sector');
    await expect(columns.nth(2)).toContainText('tier');
    await expect(columns.nth(2)).toContainText('enterprise');
});

test('a template can be downloaded: a .csv with exactly those columns, which the import then takes', async ({ page }) => {
    await openImport(page);
    const download = page.waitForEvent('download');
    await page.locator('[data-test="template"]').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    const stream = await file.createReadStream();
    const csv = (await new Promise<Buffer>((resolve, reject) => {
        const parts: Buffer[] = [];
        stream.on('data', (c: Buffer) => parts.push(c));
        stream.on('end', () => resolve(Buffer.concat(parts)));
        stream.on('error', reject);
    })).toString('utf-8');
    // `toCsv` opens with a byte-order mark, for a spreadsheet to read UTF-8 as UTF-8.
    const header = csv.split(/\r?\n/)[0].replace(String.fromCharCode(0xfeff), '');
    expect(header, 'the template\'s header is not the import\'s fields').toBe('name,sector,tier');

    // The control a template exists for: dropped as it is, every row of it imports.
    await drop(page, 'template.csv', csv);
    await expect(rows(page).first()).toBeVisible();
    await expect(page.locator('[data-test="door-error"]')).toBeHidden();
    await expect(page.locator('[data-test="preview"] .pdx-dg-row-invalid'), 'the template\'s own row is refused').toHaveCount(0);
});

test('a file with the wrong shape is refused at the door, with the reason', async ({ page }) => {
    await openImport(page);

    await drop(page, 'one-column.csv', 'justonecolumn\nvalue\nvalue');
    await expect(page.locator('[data-test="door-error"]'), 'a file with no usable header was previewed anyway').toBeVisible();
    await expect(page.locator('[data-test="door-error"]')).toContainText(/column/i);
    await expect(rows(page), 'it drew a preview of a file it had refused').toHaveCount(0);

    // A header whose names mean nothing here is the same refusal, and it says so differently.
    await drop(page, 'wrong.csv', 'alpha,beta,gamma\n1,2,3');
    await expect(page.locator('[data-test="door-error"]')).toContainText(/alpha|match|recognise|recognize/i);
    await expect(rows(page)).toHaveCount(0);

    // Control: the good file still gets through after two refusals — the door does not latch shut.
    await drop(page, 'customers.csv', FIVE);
    await expect(page.locator('[data-test="door-error"]')).toBeHidden();
    await expect(rows(page)).toHaveCount(5);
});

test('an empty file, and a file that is only a header, are both refused', async ({ page }) => {
    await openImport(page);

    await drop(page, 'empty.csv', '');
    await expect(page.locator('[data-test="door-error"]')).toBeVisible();

    await drop(page, 'header-only.csv', 'name,sector,tier');
    await expect(page.locator('[data-test="door-error"]'), 'a file with no rows was previewed as if it had some').toBeVisible();
    await expect(rows(page)).toHaveCount(0);
});

test('a quoted field carrying a comma and a newline survives the parser', async ({ page }) => {
    await openImport(page);
    await drop(page, 'quoted.csv', [
        'name,sector,tier',
        '"Wayne, Enterprises","Manufacturing, heavy",enterprise',
        '"Stark\nIndustries",Health,business',
    ].join('\r\n'));

    await expect(rows(page)).toHaveCount(2);
    await expect(cell(page, 0, 'name'), 'a comma inside quotes split the field').toHaveText('Wayne, Enterprises');
    await expect(cell(page, 0, 'sector')).toHaveText('Manufacturing, heavy');
    await expect(cell(page, 1, 'name')).toContainText('Stark');
});
