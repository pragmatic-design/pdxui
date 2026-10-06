/**
 * The checkbox page's "Select all" parents are wired, measured with getByRole in Chromium: the
 * parent sets every child, and a child makes the parent all / none / mixed — not a static
 * indeterminate box that does nothing and that nothing updates.
 */
import { test, expect } from '@playwright/test';

test('"Select all items" checks A, B and C; unchecking B makes it mixed; unchecking all clears it', async ({ page }) => {
    await page.goto('/components/pdx-checkbox', { waitUntil: 'networkidle' });
    const parent = page.getByRole('checkbox', { name: 'Select all items' });
    const children = ['Item A', 'Item B', 'Item C'].map(n => page.getByRole('checkbox', { name: n, exact: true }));
    await expect(parent).toHaveAttribute('aria-checked', 'mixed');

    await parent.click();
    for (const c of children) await expect(c).toBeChecked();
    await expect(parent).toBeChecked();
    await expect(parent).not.toHaveAttribute('aria-checked', 'mixed');

    await children[1].click();
    await expect(children[1]).not.toBeChecked();
    await expect(parent).toHaveAttribute('aria-checked', 'mixed');

    await children[0].click();
    await children[2].click();
    await expect(parent).not.toBeChecked();
    await expect(parent).not.toHaveAttribute('aria-checked', 'mixed');

    // The Source block shows the loop as text: an `@for` written plainly there is compiled, and the
    // block renders the three checkboxes again instead of the code.
    await expect(page.locator('pre code', { hasText: 'Select all items' })).toContainText('@for (items as item; track item.label) {');
});

test('the Permissions "Select all" clears every permission, then checking one makes it mixed', async ({ page }) => {
    await page.goto('/components/pdx-checkbox', { waitUntil: 'networkidle' });
    const parent = page.getByRole('checkbox', { name: 'Select all', exact: true });
    // The label wraps the description too: the name is "Read View content".
    const perms = ['Read', 'Write', 'Delete', 'Admin'].map(n => page.getByRole('checkbox', { name: new RegExp(`^${n} `) }));
    await expect(parent).toHaveAttribute('aria-checked', 'mixed');

    await parent.click();                       // mixed → checked: every permission on
    for (const p of perms) await expect(p).toBeChecked();
    await parent.click();                       // checked → unchecked: every permission off
    for (const p of perms) await expect(p).not.toBeChecked();

    await perms[3].click();
    await expect(parent).toHaveAttribute('aria-checked', 'mixed');
});
