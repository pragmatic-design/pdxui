// A filter field written with the neighbouring component's key is named, not swallowed.
//
// `<pdx-auto-form>` calls a field `name`; `<pdx-filter-builder>` and `<pdx-data-grid>` call it
// `field`. A page can declare both schemas a few lines apart, and `{ name: 'status', … }` resolves
// to `field: undefined`: every filter naming that field is dropped, and `/tickets?status=closed`
// comes back with all the rows.
//
// Silent, that is hard to find, because everything observable says the filter HAS arrived —
// `location.search`, the router's `currentQuery()`, and the element's own `value` property all hold
// it. Only the seeding drops it, on a `continue` that is correct for the case it exists for: a saved
// view naming a field the builder no longer declares. The two are indistinguishable from inside,
// so the one that is an author's typo says so out loud.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/filter-builder/pdx-filter-builder';

/** What the author meant to write. */
const GOOD = [
    { field: 'status', label: 'Status', type: 'string' },
    { field: 'customer', label: 'Customer', type: 'string' },
];

/** What they wrote: the form's key on a filter field. */
const WITH_NAME = [
    { field: 'status', label: 'Status', type: 'string' },
    { name: 'customer', label: 'Customer', type: 'string' },
];

async function mountFB(fields: unknown[], value?: unknown[]) {
    const el = await mount('pdx-filter-builder', {}) as HTMLElement & { fields: unknown; value: unknown };
    el.fields = fields;
    if (value) el.value = value;
    await tick(200);
    return el;
}

const chips = (el: HTMLElement): string[] =>
    [...el.querySelectorAll('.pdx-fb-chip-label')].map(c => c.textContent ?? '');

let warn: Mock<typeof console.warn>;
beforeEach(() => { cleanup(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });

/** Everything console.warn was told, as one string. */
const warnings = () => warn.mock.calls.map(c => c.join(' ')).join('\n');

describe('pdx-filter-builder, a field declared with the wrong key', () => {
    it('says which field and which key it expected', async () => {
        await mountFB(WITH_NAME);
        const said = warnings();
        expect(said, 'the mismatch was swallowed').not.toBe('');
        expect(said, 'the warning does not name the field').toContain('customer');
        expect(said, 'the warning does not name the key it wanted').toContain('field');
    });

    it('says it once, not once per re-render', async () => {
        // `resolveFields()` runs inside a `ctx.track`, so a warning written straight into it is
        // written again on every notification — and a warning that repeats is a warning that
        // gets filtered out of the console.
        const el = await mountFB(WITH_NAME);
        (el as unknown as { value: unknown }).value = [{ field: 'status', operator: 'eq', value: 'open' }];
        await tick(200);
        expect(warn.mock.calls.length, `warned ${warn.mock.calls.length} times`).toBe(1);
    });

    it('keeps the fields that ARE declared properly', async () => {
        // The misdeclared field is dropped, as it must be — there is no key to filter on. What
        // must not happen is the whole schema going with it.
        const el = await mountFB(WITH_NAME, [{ field: 'status', operator: 'eq', value: 'open' }]);
        expect(chips(el).join(' '), 'a good field was dropped along with the bad one').toContain('Status');
    });

    it('and a well-formed schema says nothing at all', async () => {
        // The control. Without it, a rule that warned on every mount would pass the first test.
        await mountFB(GOOD, [{ field: 'status', operator: 'eq', value: 'open' }]);
        expect(warnings(), 'a correct schema was reported as wrong').toBe('');
    });

    it('and a saved view naming an undeclared field still drops quietly', async () => {
        // The other control, and the reason this is not simply "warn whenever a filter is
        // dropped": a saved view outliving a field it names is expected, and the builder drops it
        // on purpose. Only the author's typo warns.
        const el = await mountFB(GOOD, [{ field: 'archived', operator: 'eq', value: true }]);
        expect(chips(el), 'the stale filter was shown as a chip no editor can open').toEqual([]);
        expect(warnings(), 'a stale saved view is now noisy').toBe('');
    });
});
