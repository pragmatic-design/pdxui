// A select filter's chip shows the word the user picked, not the code it is stored as.
//
// Otherwise the chip reads `Status Equals "closed"` where the popover offered «Closed», and the
// accessible names built from that text carry the code too. An enum is stored as
// `open`/`waiting`/`closed` and must never be SHOWN that way — the rule a grid cell already
// follows through its `format`. A filter is the one place where the user has just chosen a word
// from a list and is then answered with a different one, which reads as a bug in the application
// rather than in the library. Localised, it is plainer still: the popover offers «Chiuso» and the
// chip answers `"closed"`.
//
// The data is there — `FilterFieldInfo` carries `options` — and the signature passes it on.
import { describe, it, expect } from 'vitest';
import { stateToChipText } from '../../src/shared/filter-popover';
import type { FilterConditionState } from '../../src/shared/filter-popover';

const STATUS = [
    { label: 'Open', value: 'open' },
    { label: 'Waiting', value: 'waiting' },
    { label: 'Closed', value: 'closed' },
];

/** One condition, the shape the popover builds. */
function state(op: string, val: string, extra: Partial<FilterConditionState> = {}): FilterConditionState {
    return { op1: op, val1: val, op2: 'eq', val2: '', logic: 'and', ...extra } as FilterConditionState;
}

describe('stateToChipText, a field with options', () => {
    it('shows the option label instead of the stored value', () => {
        const text = stateToChipText('Status', state('eq', 'closed'), 'string', STATUS);
        expect(text, `the chip still shows the code: ${text}`).toContain('Closed');
        expect(text).not.toContain('closed"');
    });

    it('maps every value of a multiple selection', () => {
        // `in`/`notin` store the values `|`-joined (`filter-popover.ts`), so each one is mapped.
        const text = stateToChipText('Status', state('in', 'open|closed'), 'string', STATUS);
        expect(text).toContain('Open');
        expect(text).toContain('Closed');
        expect(text, 'a raw code survived the mapping').not.toMatch(/\bwaiting\b|"open"|"closed"/);
    });

    it('falls back to the raw value when no option matches', () => {
        // A saved view older than the options list, or a value the loader has not fetched yet.
        // Showing the code is worse than the label and far better than showing nothing.
        const text = stateToChipText('Status', state('eq', 'archived'), 'string', STATUS);
        expect(text).toContain('archived');
    });

    it('and a field with no options is unchanged', () => {
        // The control: every other filter in the app goes through this function, and a free-text
        // value must not acquire a mapping it never had.
        const withOptions = stateToChipText('Customer', state('contains', 'Acme'), 'string', []);
        const without = stateToChipText('Customer', state('contains', 'Acme'), 'string');
        expect(withOptions).toBe(without);
        expect(without).toContain('Acme');
    });

    it('and a range is still a range, not two lookups', () => {
        // The other control, and the reason the mapping cannot simply split on `|`: `between`
        // uses the same separator for its two bounds.
        const text = stateToChipText('Opened', state('between', '2026-01-01|2026-03-31'), 'date', STATUS);
        expect(text).toContain('2026-01-01');
        expect(text).toContain('2026-03-31');
        expect(text, 'the range collapsed into a list').toContain('–');
    });
});
