// ICU validation (i18n build tooling — Track D).
import { describe, it, expect } from 'vitest';
import { validateIcu } from '../src/i18n/validate-icu';

describe('validateIcu', () => {
    it('accepts plain text and simple interpolation', () => {
        expect(validateIcu('Welcome')).toBeNull();
        expect(validateIcu('Hello {name}')).toBeNull();
        expect(validateIcu('Item {0} of {1}')).toBeNull();
    });

    it('accepts a well-formed plural block', () => {
        expect(validateIcu('{count, plural, one {# item} other {# items}}')).toBeNull();
        expect(validateIcu('{count, plural, =0 {none} one {# item} other {# items}}')).toBeNull();
    });

    it('rejects select/selectordinal — $t() renders only plural', () => {
        expect(validateIcu('{gender, select, male {he} female {she} other {they}}')).toMatch(/select.*not supported|not supported/i);
        expect(validateIcu('{n, selectordinal, one {#st} other {#th}}')).toMatch(/not supported/i);
    });

    it('accepts nested blocks', () => {
        expect(validateIcu('{n, plural, one {{x} thing} other {{x} things}}')).toBeNull();
    });

    it('flags the classic unclosed plural (missing outer brace)', () => {
        // the plan's example
        const err = validateIcu('{count, plural, one {# item} other {# items}');
        expect(err).toMatch(/unbalanced|unclosed/i);
    });

    it('flags a stray closing brace', () => {
        expect(validateIcu('hello}')).toMatch(/unexpected/i);
    });

    it('flags a plural/select block with no "other" arm', () => {
        const err = validateIcu('{count, plural, one {# item}}');
        expect(err).toMatch(/other/i);
    });

    it('flags an invalid category', () => {
        const err = validateIcu('{count, plural, 1 {x} other {y}}');
        expect(err).toMatch(/invalid category|no \{/i);
    });
});
