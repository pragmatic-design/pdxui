// A screen's description is written for the person using the service desk.
//
// A line that explains the implementation — «the grid is over a data source, not an array», «a
// four-step wizard: two forms, one Save…» — is true, and addressed to whoever reads the source, so
// it belongs in a comment beside the page's template. On screen, one line a user would read.
import { test, expect } from './fixture';
import { pickLocale } from './locale';

/**
 * Each screen with a description, and where that description is: the paragraph after its heading.
 * On a list the heading is inside the list header, so the paragraph follows the header.
 */
const SCREENS = [
    { path: '/', description: 'main h1 + p' },
    { path: '/tickets', description: 'main pdx-list-header + p' },
    { path: '/board', description: 'main h1 + p' },
    { path: '/customers', description: 'main pdx-list-header + p' },
    { path: '/customers/import', description: 'main h1 + p' },
    { path: '/employees', description: 'main pdx-list-header + p' },
    { path: '/tickets/1', description: 'main h1 + p' },
    { path: '/tickets/1', description: '[data-test="attachments"] h2 + p' },
    { path: '/tickets/1/interventions/2', description: '[data-test="intervention"] h2 + p' },
    { path: '/intake', description: 'main h1 + p' },
    { path: '/login', description: 'h1 + p' },
];

/**
 * The implementation's words, in both languages. A user of a service desk says none of them. The
 * API names as they were written (`uploadFile`), not «upload» or «download»: those are a user's.
 */
const IMPLEMENTATION = /data ?source|\bbuild\b|reference|\btoken\b|signal|segnal|\bguard|guardia|entit(y|ies|à)|\bforms?\b|wizard|round-trip|\bparams?\b|parametri|mounted|montata|uploadFile|downloadFile|TransferHandle|abort\(|\bserver\b|\barray\b/i;

for (const locale of ['en', 'it'] as const) {
    for (const screen of SCREENS) {
        test(`${locale} ${screen.path} ${screen.description}: written for the user`, async ({ page }) => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.goto(screen.path);
            if (locale === 'it') {
                // The sign-in has its own control; everywhere else it is the profile menu's.
                await pickLocale(page, 'it', screen.path === '/login' ? '[data-test="login-locale"]' : undefined);
                await expect(page.locator('html')).toHaveAttribute('lang', 'it');
            }
            const line = page.locator(screen.description).first();
            // Control: the description is still there — «no implementation words» is also what an
            // empty paragraph says.
            await expect(line, 'the screen lost its description').toBeVisible();
            const text = (await line.innerText()).trim();
            expect(text.length, 'the description is empty').toBeGreaterThan(10);
            expect(text, `«${text}» talks about the implementation`).not.toMatch(IMPLEMENTATION);
        });
    }
}
