/**
 * Switching the language moves BOTH dictionaries.
 *
 * `docs/i18n.md` calls this "the single most confusable thing on the page", and it is:
 *
 *   - the app's own copy is `$t('tickets.title')`, loaded with `loadTranslations`;
 *   - the LIBRARY's own — «Save», «No results», «404 · Page not found» — lives in a separate
 *     registry that `$t` cannot reach, and is written with `setLocaleStrings`.
 *
 * A showcase that translates the first and leaves the second in English has translated half a
 * screen, and it is the half a reader notices. So the assertion is a PAIR, in one test: asserting
 * only the app's copy would pass on exactly the failure this is here to catch.
 */
import { test, expect, type Page } from './fixture';
import { pickLocale } from './locale';

async function open(page: Page, path: string): Promise<void> {
    await page.goto(path);
    await expect(page.locator('pdx-app .app-bar')).toBeVisible();
}

/** Pick a language, as a signed-in person does: the profile menu's Settings. */
async function chooseLanguage(page: Page, label: 'Italiano' | 'English'): Promise<void> {
    await pickLocale(page, label === 'Italiano' ? 'it' : 'en');
}

/** The sign-in's own language control, the one screen a guest sees. */
const LOGIN_LOCALE = '[data-test="login-locale"]';

async function signIn(page: Page): Promise<void> {
    await page.goto('/login?next=%2Faccount');
    await page.locator('[data-test="username"] input').fill('admin');
    await page.locator('[data-test="password"] input').fill('pdx');
    await page.locator('[data-test="sign-in"] button').click();
    await expect(page.locator('[data-test="account"]')).toBeVisible();
}

/**
 * The language control is a PDX control, and each language is named in itself.
 *
 * The framework's own component, not a native `<select>`: each language by its own name with its
 * code, and NO flags — a language is not a country. It lives in Settings once signed in, and on the
 * sign-in. Every route is behind the login, so the sign-in is the only screen a guest sees, and
 * these rows measure the control there.
 */
test.describe('the language control', () => {
    test('on the sign-in it is a PDX menu, not a native select', async ({ page }) => {
        await page.goto('/login');
        const control = page.locator(LOGIN_LOCALE);
        await expect(control).toHaveCount(1);
        expect(await control.evaluate((el) => el.tagName.toLowerCase())).toBe('pdx-dropdown-menu');
        await expect(page.locator('[data-test="login"] select'), 'a native select is on the sign-in').toHaveCount(0);
    });

    test('each language is named in itself, with its code, and marked with its lang', async ({ page }) => {
        await page.goto('/login');
        await page.locator(`${LOGIN_LOCALE} button[aria-haspopup="menu"]`).click();
        const entries = page.locator('.pdx-dropdown-menu-panel [role="menuitemradio"]');
        await expect(entries).toHaveCount(2);
        // The label, not the whole entry: the checked one also carries its ✓.
        expect(await entries.evaluateAll((els) => els.map((e) =>
            [e.querySelector('.pdx-menu-item-label')!.textContent!.trim(), e.getAttribute('lang')])))
            .toEqual([['English · EN', 'en'], ['Italiano · IT', 'it']]);
        // The one in use is the checked one.
        await expect(entries.nth(0)).toHaveAttribute('aria-checked', 'true');
        await expect(entries.nth(1)).toHaveAttribute('aria-checked', 'false');
    });

    test('the language in use is marked with ONE tick, and the others with none', async ({ page }) => {
        // A ✓ written into the check element and another drawn by menu.css after it read «✓✓».
        // What a person sees is the element's text plus its `::after`, so that is what is
        // counted — in Chromium, where the pseudo-element is real.
        await page.goto('/login');
        await page.locator(`${LOGIN_LOCALE} button[aria-haspopup="menu"]`).click();
        const entries = page.locator('.pdx-dropdown-menu-panel [role="menuitemradio"]');
        await expect(entries).toHaveCount(2);
        const ticks = await entries.evaluateAll((els) => els.map((e) => {
            const check = e.querySelector('.pdx-menu-check')!;
            const after = getComputedStyle(check, '::after').content.replace(/^["']|["']$/g, '');
            return ((check.textContent ?? '') + (after === 'none' ? '' : after)).split('✓').length - 1;
        }));
        expect(ticks, 'ticks drawn per entry, the checked one first').toEqual([1, 0]);
    });

    test('the trigger names the language in use, and follows it', async ({ page }) => {
        await page.goto('/login');
        const trigger = page.locator(`${LOGIN_LOCALE} button[aria-haspopup="menu"]`);
        await expect(trigger).toContainText('English · EN');
        await pickLocale(page, 'it', LOGIN_LOCALE);
        await expect(trigger).toContainText('Italiano · IT');
    });

    test('on the sign-in, where there is no profile menu yet', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('[data-test="login"]')).toBeVisible();
        await pickLocale(page, 'it', '[data-test="login-locale"]');
        await expect(page.locator('html')).toHaveAttribute('lang', 'it');
        await expect(page.locator('[data-test="sign-in"]')).toContainText('Accedi');
    });

    test('signed in, it leaves the bar for Settings', async ({ page }) => {
        await signIn(page);
        await expect(page.locator('[data-test="locale"]'), 'the guest control is still in the bar').toHaveCount(0);
        await expect(page.locator('.app-bar [data-test="scheme"]')).toHaveCount(0);

        await page.locator('[data-test="profile"]').click();
        await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Settings' }).focus();
        await page.keyboard.press('ArrowRight');
        const settings = page.locator('[data-submenu-key="settings"]');
        const italiano = settings.locator('[role="menuitemradio"][lang="it"]');
        await expect(italiano).toHaveText('Italiano · IT');
        await italiano.click();

        await expect(page.locator('html')).toHaveAttribute('lang', 'it');
        await expect(page.locator('[data-test="profile"]'), 'the focus did not come back to the menu button')
            .toBeFocused();
    });

    test('the language picked on the sign-in is the one the app opens in', async ({ page }) => {
        // A guest chooses on the sign-in, and the choice has to survive the sign-in rather than reset to the default on the first screen behind it.
        await page.goto('/login?next=%2Ftickets');
        await pickLocale(page, 'it', LOGIN_LOCALE);
        await page.locator('[data-test="username"] input').fill('admin');
        await page.locator('[data-test="password"] input').fill('pdx');
        await page.locator('[data-test="sign-in"] button').click();
        await expect(page).toHaveURL(/\/tickets$/);
        await expect(page.locator('html')).toHaveAttribute('lang', 'it');
        await expect(page.locator('[data-test="to-tickets"] .rail-label')).toHaveText('Ticket');
    });
});

test('the app starts in English', async ({ page }) => {
    // The control for everything below: without it, a test asserting Italian would pass on an app
    // that was never in English to begin with.
    await open(page, '/tickets');
    await expect(page.locator('[data-test="tickets"] h1')).toHaveText('Tickets');
});

test('the SHELL starts in English too, on a fresh load', async ({ page }) => {
    // The page's own copy is not where this fails, which is why the test above can pass while the
    // header reads `app.nav.dashboard`. The shell renders at module evaluation —
    // `import './src/app.pdx'` is hoisted above `setupI18n()`, whatever the order in the file —
    // so it renders before a single translation is loaded, and only a reactive dictionary tells it
    // afterwards.
    //
    // It has to be a FRESH load in the default locale: switching the language hides the defect,
    // because a locale that really changes re-runs everything. `en → it → en` gives "Dashboard"
    // while the first paint gives the key.
    await open(page, '/');
    // The navigation is in the rail; what is measured is that the first paint in the default
    // locale shows the translation and not the key.
    const nav = page.locator('[data-test="nav"] .rail-label');
    await expect(nav.first()).toHaveText('Dashboard');
    const labels = await nav.allInnerTexts();
    expect(labels.some((t) => t.includes('app.nav')), `the header shows raw keys: ${labels.join(', ')}`)
        .toBe(false);
    // The brand is in the rail's head, and it is an aria-label rather than text:
    // a two-letter mark does not read as an application's name to a screen reader.
    await expect(page.locator('[data-test="brand"]')).not.toHaveAttribute('aria-label', /^app\./);
});

test('choosing Italian moves the app copy AND the library strings', async ({ page }) => {
    await open(page, '/tickets');
    await chooseLanguage(page, 'Italiano');

    // The app's own, through $t.
    await expect(page.locator('[data-test="tickets"] h1'),
        'the app copy did not follow the locale').toHaveText('Ticket');

    // The LIBRARY's own, through setLocaleStrings — the half that is usually left behind. Create
    // opens a MODAL, and the asset picker in it draws the library's «add» button.
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Aggiungi i selezionati' }),
        'the library is still speaking English — setLocaleStrings was not called').toBeVisible();
});

test('a label that lives in DATA follows too', async ({ page }) => {
    // Column headers, filter fields and the schema are arrays, not template text. A plain `const`
    // builds them once and they keep the language they were built in — which is the quiet half of
    // a half-translated screen, and why they are `$derived`.
    await open(page, '/tickets');
    await expect(page.locator('[data-test="grid"]')).toContainText('Customer');

    await chooseLanguage(page, 'Italiano');
    await expect(page.locator('[data-test="grid"]'),
        'the grid headers kept the language they were built in').toContainText('Cliente');
});

test('and the choice survives a reload', async ({ page }) => {
    await open(page, '/tickets');
    await chooseLanguage(page, 'Italiano');
    await expect(page.locator('[data-test="tickets"] h1')).toHaveText('Ticket');

    await page.reload();
    await expect(page.locator('[data-test="tickets"] h1'),
        'the visitor had to choose their language again').toHaveText('Ticket');
});

test('the page says which language it is in', async ({ page }) => {
    // `index.html` hard-codes `lang="en"`, and unless it moves an Italian screen announces itself
    // as English to a screen reader. It is also the one honest readiness signal: the second locale
    // is a CHUNK, and `lang` moves when both registries hold it —
    // which is what `i18n-coverage.spec.ts` waits on instead of racing the fetch.
    await open(page, '/tickets');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await chooseLanguage(page, 'Italiano');
    await expect(page.locator('html'), 'the document still claims to be in English')
        .toHaveAttribute('lang', 'it');

    await page.reload();
    await expect(page.locator('html'), 'a reload lost the language the document is in')
        .toHaveAttribute('lang', 'it');
});

/**
 * The grid's CHROME follows the locale too, not only its header and its rows.
 *
 * The header and the rows follow a dictionary that lands late: the grid's one effect reads the
 * registry's version and rebuilds them. The toolbar is built once and only its chips are redrawn
 * afterwards, so «Reload», «Export to CSV» and the toolbar's own name must follow on their own, or
 * they keep the language of the first render.
 *
 * ⚠️ This row passes without the fix and is a guard, not the measurement: switching the language
 * on this screen rebuilds the grid for other reasons, which hides the defect. What measures it is
 * `data-grid-chrome-locale-late.test.ts` in @pdxui/ui, where a dictionary lands on a grid that
 * nothing else touches — the shape a locale loaded as a chunk actually has.
 */
test('the grid toolbar takes the language, not the one it was built in', async ({ page }) => {
    await open(page, '/tickets');
    const toolbar = page.locator('.pdx-dg-toolbar').first();
    // The control: English first, so the assertion below cannot pass on a page that never was.
    await expect(toolbar).toHaveAttribute('aria-label', 'Table tools');

    await chooseLanguage(page, 'Italiano');

    // A regular expression, not the whole string: the app's Italian for this one carries a word
    // `docs-language.test.ts` counts as Italian prose in the source, and that guard is right — the
    // repository is English. What identifies the name is its first word.
    await expect(toolbar, 'the toolbar kept the name it was built with')
        .toHaveAttribute('aria-label', /^Strumenti/);
    await expect(toolbar, 'it is still the English one').not.toHaveAttribute('aria-label', 'Table tools');
    // The buttons whose whole accessible name is that string: they have an icon and no text.
    await expect(toolbar.locator('[aria-label="Ricarica"]')).toHaveCount(1);
    // «Esporta»: the button opens a menu of formats.
    await expect(toolbar.locator('[aria-label="Esporta"]')).toHaveCount(1);
    await expect(toolbar.locator('[aria-label="Colonne"]')).toHaveCount(1);
});

/**
 * The trail and the tab title follow the language.
 *
 * An English literal in `@page { label }` or in `@title` would make an Italian screen say
 * «Customers › Customer 1» and its tab say «Customers». A record's crumb names the record, as the
 * ticket's does: the customer's is its name.
 */
test.describe('the breadcrumb and the document title follow the language', () => {
    const crumbs = (page: Page) => page.locator('[data-test="crumbs"] .pdx-breadcrumb-item');

    // The WHOLE trail, ancestors included: `/customers` above `/customers/1` is an ancestor a deep
    // link never loads, and its crumb is a dictionary key in the route table.
    const ITALIAN = [
        { path: '/tickets', ready: 'tickets', trail: ['Ticket'], title: 'Ticket' },
        { path: '/customers/1', ready: 'customer', trail: ['Clienti', 'Northwind Traders'], title: 'Northwind Traders' },
        { path: '/customers/import', ready: 'import', trail: ['Clienti', 'Importa clienti'], title: 'Importa clienti' },
        { path: '/employees/1/personal', ready: 'personal', trail: ['Collaboratori', 'Ada Rossi', 'Dettagli'], title: 'Dettagli' },
    ];

    for (const screen of ITALIAN) {
        test(`in Italian, ${screen.path} is Italian in its trail and its title`, async ({ page }) => {
            await open(page, '/tickets');
            await chooseLanguage(page, 'Italiano');
            await expect(page.locator('html')).toHaveAttribute('lang', 'it');
            await page.goto(screen.path);
            await expect(page.locator(`[data-test="${screen.ready}"]`)).toBeVisible();
            await expect(crumbs(page)).toHaveText(screen.trail);
            await expect(page).toHaveTitle(screen.title);
        });
    }

    test('control — in English, the same trail is English', async ({ page }) => {
        await open(page, '/customers/1');
        await expect(page.locator('[data-test="customer"]')).toBeVisible();
        await expect(crumbs(page)).toHaveText(['Customers', 'Northwind Traders']);
        await expect(page).toHaveTitle('Northwind Traders');
    });

    // The trail is drawn in an effect, so a switch on the screen re-reads it.
    test('switching the language on a screen re-reads its trail and its title', async ({ page }) => {
        await open(page, '/customers/import');
        await expect(crumbs(page)).toHaveText(['Customers', 'Import customers']);
        await expect(page).toHaveTitle('Import customers');
        await chooseLanguage(page, 'Italiano');
        await expect(crumbs(page), 'the trail kept the language it was drawn in').toHaveText(['Clienti', 'Importa clienti']);
        await expect(page, 'the title kept the language it was set in').toHaveTitle('Importa clienti');
    });
});

