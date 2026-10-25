// `<pdx-otp-input mask>` is the masked PIN entry that `<pdx-pin-input>` was (#286, decision 48): with
// `mask` and no `label` its group is named «PIN», and with no `autocomplete` its cells are `off`. A
// `label` or an `autocomplete` set wins, and without `mask` nothing changes. Measured in a browser: the
// group's accessible name and what the form submits are not happy-dom's to tell.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <form id="f"> and wait for its cells to build. */
async function form(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('form');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Each cell's type and autocomplete. */
async function cells(page: Page): Promise<{ type: string; autocomplete: string | null }[]> {
    return page.locator('#f pdx-otp-input input').evaluateAll((inputs) =>
        inputs.map((i) => ({ type: (i as HTMLInputElement).type, autocomplete: i.getAttribute('autocomplete') })));
}

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=otp-input-mask'); });

test('with mask and no label, a group named «PIN» of password cells with autocomplete off', async ({ page }) => {
    await form(page, '<pdx-otp-input mask length="4"></pdx-otp-input>');
    await expect(page.getByRole('group', { name: 'PIN', exact: true })).toBeVisible();
    expect(await cells(page)).toEqual(Array(4).fill({ type: 'password', autocomplete: 'off' }));
});

test('with mask, a label and an autocomplete set win', async ({ page }) => {
    await form(page, '<pdx-otp-input mask length="4" label="Card PIN" autocomplete="one-time-code"></pdx-otp-input>');
    await expect(page.getByRole('group', { name: 'Card PIN', exact: true })).toBeVisible();
    expect(await cells(page)).toEqual(Array(4).fill({ type: 'password', autocomplete: 'one-time-code' }));
});

test('without mask, the code defaults stay: «Verification code» and one-time-code', async ({ page }) => {
    await form(page, '<pdx-otp-input length="4"></pdx-otp-input>');
    await expect(page.getByRole('group', { name: 'Verification code', exact: true })).toBeVisible();
    expect(await cells(page)).toEqual(Array(4).fill({ type: 'text', autocomplete: 'one-time-code' }));
});

test('in a form, the typed PIN is the entry under its name, once', async ({ page }) => {
    await form(page, '<pdx-otp-input mask length="4" name="pin"></pdx-otp-input>');
    await page.locator('#f pdx-otp-input input').first().click();
    await page.keyboard.type('4821');
    const entries = await page.evaluate(() => new FormData(document.getElementById('f') as HTMLFormElement).getAll('pin').map(String));
    expect(entries).toEqual(['4821']);
});
