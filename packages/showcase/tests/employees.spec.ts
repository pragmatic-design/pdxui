/**
 * The third entity, with the reference's detail.
 *
 * The reference has detail pages with complex forms, beyond a list, a drawer and a profile of three
 * facts. `employee` is modelled on the reference's collaborator (the detail section of its layout
 * notes): identity at the top, sections as a menu on the LEFT, create in a modal and edit in the
 * page, no delete.
 *
 * This file holds the entity, its list, its detail and its sections: Anagrafica, Contratti, Sedi
 * and Documenti.
 */
import { test, expect, type Page } from '@playwright/test';
import { pinInRail } from './rail';

/** The question on leaving with a refused value: the dialog queue's modal, by its role and its name. */
const leaveAsk = (page: Page) => page.getByRole('alertdialog', { name: 'Leave the personal data?' });

async function openList(page: Page): Promise<void> {
    await page.goto('/employees');
    await expect(page.locator('[data-test="employees"]')).toBeVisible();
    await expect(page.locator('[data-test="grid"] .pdx-dg-row').first()).toBeVisible();
}

/** The seeded employee 1's personal data, in the page. */
async function openPersonal(page: Page, id = 1): Promise<void> {
    await page.goto(`/employees/${id}/personal`);
    await expect(page.locator('[data-test="personal"]')).toBeVisible();
}

const field = (page: Page, name: string) => page.locator(`[data-test="personal-form"] pdx-form-field[name="${name}"]`);
const input = (page: Page, name: string) => page.locator(`[data-test="personal-form"] [data-test="${name}"] input:not([type="hidden"])`);

test('the list reads the store, and the rail reaches it', async ({ page }) => {
    // Pinned: the rail carries the reader's favourites, and Employees is not one on
    // a first visit.
    await pinInRail(page, 'employees');
    await page.goto('/');
    await page.locator('[data-test="to-employees"]').click();
    await expect(page).toHaveURL(/\/employees$/);
    await expect(page.locator('[data-test="grid"] .pdx-dg-row').first()).toContainText('E-3001');
});

test('create is a modal, and the new employee is in the list', async ({ page }) => {
    await openList(page);
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await dialog.locator('[name="firstName"] input, input[name="firstName"]').first().fill('Grace');
    await dialog.locator('[name="lastName"] input, input[name="lastName"]').first().fill('Hopper');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-test="grid"]')).toContainText('Hopper');
});

test('a row opens the detail on its Anagrafica', async ({ page }) => {
    await openList(page);
    await page.locator('[data-test="grid"]').getByRole('gridcell', { name: 'Rossi', exact: true }).click();
    await expect(page).toHaveURL(/\/employees\/1\/personal$/);
    await expect(page.locator('[data-test="personal"]')).toBeVisible();
});

test('the identity is on top: a 100×100 round avatar and the name', async ({ page }) => {
    await openPersonal(page);
    const avatar = page.locator('[data-test="identity"] .portrait');
    const box = await avatar.boundingBox();
    expect(Math.round(box!.width)).toBe(100);
    expect(Math.round(box!.height)).toBe(100);
    expect(await avatar.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('50%');
    await expect(page.locator('[data-test="identity-name"]')).toHaveText('Ada Rossi');
});

test('the sections are a menu on the LEFT, with 48px entries, and the one open is marked', async ({ page }) => {
    await openPersonal(page);
    const menu = page.locator('[data-test="detail-menu"]');
    const body = page.locator('[data-test="detail-body"]');
    const m = await menu.boundingBox();
    const b = await body.boundingBox();
    expect(m!.x + m!.width, 'the menu is not to the left of the section').toBeLessThanOrEqual(b!.x);

    // The anchor: `<pdx-link>` is `display: contents`, so the row a person sees is its `<a>`.
    const entry = page.locator('[data-test="section-personal"] a');
    expect(Math.round((await entry.boundingBox())!.height)).toBe(48);
    await expect(entry).toHaveAttribute('aria-current', 'page');
});

// ─── The Details: a form that is the page ─────────────────────────
//
// As in the reference, the form is active at once, with no button to enable it, and saves itself.
// No Edit, no read view that turns into a form, no Save: a
// field saves itself after a pause, the bar says Saving… then Saved, and a refused value says why on
// its own field and «Not saved» in the bar.

const status = (page: Page) => page.locator('[data-test="save-status"]');
const tab = (page: Page, name: string) => page.locator('[data-test="personal-tabs"]').getByRole('tab', { name, exact: true });

/** Away through the menu and back: the store is the page's memory — a reload starts from the seed. */
async function awayAndBack(page: Page): Promise<void> {
    await page.locator('[data-test="section-contracts"] a').click();
    await expect(page.locator('[data-test="contracts"]')).toBeVisible();
    await page.locator('[data-test="section-personal"] a').click();
    await expect(page.locator('[data-test="personal-form"]')).toBeVisible();
}

test('Details filled: the form is the page — no Edit, no read view, no Save', async ({ page }) => {
    await openPersonal(page);
    await expect(page.locator('[data-test="personal-form"]'), 'the form is not open on arrival').toBeVisible();
    await expect(input(page, 'email')).toHaveValue('ada.rossi@example.com');
    await expect(page.locator('[data-test="edit"]'), 'an Edit button is still there').toHaveCount(0);
    await expect(page.locator('[data-test="personal-facts"]'), 'the read view is still there').toHaveCount(0);
    await expect(page.locator('[data-test="save"]'), 'a Save button is still there').toHaveCount(0);
    // VISIBLE dialogs: each date picker keeps its closed calendar, a role="dialog", in the DOM.
    await expect(page.locator('[role="dialog"]:visible'), 'the form is a modal').toHaveCount(0);
});

test('Details void: a new employee opens on the same form, empty past the name', async ({ page }) => {
    // The seed's last employee has a name and nothing else, as a create leaves one.
    await openPersonal(page, 12);
    await expect(page.locator('[data-test="personal-form"]')).toBeVisible();
    await expect(input(page, 'firstName')).toHaveValue('Nuovo');
    await expect(input(page, 'email')).toHaveValue('');
    await expect(page.locator('[data-test="personal-empty"]'), 'the old invitation is still there').toHaveCount(0);
});

test('three tabs, each with its own titled sections', async ({ page }) => {
    await openPersonal(page);
    const tabs = page.locator('[data-test="personal-tabs"]').getByRole('tab');
    await expect(tabs).toHaveText(['Personal data', 'Contacts', 'Additional data']);
    await expect(tab(page, 'Personal data')).toHaveAttribute('aria-selected', 'true');

    const form = page.locator('[data-test="personal-form"]');
    for (const heading of ['Identity', 'Residence', 'Place of birth', 'Identity document']) {
        await expect(form.locator('legend:visible').getByText(heading, { exact: true }), `no «${heading}» on Personal data`).toHaveCount(1);
    }
    await tab(page, 'Contacts').click();
    await expect(form.locator('[data-test="group-emergency"]')).toBeVisible();
    await expect(form.locator('[data-test="group-residence"]'), 'Residence shows on Contacts').toBeHidden();
    await tab(page, 'Additional data').click();
    await expect(field(page, 'hireChannel')).toBeVisible();
    await expect(field(page, 'notes')).toBeVisible();
});

test('a change saves itself after the pause, and is there when the section is opened again', async ({ page }) => {
    await openPersonal(page);
    await expect(status(page)).toHaveText('');
    await input(page, 'street').fill('');
    // Typed as a person types, 80ms a key: shorter than the pause, so nothing may be saved yet.
    await input(page, 'street').pressSequentially('Via Mazzini 7', { delay: 80 });
    expect(await status(page).getAttribute('data-state'), 'saved while the user was still typing').toBe('');

    await expect(status(page)).toHaveText('Saved');
    await expect(status(page), 'the bar does not say when').toHaveAttribute('title', /^Saved at \d/);

    await awayAndBack(page);
    await expect(input(page, 'street')).toHaveValue('Via Mazzini 7');
});

test('the city of residence, picked from its suggestions, saves too', async ({ page }) => {
    await openPersonal(page, 2);
    await input(page, 'city').fill('Tor');
    await page.getByRole('option', { name: 'Torino' }).click();
    await expect(status(page)).toHaveText('Saved');
    await awayAndBack(page);
    await expect(input(page, 'city')).toHaveValue('Torino');
});

test('a tax code of 15 characters is refused on its field, «Not saved», and the stored one stays', async ({ page }) => {
    await openPersonal(page);
    const stored = await input(page, 'taxCode').inputValue();
    await input(page, 'taxCode').fill('RSSDAA80A01H501');
    await expect(field(page, 'taxCode').locator('.pdx-field-error')).toContainText('16 characters');
    await expect(status(page)).toHaveText('Not saved');

    // Leaving with a refused value asks; Discard leaves, and the record kept what it had.
    await page.locator('[data-test="section-contracts"] a').click();
    await leaveAsk(page).getByRole('button', { name: 'Discard' }).click();
    await expect(page.locator('[data-test="contracts"]')).toBeVisible();
    await page.locator('[data-test="section-personal"] a').click();
    await expect(input(page, 'taxCode')).toHaveValue(stored);
});

test('the four address fields sit on one row at 1440, and one per row at 390', async ({ page }) => {
    const tops = async () => {
        const out: number[] = [];
        for (const name of ['city', 'postcode', 'province', 'country']) {
            out.push(Math.round((await field(page, name).boundingBox())!.y));
        }
        return out;
    };
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPersonal(page);
    const wide = await tops();
    expect(new Set(wide).size, `not one row at 1440: ${wide}`).toBe(1);
    const street = (await field(page, 'street').boundingBox())!;
    expect(street.y, 'the street is not on a row of its own above them').toBeLessThan(wide[0]);

    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await tops();
    for (let i = 1; i < narrow.length; i++) {
        expect(narrow[i], `field ${i} shares a row at 390: ${narrow}`).toBeGreaterThan(narrow[i - 1]);
    }
});

test('the tax code is asked only for Italy, and then it is required', async ({ page }) => {
    await openPersonal(page, 2); // seeded in France
    await expect(field(page, 'taxCode'), 'a tax code is asked of someone who lives in France').toBeHidden();

    // Through the control a person uses: open it, pick the country by its name.
    await field(page, 'country').locator('[role="combobox"]').click();
    await page.getByRole('option', { name: 'Italy' }).click();
    await expect(field(page, 'taxCode')).toBeVisible();
    await expect(field(page, 'taxCode').locator('.pdx-field-error'), 'Italian, and no word about the missing tax code')
        .toContainText('required');
    await expect(status(page)).toHaveText('Not saved');
});

test('an ID document that expires before it was issued is refused on the field', async ({ page }) => {
    await openPersonal(page);
    await input(page, 'documentIssued').fill('2025-06-01');
    await input(page, 'documentIssued').press('Tab');
    await input(page, 'documentExpires').fill('2024-06-01');
    await input(page, 'documentExpires').press('Tab');
    await expect(field(page, 'documentExpires').locator('.pdx-field-error'))
        .toContainText('after it was issued');
    await expect(status(page)).toHaveText('Not saved');
});

// ─── The complete form ───────────────────────────────────────────
//
// The showcase's complete form with many PDX components is the Details: every
// field a library component that earns its place with a real field, in the tab that holds it.

/** Each tab, each of its groups, and each field with the PDX component that edits it. */
const FORM_TABS: Record<string, Record<string, Record<string, string>>> = {
    'Personal data': {
        identity: {
            firstName: 'pdx-input', lastName: 'pdx-input', birthDate: 'pdx-date-picker',
            gender: 'pdx-radio-group', taxCode: 'pdx-masked-input', language: 'pdx-select',
        },
        residence: {
            street: 'pdx-input', city: 'pdx-autocomplete', postcode: 'pdx-masked-input',
            province: 'pdx-masked-input', country: 'pdx-select',
        },
        birthPlace: {
            birthCity: 'pdx-autocomplete', birthPostcode: 'pdx-masked-input',
            birthProvince: 'pdx-masked-input', birthCountry: 'pdx-select',
        },
        document: {
            documentType: 'pdx-select', documentNumber: 'pdx-input',
            documentIssued: 'pdx-date-picker', documentExpires: 'pdx-date-picker',
        },
    },
    Contacts: {
        contacts: { email: 'pdx-input', phone: 'pdx-input', mobile: 'pdx-masked-input', channel: 'pdx-segmented' },
        emergency: { emergencyName: 'pdx-input', emergencyPhone: 'pdx-input' },
    },
    'Additional data': {
        work: {
            skills: 'pdx-tag-input', startTime: 'pdx-time-picker', remote: 'pdx-switch',
            english: 'pdx-rating', hireChannel: 'pdx-select', notes: 'pdx-textarea',
        },
        consents: { privacy: 'pdx-checkbox', marketing: 'pdx-checkbox' },
    },
};

test('the Details are a complete form: every group in its tab, every field a PDX component', async ({ page }) => {
    await openPersonal(page); // Italian, so the tax code is asked
    for (const [name, groups] of Object.entries(FORM_TABS)) {
        await tab(page, name).click();
        for (const [group, fields] of Object.entries(groups)) {
            const box = page.locator(`[data-test="personal-form"] [data-test="group-${group}"]`);
            await expect(box, `no ${group} group on ${name}`).toBeVisible();
            for (const [field, tag] of Object.entries(fields)) {
                await expect(box.locator(`pdx-form-field[name="${field}"] ${tag}[name="${field}"]`),
                    `${group}: "${field}" is not a ${tag} in its field`).toHaveCount(1);
            }
        }
    }
});

test('every field is reached by its label, whichever component it is', async ({ page }) => {
    // A component's fallback name — a date named «Choose date», a switch «Toggle», a time picker's
    // segments with no group, a tag input «Add tag» — is what a screen reader hears when the field's
    // label does not reach the control. Asked within the group: Residence and Place of
    // birth both have a City, as the reference's sections do.
    await openPersonal(page);
    const byName: [string, string, Parameters<Page['getByRole']>[0], string][] = [
        ['Personal data', 'identity', 'combobox', 'Date of birth'], ['Personal data', 'identity', 'radiogroup', 'Gender'],
        ['Personal data', 'identity', 'textbox', 'First name'], ['Personal data', 'identity', 'textbox', 'Tax code'],
        ['Personal data', 'identity', 'combobox', 'Contact language'],
        ['Personal data', 'residence', 'combobox', 'Country'], ['Personal data', 'residence', 'combobox', 'City'],
        ['Personal data', 'residence', 'textbox', 'Province'],
        ['Personal data', 'birthPlace', 'combobox', 'City'], ['Personal data', 'birthPlace', 'combobox', 'Country'],
        ['Personal data', 'document', 'combobox', 'Document issued'], ['Personal data', 'document', 'combobox', 'Document expires'],
        ['Contacts', 'contacts', 'textbox', 'Mobile'], ['Contacts', 'contacts', 'textbox', 'Phone'],
        ['Contacts', 'emergency', 'textbox', 'Emergency contact'],
        ['Additional data', 'work', 'switch', 'Works remotely'], ['Additional data', 'work', 'group', 'Day starts at'],
        ['Additional data', 'work', 'textbox', 'Skills'], ['Additional data', 'work', 'textbox', 'Notes'],
        ['Additional data', 'work', 'combobox', 'Hired through'],
    ];
    for (const [name, group, role, label] of byName) {
        await tab(page, name).click();
        const box = page.locator(`[data-test="personal-form"] [data-test="group-${group}"]`);
        await expect(box.getByRole(role, { name: label, exact: true }), `${group}: no ${role} named «${label}»`).toHaveCount(1);
    }
});

test('filled through every component, each value saves itself and reads back', async ({ page }) => {
    // Employee 3, seeded in Germany: no tax code in the way. Every field is filled through the
    // control a person uses, and every one of them has to come back — a component the form did not
    // bind would save nothing and say nothing.
    await openPersonal(page, 3);

    await input(page, 'birthDate').fill('1990-04-12');
    await input(page, 'birthDate').press('Tab');
    await field(page, 'gender').getByText('Male', { exact: true }).click();
    await input(page, 'street').fill('Via Roma 1');
    await input(page, 'city').fill('Mil');
    await page.getByRole('option', { name: 'Milano' }).click();
    await input(page, 'postcode').fill('20121');
    await input(page, 'province').fill('MI');
    await field(page, 'documentType').locator('[role="combobox"]').click();
    await page.getByRole('option', { name: 'Passport' }).click();
    await input(page, 'documentNumber').fill('YA1234567');

    await tab(page, 'Contacts').click();
    await input(page, 'mobile').fill('3331234567');
    await field(page, 'channel').getByRole('radio', { name: 'SMS' }).click();
    await input(page, 'emergencyName').fill('Anna Becker');

    await tab(page, 'Additional data').click();
    for (const skill of ['Welding', 'PLC']) {
        await input(page, 'skills').fill(skill);
        await input(page, 'skills').press('Enter');
    }
    const [hour, minute] = [0, 1].map(i => field(page, 'startTime').getByRole('spinbutton').nth(i));
    for (let i = 0; i < 8; i++) await hour.press('ArrowUp');
    for (let i = 0; i < 15; i++) await minute.press('ArrowUp');
    await field(page, 'remote').getByRole('switch').click();
    for (let i = 0; i < 4; i++) await field(page, 'english').getByRole('slider').press('ArrowRight');
    await field(page, 'notes').locator('textarea').fill('Night shifts only in winter.');
    await field(page, 'marketing').getByRole('checkbox').click();
    await expect(status(page)).toHaveText('Saved');

    await awayAndBack(page);
    // As the picker shows it: typed as ISO, drawn in the reader's format.
    await expect(input(page, 'birthDate')).toHaveValue('04/12/1990');
    await expect(field(page, 'gender').getByRole('radio', { name: 'Male', exact: true })).toBeChecked();
    await expect(input(page, 'street')).toHaveValue('Via Roma 1');
    await expect(input(page, 'city')).toHaveValue('Milano');
    await expect(input(page, 'postcode')).toHaveValue('20121');
    await expect(input(page, 'province')).toHaveValue('MI');
    await expect(field(page, 'documentType').locator('[role="combobox"]')).toContainText('Passport');
    await expect(input(page, 'documentNumber')).toHaveValue('YA1234567');
    await tab(page, 'Contacts').click();
    await expect(input(page, 'mobile')).toHaveValue('+39 333 123 4567');
    await expect(field(page, 'channel').getByRole('radio', { name: 'SMS' })).toBeChecked();
    await expect(input(page, 'emergencyName')).toHaveValue('Anna Becker');
    await tab(page, 'Additional data').click();
    await expect(field(page, 'skills')).toContainText('Welding');
    await expect(field(page, 'skills')).toContainText('PLC');
    await expect(hour).toHaveAttribute('aria-valuenow', '8');
    await expect(minute).toHaveAttribute('aria-valuenow', '15');
    await expect(field(page, 'remote').getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expect(field(page, 'english').getByRole('slider')).toHaveAttribute('aria-valuenow', '4');
    await expect(field(page, 'notes').locator('textarea')).toHaveValue('Night shifts only in winter.');
    await expect(field(page, 'marketing').getByRole('checkbox')).toBeChecked();
});

test('the privacy consent is required: taking it back is refused on its own field', async ({ page }) => {
    await openPersonal(page);
    await tab(page, 'Additional data').click();
    await field(page, 'privacy').locator('pdx-checkbox').click(); // the seed gave it; take it back
    await expect(field(page, 'privacy').locator('.pdx-field-error'), 'the consent was taken back without a word')
        .toContainText('privacy consent');
    await expect(status(page)).toHaveText('Not saved');
});

test('leaving right after a valid change does not ask, and keeps it', async ({ page }) => {
    await openPersonal(page);
    await tab(page, 'Contacts').click();
    await input(page, 'email').fill('changed@example.com');
    // Before the pause is over: the change is saved on the way out, not lost and not asked about.
    await page.locator('[data-test="section-contracts"] a').click();
    await expect(page.locator('[data-test="contracts"]')).toBeVisible();
    await expect(leaveAsk(page)).toBeHidden();
    await page.locator('[data-test="section-personal"] a').click();
    await tab(page, 'Contacts').click();
    await expect(input(page, 'email')).toHaveValue('changed@example.com');
});

test('leaving with a refused value asks first; Stay keeps it', async ({ page }) => {
    await openPersonal(page);
    await tab(page, 'Contacts').click();
    await input(page, 'email').fill('not an email');
    await page.locator('[data-test="to-dashboard"]').click();
    const ask = leaveAsk(page);
    await expect(ask, 'left a refused value without asking').toBeVisible();
    await ask.getByRole('button', { name: 'Stay' }).click();
    await expect(page).toHaveURL(/\/employees\/1\/personal$/);
    await expect(input(page, 'email')).toHaveValue('not an email');
});

test('control — leaving without changes asks nothing', async ({ page }) => {
    await openPersonal(page);
    await page.locator('[data-test="to-dashboard"]').click();
    await expect(page).toHaveURL(/\/$/);
});

test('control — there is no delete anywhere on the entity', async ({ page }) => {
    await openList(page);
    await expect(page.getByRole('button', { name: /delete|remove|archive/i })).toHaveCount(0);
    await openPersonal(page);
    await expect(page.getByRole('button', { name: /delete|remove/i })).toHaveCount(0);
});

// ─── Contratti ────────────────────────────────────────────────────
//
// A contract is a period: a type, a start, an end (empty while open) and weekly hours. The four
// states the reference draws, a cross-field rule, and «Termina» with its way back instead of delete.

async function openContracts(page: Page, id = 1): Promise<void> {
    await page.goto(`/employees/${id}/contracts`);
    await expect(page.locator('[data-test="contracts"]')).toBeVisible();
}

const addDialog = (page: Page) => page.locator('[data-test="contract-dialog"] .pdx-dialog-panel');
const addInput = (page: Page, name: string) => addDialog(page).locator(`input[name="${name}"], [name="${name}"] input:not([type="hidden"])`).first();
const rows = (page: Page) => page.locator('[data-test="contract-row"]');

test('Contratti is in the detail\'s menu, under the Anagrafica', async ({ page }) => {
    await openPersonal(page);
    const entries = page.locator('[data-test="detail-menu"] [data-test^="section-"]');
    await expect(entries.nth(0)).toHaveAttribute('data-test', 'section-personal');
    await expect(entries.nth(1)).toHaveAttribute('data-test', 'section-contracts');
    await entries.nth(1).locator('a').click();
    await expect(page).toHaveURL(/\/employees\/1\/contracts$/);
});

test('Contratti: void → add in a modal → filled → edit in the page', async ({ page }) => {
    await openContracts(page, 12);
    const empty = page.locator('[data-test="contracts-empty"]');
    await expect(empty, 'a new employee is not invited to add a contract').toBeVisible();

    await empty.getByRole('button', { name: 'Add a contract' }).click();
    await expect(addDialog(page), 'the add is not a modal').toBeVisible();
    await addInput(page, 'start').fill('2026-01-01');
    await addInput(page, 'weeklyHours').fill('38');
    await addDialog(page).getByRole('button', { name: 'Add' }).click();
    await expect(addDialog(page)).toBeHidden();

    await expect(rows(page), 'the new contract is not listed').toHaveCount(1);
    await expect(rows(page).first()).toContainText('2026-01-01');
    await expect(rows(page).first()).toContainText('38');

    const url = page.url();
    await rows(page).first().getByRole('button', { name: 'Edit' }).click();
    const form = page.locator('[data-test="contract-form"]');
    await expect(form).toBeVisible();
    expect(page.url(), 'editing navigated away').toBe(url);
    await expect(page.locator('[role="dialog"]:visible'), 'the edit opened a modal').toHaveCount(0);
    await form.locator('[data-test="weeklyHours"] input:not([type="hidden"])').fill('20');
    await form.locator('[data-test="contract-save"] button').click();
    await expect(form).toBeHidden();
    await expect(rows(page).first()).toContainText('20');
    expect(page.url()).toBe(url);
});

test('Contratti: an end before the start is refused on the field', async ({ page }) => {
    // In the page's edit…
    await openContracts(page);
    await rows(page).first().getByRole('button', { name: 'Edit' }).click();
    const form = page.locator('[data-test="contract-form"]');
    await form.locator('[data-test="start"] input:not([type="hidden"])').fill('2026-05-01');
    await form.locator('[data-test="end"] input:not([type="hidden"])').fill('2026-04-01');
    await form.locator('[data-test="contract-save"] button').click();
    await expect(form.locator('pdx-form-field[name="end"] .pdx-field-error')).toContainText('after it starts');
    await expect(form, 'the refused save left the edit').toBeVisible();

    // …and in the add modal, which is built from a schema.
    await form.locator('[data-test="contract-cancel"] button').click();
    await page.locator('[data-test="contract-add"] button').click();
    await addInput(page, 'start').fill('2026-05-01');
    await addInput(page, 'end').fill('2026-04-01');
    await addDialog(page).getByRole('button', { name: 'Add' }).click();
    await expect(addDialog(page), 'the modal saved a contract that ends before it starts').toBeVisible();
    await expect(addDialog(page)).toContainText('after it starts');
});

test('Contratti: Termina asks for the end, ends the period, and Annulla restores it', async ({ page }) => {
    await openContracts(page);
    const open = rows(page).filter({ has: page.locator('[data-test="contract-end"]') });
    await expect(open, 'the seed has no open contract to end').toHaveCount(1);
    await open.getByRole('button', { name: 'End' }).click();

    const ask = page.locator('[data-test="end-dialog"]');
    await expect(ask.getByRole('alertdialog')).toBeVisible();
    await ask.locator('[data-test="end-date"] input:not([type="hidden"])').fill('2026-12-31');
    await ask.getByRole('button', { name: 'End the contract' }).click();

    await expect(page.locator('[data-test="contract-end"]'), 'the period is still open').toHaveCount(0);
    await expect(rows(page).nth(1)).toContainText('2026-12-31');

    await page.locator('[data-test="toasts"]').getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('[data-test="contract-end"]'), 'Undo did not reopen the period').toHaveCount(1);
    await expect(rows(page).nth(1)).not.toContainText('2026-12-31');
});

test('control — Contratti has no delete', async ({ page }) => {
    await openContracts(page);
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /delete|remove/i })).toHaveCount(0);
});

// ─── Sedi ─────────────────────────────────────────────────────────
//
// An assignment is a site, a role there, and a start. The site is picked from a PAGED, SEARCHED
// source, as intake picks a customer: fourteen sites, five a page, a name narrowed at the source.

async function openSites(page: Page, id = 1): Promise<void> {
    await page.goto(`/employees/${id}/sites`);
    await expect(page.locator('[data-test="sites"]')).toBeVisible();
}

const siteDialog = (page: Page) => page.locator('[data-test="site-dialog"] .pdx-dialog-panel');
const siteRows = (page: Page) => page.locator('[data-test="site-row"]');

test('Sedi is in the detail\'s menu, after the Contratti', async ({ page }) => {
    await openPersonal(page);
    const entries = page.locator('[data-test="detail-menu"] [data-test^="section-"]');
    await expect(entries.nth(1)).toHaveAttribute('data-test', 'section-contracts');
    await expect(entries.nth(2)).toHaveAttribute('data-test', 'section-sites');
    await entries.nth(2).locator('a').click();
    await expect(page).toHaveURL(/\/employees\/1\/sites$/);
});

test('Sedi: void → add with a paged, searched picker → filled → edit in the page', async ({ page }) => {
    await openSites(page, 12);
    const empty = page.locator('[data-test="sites-empty"]');
    await expect(empty, 'a new employee is not invited to assign a site').toBeVisible();
    await empty.getByRole('button', { name: 'Assign a site' }).click();
    await expect(siteDialog(page), 'the add is not a modal').toBeVisible();

    const picker = siteDialog(page).locator('[data-test="site-picker"]');
    // The BODY rows: the filter row `searchable` adds is a row too.
    const rows = picker.locator('[role="row"]:not(.pdx-dg-filter-row)').filter({ has: page.locator('[role="gridcell"]') });
    await expect(rows, 'the picker shows the whole table, not a page').toHaveCount(5);
    await expect(picker.locator('[role="navigation"]')).toContainText('14');

    // Page 2 is the source's, not a slice of page 1.
    const firstOnPageOne = await rows.first().innerText();
    await picker.getByRole('button', { name: '2' }).click();
    await expect(rows.first(), 'page 2 shows page 1 again').not.toHaveText(firstOnPageOne);

    // A typed name narrows the list THROUGH A REQUEST.
    await picker.locator('input[type="text"], input:not([type])').first().fill('milano');
    await expect.poll(() => rows.count(), { message: 'the list did not narrow' }).toBe(2);
    const asked = await page.evaluate(() => window.__pdxLastSiteRequest);
    expect(asked?.filter, 'the source was never asked to filter').toEqual([{ field: 'name', value: 'milano' }]);
    expect(asked?.total, 'the source answered with every site').toBe(2);

    await rows.first().locator('input[type="checkbox"]').check();
    await picker.getByRole('button', { name: 'Choose this site' }).click();
    await expect(siteDialog(page).locator('[data-test="site-chosen"]')).toContainText('Milano');
    await siteDialog(page).locator('[data-test="new-role"] input:not([type="hidden"])').fill('Technician');
    await siteDialog(page).locator('[data-test="new-start"] input:not([type="hidden"])').fill('2026-02-01');
    await siteDialog(page).locator('[data-test="site-assign"] button').click();
    await expect(siteDialog(page)).toBeHidden();

    await expect(siteRows(page), 'the assignment is not listed').toHaveCount(1);
    await expect(siteRows(page).first()).toContainText('Milano');
    await expect(siteRows(page).first()).toContainText('Technician');

    const url = page.url();
    await siteRows(page).first().getByRole('button', { name: 'Edit' }).click();
    const form = page.locator('[data-test="site-form"]');
    await expect(form).toBeVisible();
    expect(page.url(), 'editing navigated away').toBe(url);
    await expect(page.locator('[role="dialog"]:visible'), 'the edit opened a modal').toHaveCount(0);
    await form.locator('[data-test="role"] input:not([type="hidden"])').fill('Site lead');
    await form.locator('[data-test="site-save"] button').click();
    await expect(form).toBeHidden();
    await expect(siteRows(page).first()).toContainText('Site lead');
    expect(page.url()).toBe(url);
});

test('Sedi: an assignment is not added without a site', async ({ page }) => {
    await openSites(page, 12);
    await page.locator('[data-test="sites-empty"]').getByRole('button', { name: 'Assign a site' }).click();
    await siteDialog(page).locator('[data-test="new-role"] input:not([type="hidden"])').fill('Technician');
    await siteDialog(page).locator('[data-test="new-start"] input:not([type="hidden"])').fill('2026-02-01');
    await siteDialog(page).locator('[data-test="site-assign"] button').click();
    await expect(siteDialog(page), 'an assignment was added with no site').toBeVisible();
    await expect(siteDialog(page).locator('[data-test="site-missing"]')).toBeVisible();
});

test('Sedi: Termina asks for the end, ends the assignment, and Annulla restores it', async ({ page }) => {
    await openSites(page);
    await expect(page.locator('[data-test="site-end"]'), 'the seed has no current assignment').toHaveCount(1);
    await page.locator('[data-test="site-end"]').getByRole('button', { name: 'End' }).click();

    const ask = page.locator('[data-test="site-end-dialog"]');
    await expect(ask.getByRole('alertdialog')).toBeVisible();
    await ask.locator('[data-test="site-end-date"] input:not([type="hidden"])').fill('2026-12-31');
    await ask.getByRole('button', { name: 'End the assignment' }).click();

    await expect(page.locator('[data-test="site-end"]'), 'the assignment is still current').toHaveCount(0);
    await expect(siteRows(page).first()).toContainText('2026-12-31');

    await page.locator('[data-test="toasts"]').getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('[data-test="site-end"]'), 'Undo did not restore the assignment').toHaveCount(1);
    await expect(siteRows(page).first()).not.toContainText('2026-12-31');
});

test('control — Sedi has no delete', async ({ page }) => {
    await openSites(page);
    await expect(siteRows(page).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /delete|remove/i })).toHaveCount(0);
});

// ─── Documenti ────────────────────────────────────────────────────
//
// The ticket's upload flow, keyed by the employee: `<pdx-attachment-upload>` and the same mock.
// The mock's state lives in the preview process, so ONE EMPLOYEE PER TEST, as `attachments.spec.ts`
// does with tickets: a test that assumed an empty list would read the leftovers of the one before.

async function openDocuments(page: Page, id: number): Promise<void> {
    const firstList = page.waitForResponse((r) =>
        r.url().includes(`/api/attachments?employee=${id}`) && r.request().method() === 'GET');
    await page.goto(`/employees/${id}/documents`);
    await expect(page.locator('[data-test="documents"]')).toBeVisible();
    // The list the page fetches on mount: without it the void state is also what shows before it.
    await firstList;
}

async function uploadDocument(page: Page, name: string): Promise<void> {
    await page.locator('[data-test="picker"] input[type="file"]').setInputFiles({
        name, mimeType: 'application/pdf', buffer: Buffer.alloc(2048, 7),
    });
    await expect(page.locator(`[data-test="doc-row"][data-name="${name}"]`)).toBeVisible();
}

const docRows = (page: Page) => page.locator('[data-test="doc-row"]');

test('Documenti is in the detail\'s menu, after the Sedi', async ({ page }) => {
    await openPersonal(page);
    const entries = page.locator('[data-test="detail-menu"] [data-test^="section-"]');
    await expect(entries.nth(3)).toHaveAttribute('data-test', 'section-documents');
    await entries.nth(3).locator('a').click();
    await expect(page).toHaveURL(/\/employees\/1\/documents$/);
});

test('Documenti: void → upload → filled, and the list is the server\'s', async ({ page }) => {
    await openDocuments(page, 3);
    await expect(page.locator('[data-test="documents-empty"]'), 'no invitation to upload').toBeVisible();

    await uploadDocument(page, 'contract-2026.pdf');
    await expect(page.locator('[data-test="documents-empty"]')).toBeHidden();
    await expect(docRows(page)).toHaveCount(1);

    // The server holds it under the EMPLOYEE, not under a ticket.
    const held = await page.evaluate(async () => (await fetch('/api/attachments?employee=3')).json());
    expect(held.map((d: { name: string }) => d.name)).toEqual(['contract-2026.pdf']);
    const onTicket = await page.evaluate(async () => (await fetch('/api/attachments?ticket=3')).json());
    expect(onTicket, 'the document landed on ticket 3').toEqual([]);
});

test('Documenti: the download is saved under the server\'s name', async ({ page }) => {
    await openDocuments(page, 4);
    await uploadDocument(page, 'id-card.pdf');
    const download = page.waitForEvent('download');
    await docRows(page).first().locator('[data-test="doc-download"] button').click();
    expect((await download).suggestedFilename()).toBe('id-card.pdf');
});

test('Documenti: the label and expiry are edited in the page, and an expired one is marked', async ({ page }) => {
    await openDocuments(page, 5);
    await uploadDocument(page, 'permit.pdf');
    const url = page.url();

    await docRows(page).first().getByRole('button', { name: 'Edit' }).click();
    const form = page.locator('[data-test="doc-form"]');
    await expect(form).toBeVisible();
    expect(page.url(), 'editing navigated away').toBe(url);
    await expect(page.locator('[role="dialog"]:visible'), 'the edit opened a modal').toHaveCount(0);

    await form.locator('[data-test="label"] input:not([type="hidden"])').fill('Work permit');
    await form.locator('[data-test="expires"] input:not([type="hidden"])').fill('2020-01-31');
    await form.locator('[data-test="doc-save"] button').click();
    await expect(form).toBeHidden();

    const row = docRows(page).first();
    await expect(row).toContainText('Work permit');
    await expect(row.locator('[data-test="doc-expired"]'), 'an expired document is not marked').toBeVisible();
    expect(page.url()).toBe(url);

    // The label is the SERVER's now, not only the screen's.
    await page.reload();
    await expect(docRows(page).first()).toContainText('Work permit');
});

test('control — a document that has not expired is not marked', async ({ page }) => {
    await openDocuments(page, 8);
    await uploadDocument(page, 'passport.pdf');
    await docRows(page).first().getByRole('button', { name: 'Edit' }).click();
    const form = page.locator('[data-test="doc-form"]');
    await form.locator('[data-test="expires"] input:not([type="hidden"])').fill('2099-12-31');
    await form.locator('[data-test="doc-save"] button').click();
    await expect(form).toBeHidden();
    await expect(docRows(page).first().locator('[data-test="doc-expired"]')).toHaveCount(0);
});

test('Documenti: withdraw takes it off the list, and Annulla brings it back', async ({ page }) => {
    await openDocuments(page, 6);
    await uploadDocument(page, 'old-contract.pdf');
    await docRows(page).first().getByRole('button', { name: 'Withdraw' }).click();
    await expect(docRows(page), 'the document is still listed').toHaveCount(0);

    await page.locator('[data-test="toasts"]').getByRole('button', { name: 'Undo' }).click();
    await expect(docRows(page), 'Undo did not bring it back').toHaveCount(1);
    await expect(docRows(page).first()).toHaveAttribute('data-name', 'old-contract.pdf');
});

test('control — Documenti has no delete', async ({ page }) => {
    await openDocuments(page, 7);
    await uploadDocument(page, 'cv.pdf');
    // The drop zone's own «Remove cv.pdf» counted too, and rightly: after the upload it still listed
    // the stored file with a ×, which reads as delete. The zone is emptied once the file is stored.
    await expect(page.getByRole('button', { name: /delete|remove/i })).toHaveCount(0);
});

// ─── Loaded once, by the employee route (CD-D1) ────────────────────
//
// The route shows the count and the section shows the list, from one fetch: two fetches would be
// two requests on landing, and after an upload the count would stay where it was until the next
// navigation.

test('landing on Documenti asks for the list ONCE', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (r) => {
        if (r.method() === 'GET' && r.url().includes('/api/attachments?employee=9')) asked.push(r.url());
    });
    await openDocuments(page, 9);
    await expect(page.locator('[data-test="documents-empty"]')).toBeVisible();
    // Settled: nothing else on the page is still on its way to asking.
    await page.waitForLoadState('networkidle');
    expect(asked, 'the route and its section each fetched the list').toHaveLength(1);
});

test('the list is the answer for THIS employee, whichever answer arrives last', async ({ page }) => {
    // On landing the route may ask twice: once for `?employee=` — before the id prop arrives — and
    // once for the real id. A list that takes whichever answer comes LAST loses the documents when
    // the empty one is slower, which a loaded gate makes happen. Made deterministic here by holding
    // the empty-id answer back.
    await openDocuments(page, 12);
    await uploadDocument(page, 'visa.pdf');

    const heldBack = page.waitForResponse((r) => /\/api\/attachments\?employee=$/.test(r.url()), { timeout: 5000 })
        .then(() => true, () => false);
    await page.route(/\/api\/attachments\?employee=$/, async (route) => {
        await new Promise((r) => setTimeout(r, 800));
        await route.continue();
    });
    await page.reload();
    await expect(docRows(page).first()).toHaveAttribute('data-name', 'visa.pdf');
    // If the empty request was made, its answer has to have landed before the list is read again.
    if (await heldBack) await page.waitForTimeout(100);
    await expect(docRows(page), 'a late answer for employee "" emptied the list').toHaveCount(1);
});

test('an upload moves the count on the menu, without a navigation', async ({ page }) => {
    await openDocuments(page, 11);
    const count = page.locator('[data-test="count-documents"]');
    await expect(count, 'employee 11 started with documents').toHaveCount(0);
    const url = page.url();

    await uploadDocument(page, 'medical.pdf');
    await expect(count, 'the menu still counts the list it read on landing').toHaveText('1');
    expect(page.url()).toBe(url);
});

// ─── The forms use the library's controls ─────────────────────────
//
// Every date in these forms is the PDX calendar, not the browser's own `<input type="date">`, and
// the weekly hours are not a native number input. The forms
// are in the DOM even while hidden (`:show`), the add and End dialogs' too, so loading the page is
// enough to see every field.

for (const path of ['/employees/1/personal', '/employees/1/contracts', '/employees/1/sites', '/employees/1/documents', '/intake']) {
    test(`${path}: no date or number field is the browser's native input`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('main pdx-date-picker').first(), 'the page has no PDX date field at all')
            .toBeAttached();
        const native = await page.locator('main').evaluate((m) =>
            [...m.querySelectorAll('input[type="date"], input[type="number"]')]
                .map((i) => i.closest('[data-test]')?.getAttribute('data-test') ?? i.getAttribute('name')));
        expect(native, 'these are still native inputs').toEqual([]);
    });
}

test('control — the customer detail is untouched', async ({ page }) => {
    await page.goto('/customers/1');
    await expect(page.locator('[data-test="customer"]')).toBeVisible();
    await expect(page.locator('[data-test="section-profile"]')).toBeVisible();
    await expect(page.locator('[data-test="section-contacts"]')).toBeVisible();
});

// ─── The record's head, pager, counts and actions ────────────────
//
// As in the reference, the record page has a header with the name and whether
// the person is still active, a pager that walks the list the reader came from, counts on the
// sections, and the record's actions over it. The section menu is part of the page, not a card
// hanging in it. No Delete: an employee is ENDED.

const head = (page: Page) => page.locator('[data-test="record-head"]');
const pager = (page: Page) => page.locator('[data-test="record-pager"]');

test('the header names the person and says they are active', async ({ page }) => {
    await openPersonal(page, 1);
    await expect(head(page).locator('h1')).toHaveText('Ada Rossi');
    await expect(page.locator('[data-test="record-status"]')).toHaveText('Active');
});

test('the pager walks the list in the order the reader left it, and keeps the section', async ({ page }) => {
    await openList(page);
    await page.locator('[data-test="grid"] [role="columnheader"]', { hasText: 'Last name' }).click();
    const refs = await page.locator('[data-test="grid"] .pdx-dg-body .pdx-dg-row').evaluateAll(
        (els) => els.map((e) => e.getAttribute('data-row-id')));
    const total = Number((await page.locator('[data-test="total"]').innerText()).replace(/\D/g, ''));

    await page.locator('[data-test="grid"] .pdx-dg-body .pdx-dg-row').nth(1).click();
    await expect(pager(page)).toContainText(`2 / ${total}`);

    await page.locator('[data-test="section-contracts"] a').click();
    await expect(page).toHaveURL(new RegExp(`/employees/${refs[1]}/contracts$`));
    await pager(page).getByRole('button', { name: 'Next' }).click();
    await expect(page, 'next is not the third row of that sort, in the same section')
        .toHaveURL(new RegExp(`/employees/${refs[2]}/contracts$`));
    await expect(pager(page)).toContainText(`3 / ${total}`);
});

test('the pager\'s previous is disabled on the first record, and next on the last', async ({ page }) => {
    await openList(page);
    await page.locator('[data-test="grid"] .pdx-dg-body .pdx-dg-row').first().click();
    await expect(pager(page)).toContainText('1 / ');
    await expect(pager(page).getByRole('button', { name: 'Previous' })).toBeDisabled();
    await expect(pager(page).getByRole('button', { name: 'Next' })).toBeEnabled();
});

test('control — a record opened from a filtered list pages only within that filter', async ({ page }) => {
    await openList(page);
    // The filter on the grid's source, which is what its toolbar writes.
    await page.locator('[data-test="grid"]').evaluate((el) => (el as unknown as {
        grid: { source: { setFilter(f: unknown[]): void } } }).grid.source.setFilter([{ field: 'country', operator: 'eq', value: 'IT' }]));
    await expect(page.locator('[data-test="total"]')).not.toHaveText('12 matching');
    const total = Number((await page.locator('[data-test="total"]').innerText()).replace(/\D/g, ''));
    expect(total, 'the premise: the filter narrowed the list').toBeLessThan(12);
    await page.locator('[data-test="grid"] .pdx-dg-body .pdx-dg-row').first().click();
    await expect(pager(page)).toContainText(`1 / ${total}`);
});

test('each section carries its count, read from the record', async ({ page }) => {
    await openPersonal(page, 1);
    const count = page.locator('[data-test="count-contracts"]');
    await expect(count).toHaveText('2');
    await page.locator('[data-test="section-contracts"] a').click();
    await expect(page.locator('[data-test="contract-row"]')).toHaveCount(2);
    await expect(page.locator('[data-test="count-sites"]')).toHaveText('1');

    // The void record: no count where there is nothing to count.
    await openPersonal(page, 12);
    await expect(page.locator('[data-test="count-contracts"]')).toHaveCount(0);
});

test('Cessa rapporto ends the open contract, and the header says the person is no longer active', async ({ page }) => {
    await openPersonal(page, 1);
    await head(page).getByRole('button', { name: 'End employment' }).click();
    const ask = page.locator('[data-test="end-employment-dialog"]');
    await expect(ask.getByRole('alertdialog')).toBeVisible();
    await ask.locator('[data-test="end-employment-date"] input:not([type="hidden"])').fill('2026-06-30');
    await ask.getByRole('button', { name: 'End employment' }).click();

    await expect(page.locator('[data-test="record-status"]')).toContainText('Not active');
    await page.locator('[data-test="section-contracts"] a').click();
    await expect(page.locator('[data-test="contract-end"]'), 'a contract is still open').toHaveCount(0);
    await expect(page.locator('[data-test="contract-row"]').nth(1)).toContainText('2026-06-30');
});

test('control — with no open contract there is nothing to end', async ({ page }) => {
    await openPersonal(page, 12);
    await expect(head(page).getByRole('button', { name: 'End employment' })).toBeDisabled();
});

test('Print prints the record, with the shell left out', async ({ page }) => {
    await page.addInitScript(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++; }; });
    await openPersonal(page, 1);
    await head(page).getByRole('button', { name: 'Print' }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('[data-test="sidebar"]'), 'the rail is on the printed page').toBeHidden();
    await expect(head(page)).toBeVisible();
});

test('the section menu is part of the page, not a card, and stays in view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 600 });
    await openPersonal(page, 1);
    const menu = page.locator('[data-test="detail-menu"]');
    const look = await menu.evaluate((el) => {
        const cs = getComputedStyle(el);
        const pageBg = getComputedStyle(el.closest('main')!).backgroundColor;
        return { shadow: cs.boxShadow, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, pageBg };
    });
    expect(look.shadow, 'the menu is a card: it has a shadow').toBe('none');
    expect(look.radius).toBe('0px');
    expect(['rgba(0, 0, 0, 0)', look.pageBg], `the menu has its own ground: ${look.bg}`).toContain(look.bg);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY), 'the premise: the section is longer than the window').toBeGreaterThan(0);
    const top = await page.locator('[data-test="section-personal"]').evaluate((el) => el.getBoundingClientRect().top);
    expect(top, 'the menu scrolled away with the section').toBeGreaterThanOrEqual(0);
});

// A closed confirmation takes no room, on a page with no other dialog. pdx-alert-dialog renders the
// dialog's classes, so it has to import their stylesheet itself: relying on a pdx-dialog elsewhere
// on the page to bring it draws the closed dialog inline on the personal section, which has none.
for (const section of ['personal', 'contracts']) {
    test(`on /employees/1/${section} the closed End employment dialog takes no room`, async ({ page }) => {
        await page.goto(`/employees/1/${section}`);
        await expect(page.locator('[data-test="record-head"]')).toBeVisible();
        const dialog = page.locator('[data-test="end-employment-dialog"]');
        await expect(dialog.getByRole('alertdialog'), 'the closed dialog is drawn in the page').toBeHidden();
        expect(await dialog.evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBe(0);
    });
}

// ─── The header's actions read as actions ────────────────────────
//
// A ghost button beside the title reads as text, so End employment and Print have an edge and an
// icon; and «1 / 12» has room on both sides, not touching the pager's arrows.

test('End employment and Print are drawn as buttons: an edge and an icon each', async ({ page }) => {
    await page.goto('/employees/1/personal');
    for (const name of ['end-employment', 'print']) {
        const button = page.locator(`[data-test="${name}"] button`);
        await expect(button).toBeVisible();
        // A width AND a colour: a ghost button carries a 1px transparent border, which is no edge.
        const edge = await button.evaluate((el) => {
            const cs = getComputedStyle(el);
            const alpha = /rgba?\([^)]*?,\s*([\d.]+)\)$/.exec(cs.borderTopColor)?.[1];
            return { width: parseFloat(cs.borderTopWidth), visible: cs.borderTopColor !== 'transparent' && alpha !== '0' };
        });
        expect(edge.width, `${name} has no edge: it reads as text`).toBeGreaterThan(0);
        expect(edge.visible, `${name}'s edge is transparent: it reads as text`).toBe(true);
        await expect(page.locator(`[data-test="${name}"] pdx-icon`), `${name} has no icon`).toHaveCount(1);
    }
});

test('the pager\'s position has room on both sides, and the arrows do not move from 1 / 12 to 10 / 12', async ({ page }) => {
    const measure = async () => page.locator('[data-test="record-pager"]').evaluate((pager) => {
        const [prev, label, next] = [...pager.children].map((el) => el.getBoundingClientRect());
        return { left: label.left - prev.right, right: next.left - label.right, prevX: prev.left, nextX: next.left };
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/employees/1/personal');
    await expect(page.locator('[data-test="record-pager"]')).toContainText('1 / 12');
    const first = await measure();
    expect(first.left, 'the position touches the previous arrow').toBeGreaterThanOrEqual(8);
    expect(first.right, 'the position touches the next arrow').toBeGreaterThanOrEqual(8);

    await page.goto('/employees/10/personal');
    await expect(page.locator('[data-test="record-pager"]')).toContainText('10 / 12');
    const tenth = await measure();
    expect(Math.round(tenth.prevX - first.prevX), 'the previous arrow moved').toBe(0);
    expect(Math.round(tenth.nextX - first.nextX), 'the next arrow moved').toBe(0);
});

// ─── A refused value on another tab is not lost from sight ────────
//
// The tab is marked: switching tab hides the refused field and its error, and «Not saved» in the bar
// does not say where. Nothing is reverted — the value stays until it is corrected.

const tabBadge = (page: Page, tabKey: string) => page.locator(`[data-test="tab-errors-${tabKey}"]`);

test('a refused tax code, then Contacts: the Personal data tab says 1, Contacts says nothing', async ({ page }) => {
    await openPersonal(page);
    await input(page, 'taxCode').fill('RSSDAA80A01H501');
    await expect(status(page)).toHaveText('Not saved');
    await tab(page, 'Contacts').click();

    await expect(tabBadge(page, 'personal')).toBeVisible();
    await expect(tabBadge(page, 'personal')).toHaveText('1');
    await expect(tabBadge(page, 'contacts')).toBeHidden();
    // Its accessible name says so, not only its colour.
    await expect(page.locator('[data-test="personal-tabs"]').getByRole('tab', { name: 'Personal data, 1 error' })).toHaveCount(1);
});

test('«Not saved» leads to the field: its tab opens, and the field has the focus', async ({ page }) => {
    await openPersonal(page);
    await input(page, 'taxCode').fill('RSSDAA80A01H501');
    await expect(status(page)).toHaveText('Not saved');
    await tab(page, 'Contacts').click();

    await status(page).getByRole('button', { name: 'Not saved' }).click();
    await expect(page.locator('[data-test="personal-tabs"]').getByRole('tab', { selected: true })).toHaveAttribute('data-tab', 'personal');
    await expect(input(page, 'taxCode')).toBeFocused();
});

test('correcting it takes the mark away, and the bar says Saved', async ({ page }) => {
    await openPersonal(page);
    await input(page, 'taxCode').fill('RSSDAA80A01H501');
    await expect(tabBadge(page, 'personal')).toHaveText('1');
    await input(page, 'taxCode').fill('RSSDAA80A01H501Z');
    await expect(status(page)).toHaveText('Saved');
    await expect(tabBadge(page, 'personal')).toBeHidden();
});

test('control — a valid change on Contacts leaves no mark on any tab', async ({ page }) => {
    await openPersonal(page);
    await tab(page, 'Contacts').click();
    await input(page, 'phone').fill('045 1234567');
    await expect(status(page)).toHaveText('Saved');
    for (const key of ['personal', 'contacts', 'additional']) await expect(tabBadge(page, key)).toBeHidden();
});
