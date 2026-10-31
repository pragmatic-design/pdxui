// A2 (#786): a field in error says so and points at its message — in every frame, not eventually.
// CI once read the showcase's /intake email field aria-invalid with an empty aria-describedby: the
// `::value` binding to a form field marks the pdx-input invalid in the flush that makes the field
// invalid, and the pdx-form-field around it wrote aria-describedby a frame later. This spec builds that
// field — a pdx-input bound with `::value` to a form field, in a pdx-form-field bound to the same field —
// makes it invalid and touched, and reads the text box before any frame, then at every frame.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

type Seen = { at: string; invalid: boolean; described: string };

/**
 * Type an invalid address and leave the field, then read the text box: once in the same task (after
 * the microtasks the reactive flush runs in), then at every frame for `frames` frames.
 */
const watchError = (page: Page, frames: number) => page.evaluate(async (n) => {
    const g = (window as unknown as { __gotcha: { mountField(): Promise<void>; form: Record<string, { onChange(v: unknown): void; onBlur(): void }> } }).__gotcha;
    await g.mountField();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const field = document.querySelector('#f pdx-form-field')!;
    const read = (at: string): Seen => {
        const box = field.querySelector('input')!;
        const ids = (box.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
        const described = ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ');
        return { at, invalid: box.getAttribute('aria-invalid') === 'true', described };
    };
    const seen: Seen[] = [read('before')];
    g.form.email.onChange('not-an-address');
    g.form.email.onBlur();
    await Promise.resolve();
    await Promise.resolve();
    seen.push(read('same task'));
    for (let i = 0; i < n; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        seen.push(read(`frame ${i}`));
    }
    return seen;
}, frames);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=field-error-described'); });

test('a form-bound field in error is never aria-invalid where its description does not reach an error', async ({ page }) => {
    const seen = await watchError(page, 5);
    expect(seen[0], 'control — before the error: neither invalid nor described').toEqual({ at: 'before', invalid: false, described: '' });
    const gaps = seen.filter((s) => s.invalid && s.described === '');
    expect(gaps, `reads aria-invalid with no description: ${JSON.stringify(seen)}`).toEqual([]);
    const last = seen.at(-1)!;
    expect(last.invalid, 'it ends in error').toBe(true);
    expect(last.described, 'and described by the message the field shows').toBe(
        (await page.locator('#f pdx-form-field .pdx-field-error, #f pdx-form-field [id$="-error"]').first().textContent())?.trim(),
    );
});
