/**
 * The comment thread recipe on pdx-list's page, measured in Chromium (#1022).
 *
 * A thread is a composition of pdx-list, pdx-avatar, pdx-relative-time, pdx-textarea and pdx-button,
 * not a component. What the recipe teaches is held here:
 * - Ctrl+Enter sends and keeps the writer in the field.
 * - An empty comment cannot be sent.
 * - A reply opens in place and takes focus; Escape closes it and gives focus back to its Reply button.
 * - A deleted comment hands focus to the composer instead of dropping it on <body>.
 * - Each change is announced, and the avatar is not read out a second time beside the author's name.
 */
import { test, expect, type Page } from './fixture';

const thread = (page: Page) => page.locator('[data-test="comment-thread"]');

test.beforeEach(async ({ page }) => {
    await page.goto('/components/pdx-list', { waitUntil: 'networkidle' });
    await expect(thread(page)).toHaveCount(1);
});

test('the thread lists its comments and their replies, each named by author and text', async ({ page }) => {
    const t = thread(page);
    // Two comments in the list's own items; the reply is in its comment's list, not a third item.
    await expect(t.locator('pdx-list [data-part="item"]')).toHaveCount(2);
    await expect(t.getByRole('article', { name: /^Alice Johnson, / })).toBeVisible();
    await expect(t.getByRole('list', { name: 'Replies' }).getByRole('article', { name: /^Bob Smith, / })).toBeVisible();
    // The avatar is decoration beside the written name: it is hidden from the accessibility tree.
    await expect(t.getByRole('img')).toHaveCount(0);
});

test('an empty comment cannot be sent; Ctrl+Enter sends one and keeps focus in the field', async ({ page }) => {
    const t = thread(page);
    const send = t.getByRole('button', { name: 'Comment', exact: true });
    await expect(send).toBeDisabled();
    const field = t.getByRole('textbox', { name: 'Add a comment' });
    await field.fill('Streaming fixed it.');
    await expect(send).toBeEnabled();
    await field.press('Control+Enter');
    await expect(t.getByRole('article', { name: 'You, Streaming fixed it.' })).toBeVisible();
    await expect(field).toHaveValue('');
    await expect(field).toBeFocused();
    await expect(t.locator('[data-test="announce"]')).toHaveText('Comment added.');
});

test('Reply opens a field with focus; Escape closes it and returns focus to Reply', async ({ page }) => {
    const t = thread(page);
    const first = t.getByRole('article', { name: /^Alice Johnson, / });
    const reply = first.getByRole('button', { name: 'Reply', exact: true }).first();
    await reply.click();
    const field = t.getByRole('textbox', { name: 'Reply to Alice Johnson' });
    await expect(field).toBeFocused();
    await field.press('Escape');
    await expect(field).toHaveCount(0);
    await expect(reply).toBeFocused();
});

test('a reply is added under its comment, one level deep', async ({ page }) => {
    const t = thread(page);
    const first = t.getByRole('article', { name: /^Alice Johnson, / });
    await first.getByRole('button', { name: 'Reply', exact: true }).first().click();
    await t.getByRole('textbox', { name: 'Reply to Alice Johnson' }).fill('Thanks, both.');
    await t.locator('[data-test="reply-form"]').getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(first.getByRole('list', { name: 'Replies' }).getByRole('article', { name: 'You, Thanks, both.' })).toBeVisible();
    await expect(t.locator('[data-test="announce"]')).toHaveText('Reply added.');
});

test('deleting your comment removes it, announces it, and moves focus to the composer', async ({ page }) => {
    const t = thread(page);
    const mine = t.getByRole('article', { name: /^You, I will page the writer/ });
    await mine.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(mine).toHaveCount(0);
    await expect(t.locator('[data-test="announce"]')).toHaveText('Comment deleted.');
    await expect(t.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
    // Only the signed-in person's comments can be deleted.
    await expect(t.getByRole('article', { name: /^Alice Johnson, / }).getByRole('button', { name: 'Delete' })).toHaveCount(0);
});
