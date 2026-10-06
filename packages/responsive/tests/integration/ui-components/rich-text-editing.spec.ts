// Three editing gestures of pdx-rich-text, with real keys and no pauses between them.
//
// Chromium is where the selection is asynchronous: the model learns of a selection change from a
// queued selectionchange, so a shortcut pressed right after Shift+Ctrl+Left can run on the old
// caret. That shows at automation speed — a macro, a fast typist, every end-to-end test — and not
// at human speed. The other two gestures can fail at any speed: bold at a caret doing nothing, and
// select-all plus delete sending the next letter into a paragraph of its own.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

const CONTENT = 'section:not([hidden]) [data-test="rt"] .pdx-rt-content';

/** The rich-text-basic scenario: one paragraph, «Hello world»; the caret at the end of it. */
async function open(page: Page): Promise<void> {
    await goToScenario(page, 'rich-text-basic', 'neutral', { page: scenarioPage['rich-text-basic'] });
    await settle(page);
    await page.locator(CONTENT).click();
    await page.keyboard.press('End');
}

const html = (page: Page): Promise<string> => page.locator(CONTENT).innerHTML();

test.describe('pdx-rich-text editing gestures', () => {
    test('bold at a caret: Ctrl+B, then typing, writes bold text there', async ({ page }) => {
        await open(page);
        await page.keyboard.press('Home');
        for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight'); // Hello| world
        await page.keyboard.press('Control+b');
        await page.keyboard.type('XY');
        expect(await html(page)).toBe('<p>Hello<strong>XY</strong> world</p>');
    });

    test('the control: Ctrl+B twice at a caret leaves the typing plain', async ({ page }) => {
        await open(page);
        await page.keyboard.press('Home');
        for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Control+b');
        await page.keyboard.press('Control+b');
        await page.keyboard.type('XY');
        expect(await html(page)).toBe('<p>HelloXY world</p>');
    });

    test('Shift+Ctrl+Left then Ctrl+B at once bolds the word just selected', async ({ page }) => {
        await open(page);
        await page.keyboard.press('Shift+Control+ArrowLeft');
        await page.keyboard.press('Control+b');
        expect(await html(page)).toBe('<p>Hello <strong>world</strong></p>');
    });

    test('Ctrl+A, Backspace, then «Abc» gives one paragraph «Abc»', async ({ page }) => {
        await open(page);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await page.keyboard.type('Abc');
        expect(await html(page)).toBe('<p>Abc</p>');
    });
});

// Tab nests a list item, and Shift+Tab lifts that item alone, not the whole list.
test.describe('pdx-rich-text list indentation', () => {
    /** A bullet list «a», «b», the caret at the end of «b». */
    async function twoItems(page: Page): Promise<void> {
        await open(page);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+Shift+8');
        await page.keyboard.type('a');
        await page.keyboard.press('Enter');
        await page.keyboard.type('b');
        expect(await html(page), 'the starting list').toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>');
    }

    test('Tab on the second item nests it, keeps focus, and the typing goes on in it', async ({ page }) => {
        await twoItems(page);
        await page.keyboard.press('Tab');
        await page.keyboard.type('X');
        expect(await html(page)).toBe('<ul><li><p>a</p><ul><li><p>bX</p></li></ul></li></ul>');
        await expect(page.locator(CONTENT)).toBeFocused();
    });

    test('Shift+Tab lifts the nested item back, and only that item', async ({ page }) => {
        await twoItems(page);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.type('Y');
        expect(await html(page)).toBe('<ul><li><p>a</p></li><li><p>bY</p></li></ul>');
        await page.keyboard.press('Shift+Tab');
        expect(await html(page)).toBe('<ul><li><p>a</p></li></ul><p>bY</p>');
    });
});
