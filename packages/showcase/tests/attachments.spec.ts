/**
 * The TransferHandle, on a real transfer.
 *
 * `uploadFile` and `downloadFile` return a handle whose `progress`, `loaded` and `total` are
 * signals and whose `abort()` is an AbortController. Every one of those claims is easy to make and
 * easy to fake: a mock that resolves at once gives a bar that jumps 0 -> 100, which looks exactly
 * like a component with no progress tracking in it.
 *
 * So the endpoints in `mock-attachments.ts` are slow on purpose — the upload READS the request body
 * in chunks with a pause between them, which is what makes the browser report partial progress, and
 * the download WRITES it the same way. What is asserted here is the difference that makes.
 *
 * Two things this spec does deliberately, both learned by getting them wrong first:
 *
 *   - **one ticket per test.** The mock's state lives in the preview process and outlives a page,
 *     so a test that assumed an empty list was reading the leftovers of the test before it;
 *   - **the assertion is the SERVER's answer, not the DOM.** `no attachments yet` is also what the
 *     panel shows for the half-second before the first fetch returns, so asserting on it right
 *     after the page loads passes on any behaviour at all. `listFor()` reads the response body.
 */
import { test, expect, type Page, type Response } from '@playwright/test';

/** Big enough that the throttled endpoint takes about a second: 64 KB chunks, 25 ms apart. */
const BIG = 2 * 1024 * 1024;

const bigFile = (name: string) => ({
    name,
    mimeType: 'application/pdf',
    // A repeating byte, not random: the subject is the transfer, and a 2 MB random buffer takes
    // longer to build than the upload it feeds.
    buffer: Buffer.alloc(BIG, 7),
});

/** A ticket id of this test's own, so the mock's stored files cannot leak between tests. */
const isListOf = (ticket: number) => (r: Response) =>
    r.url().includes(`/api/attachments?ticket=${ticket}`) && r.request().method() === 'GET';

async function openTicket(page: Page, ticket: number): Promise<void> {
    const firstList = page.waitForResponse(isListOf(ticket));
    await page.goto(`/tickets/${ticket}`);
    await expect(page.locator('[data-test="attachments"]')).toBeVisible();
    // Waiting for the list the page fetches on mount. Without it every assertion below races it.
    await firstList;
}

/** What the SERVER holds for a ticket, asked directly rather than read off the screen. */
async function listFor(page: Page, ticket: number): Promise<{ name: string }[]> {
    return page.evaluate(
        async (t) => (await fetch(`/api/attachments?ticket=${t}`)).json(),
        ticket,
    ) as Promise<{ name: string }[]>;
}

const picker = (page: Page) => page.locator('[data-test="picker"] input[type="file"]');

test('the panel loads, and the list it shows is the one the server sent', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
    await openTicket(page, 101);
    expect(errors, 'the panel threw while mounting').toEqual([]);
    expect(await listFor(page, 101)).toEqual([]);
    await expect(page.locator('[data-test="no-files"]')).toBeVisible();
});

test('progress is observed BETWEEN 0 and 100, which is the whole claim', async ({ page }) => {
    await openTicket(page, 102);
    // The browser's own upload, held to 1 MB/s. The slow reader in the mock is not enough by itself:
    // the loopback's socket buffers take the file whole before the server reads a byte — 2 MB fits
    // in them on the GitHub runner, where the bar went 0 -> 100 — and the panel accepts no more
    // than 8 MB. Held in the browser, the bytes leave at the pace the bar reports, on any machine.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 1024 * 1024,
    });

    // Sample while the transfer runs. `progress-value` is the signal's own number, rendered.
    const seen = new Set<number>();
    const sampling = (async () => {
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
            const text = await page.locator('[data-test="progress-value"]').textContent().catch(() => null);
            if (text !== null && text.trim() !== '') seen.add(Number(text.trim()));
            if (seen.has(100)) break;
            await page.waitForTimeout(20);
        }
    })();

    await picker(page).setInputFiles(bigFile('notes.pdf'));
    await sampling;

    // A partial value is the evidence. Without the throttled endpoint the only sample is 100, and
    // this assertion is the reason that endpoint reads its body slowly.
    const partial = [...seen].filter((n) => n > 0 && n < 100);
    expect(partial, `progress never showed a partial value — samples: ${[...seen].join(', ')}`).not.toEqual([]);

    // And it finished: the file is on the SERVER, not merely in a local array.
    await expect(page.locator('[data-test="files"] .file[data-name="notes.pdf"]')).toBeVisible();
    expect((await listFor(page, 102)).map((f) => f.name)).toEqual(['notes.pdf']);
});

test('cancel aborts the upload, and the server is left with nothing', async ({ page }) => {
    await openTicket(page, 103);

    await picker(page).setInputFiles(bigFile('huge.pdf'));
    // Mid-flight, not after: the Cancel button is only on screen while a transfer runs, so waiting
    // for it to be visible is waiting for exactly that.
    await expect(page.locator('[data-test="cancel"]')).toBeVisible();

    // The panel re-reads the list after the abort. That response is the assertion — the screen
    // showing "no attachments yet" is also what it shows before the first fetch returns.
    const afterAbort = page.waitForResponse(isListOf(103));
    await page.locator('[data-test="cancel"] button').click();
    await expect(page.locator('[data-test="cancelled"]')).toBeVisible();
    expect(await (await afterAbort).json(), 'the aborted upload was stored anyway').toEqual([]);

    await expect(page.locator('[data-test="files"] .file')).toHaveCount(0);
});

test('a rejected file is reported where the user is looking, and never sent', async ({ page }) => {
    await openTicket(page, 104);
    // `accept` is .pdf/.png/.txt — a .exe is refused by the picker and never reaches a transfer.
    await picker(page).setInputFiles({ name: 'installer.exe', mimeType: 'application/octet-stream', buffer: Buffer.alloc(16) });

    const rejected = page.locator('[data-test="rejected"]');
    await expect(rejected).toBeVisible();
    await expect(rejected).toContainText('installer.exe');
    expect(await listFor(page, 104), 'a refused file was uploaded anyway').toEqual([]);
});

test('a download is saved under the name the SERVER sent', async ({ page }) => {
    await openTicket(page, 105);
    await picker(page).setInputFiles({ name: 'report.txt', mimeType: 'text/plain', buffer: Buffer.from('two hundred and three') });
    const row = page.locator('[data-test="files"] .file[data-name="report.txt"]');
    await expect(row).toBeVisible();

    const download = page.waitForEvent('download');
    // The row's OWN button: `.first()` is the first row of whatever the list happens to hold.
    await row.locator('[data-test="download"] button').click();
    const saved = await download;

    // The URL ends `/content`. That is what a page reading the last segment would write to disk;
    // `report.txt` is what `Content-Disposition` says, and it is the handle's `filename()`.
    expect(saved.suggestedFilename(), 'saved under the URL segment instead of the sent name').toBe('report.txt');
    await expect(page.locator('[data-test="saved-as"]')).toContainText('report.txt');
});
