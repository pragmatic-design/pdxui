/**
 * pdx-file-upload on the site, measured in Chromium with setInputFiles.
 *
 * "Max Files" (max-files 3) keeps 3 of 5 and says why the others are refused; "Image Only" shows a
 * refused PDF in the component; after a file's "×" focus moves to the next file, not to <body>.
 */
import { test, expect, type Page } from '@playwright/test';

/** The demo block the site built from the gallery section headed `heading`: `#g{n}-{slug}`. */
const section = (page: Page, heading: string) =>
    page.locator(`[id$="-${heading.toLowerCase().replace(/\s+/g, '-')}"]`);
const txt = (name: string, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.from('hello') });

test('max-files 3 keeps 3 of 5 and says why the rest were refused', async ({ page }) => {
    await page.goto('/components/pdx-file-upload', { waitUntil: 'networkidle' });
    const upload = section(page, 'Max Files').locator('pdx-file-upload');
    await upload.locator('input[type="file"]').setInputFiles(['a', 'b', 'c', 'd', 'e'].map(n => txt(n + '.txt')));
    await expect(upload.getByRole('listitem')).toHaveCount(3);
    const status = upload.getByRole('status');
    await expect(status).toContainText('d.txt: Too many files (max 3)');
    await expect(status).toContainText('e.txt: Too many files (max 3)');
    await expect(status.getByText('Too many files')).toHaveCount(2);

    // Removing the first file moves focus to the next file's ×, named after it.
    const first = upload.getByRole('button', { name: 'Remove a.txt' });
    await first.click();
    await expect(upload.getByRole('listitem')).toHaveCount(2);
    await expect(upload.getByRole('button', { name: 'Remove b.txt' })).toBeFocused();
});

test('Image Only shows the refused PDF in the component', async ({ page }) => {
    await page.goto('/components/pdx-file-upload', { waitUntil: 'networkidle' });
    const upload = section(page, 'Image Only').locator('pdx-file-upload');
    await upload.locator('input[type="file"]').setInputFiles([txt('doc.pdf', 'application/pdf')]);
    await expect(upload.getByRole('status')).toHaveText('doc.pdf: File type not accepted');
    await expect(upload.getByRole('listitem')).toHaveCount(0);
});
