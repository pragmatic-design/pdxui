/**
 * A model declared `{ form }` (#135), in a native <form>, in Chromium: happy-dom has no
 * ElementInternals, so only a browser shows what the form receives.
 *
 * The fixture, `tests/fixtures/form-model/`, is a page of its own served by the dev server: a compiled
 * `.pdx` (`@model value: string = 'init' { form }`) and four descriptor components, one per case of
 * the serialization — a boolean, an array, a number, an object. Every assertion on the form's data is
 * `toEqual` on the whole list: a duplicate or a stale entry satisfies a `contains`.
 */
import { test, expect, type Page } from './fixture';

const FIXTURE = '/tests/fixtures/form-model/index.html';

/** The form's data, every entry, files by name. */
function formData(page: Page): Promise<[string, string][]> {
    return page.evaluate(() => [...new FormData(document.getElementById('f') as HTMLFormElement).entries()]
        .map(([k, v]) => [k, typeof v === 'string' ? v : (v as File).name] as [string, string]));
}

/** Set a property on the element `selector` names, as a parent's binding does. */
function setProp(page: Page, selector: string, name: string, value: unknown): Promise<void> {
    return page.evaluate(([s, n, v]) => { (document.querySelector(s as string) as unknown as Record<string, unknown>)[n as string] = v; }, [selector, name, value]);
}

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    await page.waitForFunction(() => (window as unknown as { __fm?: { ready: boolean } }).__fm?.ready === true);
});

test('as mounted: the .pdx default, no entry for an unchecked box, an empty array or an object, the number as its string', async ({ page }) => {
    expect(await formData(page)).toEqual([['t', 'init'], ['n', '0']]);
});

test('each model\'s value, as the form submits it', async ({ page }) => {
    await page.locator('app-fm-text input.inner').fill('typed');
    await setProp(page, 'fm-check[name="c"]', 'checked', true);
    await setProp(page, 'fm-check[name="c2"]', 'checked', true);
    await setProp(page, 'fm-tags', 'tags', ['a', 'b']);
    await setProp(page, 'fm-number', 'count', 7);
    expect(await formData(page)).toEqual([
        ['t', 'typed'],
        ['c', 'yes'],      // a boolean submits the component's value…
        ['c2', 'on'],      // …or 'on', as a native checkbox
        ['tags', 'a'],     // an array, one entry per item
        ['tags', 'b'],
        ['n', '7'],
    ]);
});

test('form.reset() puts every model back to the value it mounted with, and a parent\'s binding hears it', async ({ page }) => {
    await page.locator('app-fm-text input.inner').fill('typed');
    await setProp(page, 'fm-check[name="c"]', 'checked', true);
    await setProp(page, 'fm-tags', 'tags', ['a']);
    await setProp(page, 'fm-number', 'count', 7);
    const heard = page.evaluate(() => new Promise<string>((resolve) => {
        document.querySelector('app-fm-text')!.addEventListener('value-change', (e) => resolve((e as CustomEvent<{ value: string }>).detail.value), { once: true });
    }));
    await page.evaluate(() => (document.getElementById('f') as HTMLFormElement).reset());
    expect(await heard, 'the model\'s change event, which `::value` listens to').toBe('init');
    expect(await formData(page)).toEqual([['t', 'init'], ['n', '0']]);
    await expect(page.locator('app-fm-text input.inner')).toHaveValue('init');
});

test('validity: a required model with nothing in it, and an error prop, make the form invalid', async ({ page }) => {
    const valid = () => page.evaluate(() => (document.getElementById('f') as HTMLFormElement).checkValidity());
    expect(await valid(), 'control: valid as mounted').toBe(true);

    await setProp(page, 'app-fm-text', 'required', true);
    await page.locator('app-fm-text input.inner').fill('');
    expect(await valid(), 'a required empty text').toBe(false);
    expect(await page.evaluate(() => (document.querySelector('app-fm-text') as unknown as { validity: ValidityState }).validity.valueMissing)).toBe(true);
    await page.locator('app-fm-text input.inner').fill('x');
    expect(await valid(), 'filled in').toBe(true);

    await setProp(page, 'fm-check[name="c"]', 'required', true);
    expect(await valid(), 'a required unchecked box, as a native one').toBe(false);
    await setProp(page, 'fm-check[name="c"]', 'checked', true);
    expect(await valid()).toBe(true);

    await setProp(page, 'fm-number', 'error', 'Too many');
    expect(await valid(), 'an error prop').toBe(false);
    expect(await page.evaluate(() => (document.querySelector('fm-number') as unknown as { validationMessage: string }).validationMessage)).toBe('Too many');
    await setProp(page, 'fm-number', 'error', '');
    expect(await valid()).toBe(true);
});

test('a disabled fieldset disables the components that declare `disabled`, and the form leaves them out', async ({ page }) => {
    await page.evaluate(() => { (document.getElementById('fs') as HTMLFieldSetElement).disabled = true; });
    await expect.poll(() => page.evaluate(() => [
        (document.querySelector('app-fm-text') as unknown as { disabled: boolean }).disabled,
        (document.querySelector('fm-number') as unknown as { disabled: boolean }).disabled,
    ])).toEqual([true, true]);
    await expect(page.locator('app-fm-text input.inner')).toBeDisabled();
    expect(await formData(page)).toEqual([]);

    await page.evaluate(() => { (document.getElementById('fs') as HTMLFieldSetElement).disabled = false; });
    await expect.poll(() => page.evaluate(() => (document.querySelector('fm-number') as unknown as { disabled: boolean }).disabled)).toBe(false);
    expect(await formData(page)).toEqual([['t', 'init'], ['n', '0']]);
});
