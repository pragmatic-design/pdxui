/**
 * The login slice, end to end, against the production build.
 *
 * The acceptance criterion: a real login, not a fake dropdown of users. So nothing here reaches into the store, and no test sets a token: every step
 * goes through the rendered DOM, and what the server is asked is what a person's clicking asks it.
 *
 * The line `permissions.md` documents, one assertion per arrow:
 *
 *   login → setTokens() → user → setPermissions(from that user) → hasPermission / @guard
 *         → expiry → clear()
 *
 * Two roles, because one proves nothing: `admin` may close the month, `tech` may not — and the
 * difference has to be visible twice over, as a button that is absent and as a call that is
 * refused. A showcase that only hides the button teaches the half of the job that is not security.
 */
import { test, expect, type Page } from './fixture';
import { demo } from './demo';
import { GUEST } from './session';

// The slice from the start: a visitor with no session, who signs in through the form. The rest of
// the suite starts signed in.
test.use({ storageState: GUEST });

const fill = (page: Page, field: string, value: string) =>
    page.locator(`[data-test="${field}"] input`).fill(value);

/**
 * Sign in through the form, as a person does, landing on the account page these rows read. `ttl`
 * is the only lever a test pulls.
 */
async function signIn(page: Page, username: string, ttl?: number): Promise<void> {
    await page.goto(ttl ? `/login?next=%2Faccount&ttl=${ttl}` : '/login?next=%2Faccount');
    await expect(page.locator('[data-test="login-form"]')).toBeVisible();
    await fill(page, 'username', username);
    await fill(page, 'password', 'pdx');
    await page.locator('[data-test="sign-in"] button').click();
}

// ─── The sign-in stands alone ─────────────────────────────────────
//
// Inside the shell it would show a rail of screens a visitor who is not signed in cannot open, and
// a bar with nobody in it. The shell is the app's default layout, and the sign-in opts out.

test('the sign-in is drawn without the shell, centred', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await expect(page.locator('[data-test="login-form"]')).toBeVisible();
    await expect(page.locator('[data-test="sidebar"]'), 'the rail is around the sign-in').toHaveCount(0);
    await expect(page.locator('.app-bar'), 'the bar is around the sign-in').toHaveCount(0);

    const box = await page.locator('[data-test="login"]').boundingBox();
    const centre = box!.x + box!.width / 2;
    expect(Math.abs(centre - 720), `the panel's centre is at ${centre}, not in the middle`).toBeLessThanOrEqual(2);
});

test('control — once signed in, the screens are in the shell', async ({ page }) => {
    await signIn(page, 'admin');
    await expect(page.locator('[data-test="account"]')).toBeVisible();
    await expect(page.locator('[data-test="sidebar"]')).toBeVisible();
    await expect(page.locator('.app-bar')).toBeVisible();
    // The page is IN the shell's main, not beside it.
    await expect(page.locator('.app main [data-test="account"]'), 'the page rendered outside the shell').toHaveCount(1);
});

test('a guarded route sends an unauthenticated visitor to the login', async ({ page }) => {
    await page.goto('/account');
    await expect(page.locator('[data-test="login"]')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
    // And the page it refused never rendered — a guard that lets the page paint first is a guard
    // that leaked whatever was on it.
    await expect(page.locator('[data-test="account"]')).toHaveCount(0);
});

test('a wrong password is refused, in the server\'s own words, and nothing is signed in', async ({ page }) => {
    await page.goto('/login');
    await fill(page, 'username', 'admin');
    await fill(page, 'password', 'wrong');
    await page.locator('[data-test="sign-in"] button').click();

    await expect(page.locator('[data-test="login-error"]'))
        .toHaveText('Wrong username or password.');
    expect(new URL(page.url()).pathname).toBe('/login');
    // Nothing is signed in: a guarded route still sends the visitor back here. (The sign-in has no
    // bar to read.)
    await page.goto('/account');
    await expect(page.locator('[data-test="login"]')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
});

test('the submit cannot be pressed twice: it is disabled while the call is in flight', async ({ page }) => {
    // The control on the double-submit guard. The mock answers deliberately late for this.
    await page.goto('/login?next=%2Faccount');
    await fill(page, 'username', 'admin');
    await fill(page, 'password', 'pdx');
    const button = page.locator('[data-test="sign-in"] button');
    await button.click();
    await expect(button).toBeDisabled();
    await expect(page.locator('[data-test="account"]')).toBeVisible();
    await expect(button).toHaveCount(0);
});

test('signing in lands on the route the guard refused, not on a default', async ({ page }) => {
    // Deep-linked to a guarded page, refused, signed in — and back where the visitor was going.
    await page.goto('/tickets/1/billing');
    await page.goto('/account');
    await expect(page.locator('[data-test="login"]')).toBeVisible();
    await fill(page, 'username', 'admin');
    await fill(page, 'password', 'pdx');
    await page.locator('[data-test="sign-in"] button').click();

    await expect(page.locator('[data-test="account"]')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/account');
});

test('the admin sees the action, and the server allows it', async ({ page }) => {
    await signIn(page, 'admin');
    await expect(page.locator('[data-test="who"]')).toHaveText('Ada Admin');
    // The role by its label: the key is the server's, not the reader's.
    await expect(page.locator('[data-test="roles"]')).toHaveText('Administrator');

    // The token is not only decoded, it is ACCEPTED: this line is the mock's answer to a request
    // whose bearer `authMiddleware` attached and whose signature the mock verified.
    await expect(page.locator('[data-test="closed-months"]')).toContainText('Months closed so far: 0');

    await page.locator('[data-test="close-month"] button').click();
    await expect(page.locator('[data-test="action-ok"]')).toContainText('Month closed');
    await expect(page.locator('[data-test="closed-months"]'), 'the count is not the server\'s answer')
        .toContainText('Months closed so far: 1');
    await expect(page.locator('[data-test="action-error"]')).toBeHidden();
});

test('the technician does not see the action, and may not take it either', async ({ page }) => {
    await signIn(page, 'tech');
    await expect(page.locator('[data-test="who"]')).toHaveText('Tom Technician');

    // Hidden: `@if (canCloseMonth())`, so the button is ABSENT, not merely invisible.
    await expect(page.locator('[data-test="close-month"]')).toHaveCount(0);
    await expect(page.locator('[data-test="close-month-hidden"]')).toBeVisible();

    // And forbidden: the same call, with nothing hidden, refused by the server. From the Demo panel
    // — nobody using the product presses a button in order to be refused.
    await demo(page, 'close-month-anyway');
    await expect(page.locator('[data-test="action-error"]')).toContainText('needs billing.write');
    await expect(page.locator('[data-test="action-ok"]')).toBeHidden();
});

test('the two roles differ by the permissions, on the same page', async ({ page }) => {
    await signIn(page, 'admin');
    // In words: `billing.read` and `billing.write`, as a reader says them.
    await expect(page.locator('[data-test="perms"]')).toHaveText('Work on tickets, read the billing and close the month');
    await page.locator('[data-test="sign-out"] button').click();
    await expect(page.locator('[data-test="login"]')).toBeVisible();

    await signIn(page, 'tech');
    await expect(page.locator('[data-test="perms"]')).toHaveText('Work on tickets');
});

test('a reload keeps the session, and rebuilds the permissions that did not survive it', async ({ page }) => {
    await signIn(page, 'tech');
    await expect(page.locator('[data-test="who"]')).toBeVisible();

    await page.reload();

    // Still in — the tokens came back from localStorage and the user was decoded again.
    await expect(page.locator('[data-test="who"]')).toHaveText('Tom Technician');
    expect(new URL(page.url()).pathname).toBe('/account');
    // And the permissions are back, which is the half that does NOT come back by itself:
    // `setPermissions` is in-memory state, and only the effect over `auth.user()` rebuilds it.
    // Asserted as the absence of the admin action — a page rendered with empty permissions would
    // not have reached this route at all, and one rendered with stale ones would show the button.
    await expect(page.locator('[data-test="close-month"]')).toHaveCount(0);
    await expect(page.locator('[data-test="close-month-hidden"]')).toBeVisible();
});

test('an expired token lands on the login, not on a half-authenticated screen', async ({ page }) => {
    // Three seconds: long enough to render the account page, short enough for a test. The lapse
    // is the STORE's timer firing on `exp`, not a reload — nothing here reloads or navigates.
    await signIn(page, 'admin', 3);
    await expect(page.locator('[data-test="account"]')).toBeVisible();

    await expect(page.locator('[data-test="login"]')).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/login');
    await expect(page.locator('[data-test="session-user"]')).toHaveCount(0);
});

test('a reload with an already expired token lands on the login too', async ({ page }) => {
    // The other half, and the one `permissions.md` warns about: the stored token decodes to a
    // perfectly good user, and only `isAuthenticated()` knows it is dead. A page that checked the
    // user would render as though nothing had happened.
    // THREE seconds, and one was too few: the sign-in itself costs the mock's deliberate 350ms,
    // and on a loaded four-worker suite the account page has to render inside what is left. It
    // did not, once, in a full gate — the token had already lapsed when the page it was signing
    // into arrived, and the test failed on the line that is only setting the scene. What this
    // measures is the RELOAD below, so the budget before it is not the subject.
    await signIn(page, 'admin', 3);
    await expect(page.locator('[data-test="account"]')).toBeVisible();
    // Past `exp`, deliberately: this is the clock passing, not a wait for something to happen.
    await page.waitForTimeout(3_500);

    await page.goto('/account');
    await expect(page.locator('[data-test="login"]')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
});

test('signing out clears the session and the route is guarded again', async ({ page }) => {
    await signIn(page, 'admin');
    await expect(page.locator('[data-test="session-user"]')).toHaveText('Ada Admin');

    await page.locator('[data-test="sign-out"] button').click();
    await expect(page.locator('[data-test="login"]')).toBeVisible();

    // Not merely navigated away from: the tokens are gone, so the guard refuses the route again.
    await page.goto('/account');
    await expect(page.locator('[data-test="login"]')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
});
