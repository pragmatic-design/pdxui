// CRUD primitives —pdx-entity-grid composes data-grid + edit-drawer + bulk-actions.
// The edit-drawer mounts pdx-form-template imperatively, and the drawer portals to <body> when an
// ancestor would trap it, so the form/inputs are queried globally, not under the subject.
import { test } from '@playwright/test';
import { mount, SUBJECT, expect } from './helpers';

const COLS = JSON.stringify([{ field: 'name', header: 'Name' }]);
const DATA = JSON.stringify([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
const SCHEMA = JSON.stringify({ fields: [{ name: 'name', type: 'text', label: 'Name' }] });
const NEW = `${SUBJECT} .pdx-entity-grid-toolbar .pdx-primary`;

test.describe('entity-grid (CRUD composition)', () => {
    test('renders rows + a New button + per-row edit/delete actions', async ({ page }) => {
        await mount(page, 'pdx-entity-grid', { attrs: { columns: COLS, data: DATA, schema: SCHEMA, title: 'Users' } });
        expect(await page.$$eval(`${SUBJECT} .pdx-dg-row`, (els) => els.length)).toBe(2);
        expect(await page.$(NEW)).toBeTruthy();
        expect(await page.$$eval(`${SUBJECT} .pdx-dg-action`, (els) => els.length)).toBe(4);
    });

    // A row's actions are named after the row, and a delete asks first (confirmDelete,
    // default true): the row goes once the confirmation is accepted, not before.
    test('row delete asks, then optimistically removes the row', async ({ page }) => {
        await mount(page, 'pdx-entity-grid', { attrs: { columns: COLS, data: DATA, schema: SCHEMA } });
        await page.locator(SUBJECT).getByRole('button', { name: 'Delete Alice' }).click();
        const confirm = page.getByRole('alertdialog', { name: 'Delete Alice?' });
        await expect(confirm).toBeVisible();
        await expect(page.locator(`${SUBJECT} .pdx-dg-row`)).toHaveCount(2);
        await confirm.getByRole('button', { name: 'Delete' }).click();
        await expect(page.locator(`${SUBJECT} .pdx-dg-row`)).toHaveCount(1);
        await expect(page.locator(SUBJECT).getByRole('button', { name: 'Delete Bob' })).toBeVisible();
    });

    test('New opens the edit drawer (portaled to body) with the schema form', async ({ page }) => {
        await mount(page, 'pdx-entity-grid', { attrs: { columns: COLS, data: DATA, schema: SCHEMA } });
        await page.locator(NEW).click();
        await page.waitForTimeout(300);
        expect(await page.$eval('.pdx-drawer-backdrop', (e) => e.hasAttribute('data-open'))).toBe(true);
        expect(await page.locator('.pdx-drawer input[name="name"]').count()).toBe(1);
    });

    test('create: filling the form and saving adds a row', async ({ page }) => {
        await mount(page, 'pdx-entity-grid', { attrs: { columns: COLS, data: DATA, schema: SCHEMA } });
        await page.locator(NEW).click();
        await page.waitForTimeout(300);
        await page.locator('.pdx-drawer input[name="name"]').fill('Carol');
        await page.locator('.pdx-drawer button:has-text("Save")').click();
        await page.waitForTimeout(250);
        expect(await page.$$eval(`${SUBJECT} .pdx-dg-row`, (els) => els.length)).toBe(3);
    });

    test('edit: opening a row preloads the form with its values', async ({ page }) => {
        await mount(page, 'pdx-entity-grid', { attrs: { columns: COLS, data: DATA, schema: SCHEMA } });
        await page.locator(SUBJECT).getByRole('button', { name: 'Edit Alice' }).click();
        await expect(page.locator('.pdx-drawer input[name="name"]')).toHaveValue('Alice');
    });
});
