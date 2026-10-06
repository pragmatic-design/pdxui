// An empty FieldArray does not erase rows that exist.
//
// A repeating section has two representations and only one of them is written to at a time.
// `<pdx-field-list>` keeps its rows as dotted FIELDS — `lines.0.activity` — and mirrors them onto
// the array field itself; `form.array('lines')` keeps its own list, seeded from `initialValues`
// and grown by `append`. `docs/forms.md` says the two do not compose, and picking one is the
// author's job.
//
// The risk when both are present: if `getValues()` unflattens the fields and then OVERWRITES the
// result with the FieldArray's, which nothing has appended to, a row the user has filled in
// reaches the screen, passes its own `required`, advances the wizard — and arrives at the server
// as `lines: []`. Merely READING `form.array('lines')`, to show a count, is enough to create the
// empty one.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createForm } from '../src/form/form';

/** A form whose rows live as dotted fields, the way `<pdx-field-list>` keeps them. */
function withRows() {
    const form = createForm<{ title: string; lines: { activity: string }[] }>({
        initialValues: { title: '', lines: [] },
    });
    // What a field-list does: register the row's fields, and mirror the array onto the field.
    const internals = (form as unknown as Record<symbol, {
        addField(path: string, value: unknown): void;
    }>)[Object.getOwnPropertySymbols(form).find(s => String(s).includes('form-internals'))!];
    internals.addField('lines.0.activity', 'Survey');
    form.fields.lines.onChange([{ activity: 'Survey' }]);
    return form;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('getValues with both representations present', () => {
    it('keeps the rows when the FieldArray was only read', () => {
        const form = withRows();
        form.array('lines');            // a count on screen is enough to create it
        expect(form.getValues().lines, 'an empty FieldArray erased the rows')
            .toEqual([{ activity: 'Survey' }]);
    });

    it('and says that two things are managing the same name', () => {
        // The documented rule — "the two do not compose" — enforced instead of trusted. The data
        // loss above was silent, which is what made it cost a day.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const form = withRows();
        form.array('lines');
        const said = warn.mock.calls.map(c => c.join(' ')).join('\n');
        expect(said, 'nothing said the two representations had collided').toContain('lines');
    });

    it('and a FieldArray that WAS written to still wins', () => {
        // The control: this must not become "the fields always win", which would break every
        // form that uses `array().append()` as the docs show.
        const form = createForm<{ lines: { activity: string }[] }>({ initialValues: { lines: [] } });
        form.array('lines').append({ activity: 'Audit' });
        expect(form.getValues().lines).toEqual([{ activity: 'Audit' }]);
    });

    it('and an untouched form still reports an empty list', () => {
        // The other control: no rows anywhere is still no rows, not undefined.
        const form = createForm<{ lines: { activity: string }[] }>({ initialValues: { lines: [] } });
        form.array('lines');
        expect(form.getValues().lines).toEqual([]);
    });
});

describe('a leaf that also has dotted children', () => {
    // A third representation, and the stalest of them. `flattenValues` leaves an EMPTY array as a
    // leaf, so `initialValues: { lines: [] }` creates a `lines` FIELD; rows then arrive as
    // `lines.0.*` and something keeps writing a copy of them into that leaf. Nothing updates it
    // on removal.
    //
    // After removing the first of two rows the dotted keys are right (`lines.0.*` = the survivor)
    // and a stale leaf still holds both; unflattening the leaf and then overwriting index 0 would
    // carry the survivor TWICE and silently refill the removed row's slot.
    function withTwoRowsThenRemoveFirst() {
        const form = createForm<{ lines: { activity: string }[] }>({ initialValues: { lines: [] } });
        const internals = (form as unknown as Record<symbol, {
            addField(p: string, v: unknown): void;
            removeFields(p: string): void;
            renameFields(a: string, b: string): void;
        }>)[Object.getOwnPropertySymbols(form).find(s => String(s).includes('form-internals'))!];
        internals.addField('lines.0.activity', 'Survey');
        internals.addField('lines.1.activity', 'Report');
        // The stale mirror, exactly as the page ends up holding it.
        form.fields.lines.onChange([{ activity: 'Survey' }, { activity: 'Report' }]);
        internals.removeFields('lines.0');
        internals.renameFields('lines.1', 'lines.0');
        return form;
    }

    it('is ignored: the dotted children are the rows', () => {
        expect(withTwoRowsThenRemoveFirst().getValues().lines, 'the removed row came back')
            .toEqual([{ activity: 'Report' }]);
    });

    it('and a leaf with NO children is still the value', () => {
        // The control: an array field nobody has expanded into rows is read from the leaf, or an
        // empty list would come back undefined.
        const form = createForm<{ lines: unknown[] }>({ initialValues: { lines: [] } });
        expect(form.getValues().lines).toEqual([]);
        form.fields.lines.onChange([{ activity: 'Typed straight in' }]);
        expect(form.getValues().lines).toEqual([{ activity: 'Typed straight in' }]);
    });
});
