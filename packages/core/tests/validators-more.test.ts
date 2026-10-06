// The built-in validation rules.
//
// Every one of these has a deliberate hole in it: `required` accepts 0 and false, the string rules
// pass on an empty value, the number rules pass on a non-number. Those are not oversights, they are
// the composition contract — `[required(), email()]` is how you say "must be filled in AND must be
// an address" — and each one is a silent behaviour change waiting to happen if nobody pins it.

import { describe, it, expect } from 'vitest';
import {
    required, minLength, maxLength, email, pattern, url, min, max, integer,
    validateSchema, isStandardSchema,
} from '../src/form/validators';

/**
 * The rules return either a plain string or a ValidationMessage — `{ key, params, fallback }`, so
 * the UI can translate it and still have English to show if nothing resolves the key.
 */
const asMessage = (r: unknown) => r as { key: string; fallback: string; params?: Record<string, unknown> };

describe('required', () => {
    const v = required();

    it('rejects nothing at all', () => {
        expect(v(null)).toBeDefined();
        expect(v(undefined)).toBeDefined();
    });

    it('rejects a string of only whitespace', () => {
        expect(v('')).toBeDefined();
        expect(v('   ')).toBeDefined();
        expect(v('\t\n')).toBeDefined();
    });

    it('rejects an empty array — a multi-select with nothing picked', () => {
        expect(v([])).toBeDefined();
        expect(v(['a'])).toBeUndefined();
    });

    it('ACCEPTS zero and false, which are answers', () => {
        // The commonest bug in a required rule: a quantity of 0 and an unticked-then-ticked-back
        // checkbox are values the user supplied, not blanks.
        expect(v(0)).toBeUndefined();
        expect(v(false)).toBeUndefined();
    });

    it('accepts an object or a date', () => {
        expect(v({})).toBeUndefined();
        expect(v(new Date())).toBeUndefined();
    });

    it('uses the message it is given instead of the default', () => {
        expect(required('Serve un valore')(null)).toBe('Serve un valore');
    });

    it('carries a translatable default when no message is given', () => {
        // Not just "some text": an i18n key AND an English fallback, so a product with no
        // translation layer still shows a sentence rather than 'validation.required'.
        const m = asMessage(v(null));
        expect(m.key).toContain('required');
        expect(m.fallback).toBe('This field is required');
    });

    it('passes the bound to the message, so a translation can use it', () => {
        const m = asMessage(minLength(3)('a'));
        expect(m.params, 'a translated "Minimum {min} characters" has nothing to interpolate')
            .toEqual({ min: 3 });
        expect(asMessage(maxLength(9)('0123456789')).params).toEqual({ max: 9 });
        expect(asMessage(min(5)(1)).params).toEqual({ min: 5 });
        expect(asMessage(max(5)(9)).params).toEqual({ max: 5 });
    });
});

describe('minLength / maxLength', () => {
    it('rejects a string that is too short, and accepts one exactly at the bound', () => {
        const v = minLength(3);
        expect(v('ab')).toBeDefined();
        expect(v('abc')).toBeUndefined();
        expect(v('abcd')).toBeUndefined();
    });

    it('rejects a string that is too long, and accepts one exactly at the bound', () => {
        const v = maxLength(3);
        expect(v('abcd')).toBeDefined();
        expect(v('abc')).toBeUndefined();
    });

    it('passes on a value that is not a string — the field coerces first', () => {
        expect(minLength(5)(42 as never)).toBeUndefined();
        expect(maxLength(1)(null as never)).toBeUndefined();
    });

    it('counts code units, so an emoji is two', () => {
        // Not an endorsement — a limit written for characters will be wrong for emoji. Pinned so
        // the choice is visible rather than discovered by a user whose name did not fit.
        expect(minLength(2)('🙂')).toBeUndefined();
    });

    it('takes a custom message', () => {
        expect(minLength(3, 'Troppo corto')('a')).toBe('Troppo corto');
        expect(maxLength(1, 'Troppo lungo')('ab')).toBe('Troppo lungo');
    });
});

describe('email', () => {
    const v = email();

    it('accepts something that is shaped like an address', () => {
        expect(v('a@b.co')).toBeUndefined();
        expect(v('first.last+tag@sub.example.com')).toBeUndefined();
    });

    it('rejects what is not', () => {
        expect(v('nope')).toBeDefined();
        expect(v('a@b')).toBeDefined();
        expect(v('a b@c.com'), 'a space is not allowed').toBeDefined();
        expect(v('@b.com')).toBeDefined();
    });

    it('PASSES on an empty value — compose it with required', () => {
        expect(v('')).toBeUndefined();
    });

    it('passes on a non-string', () => {
        expect(v(undefined as never)).toBeUndefined();
    });

    it('takes a custom message', () => {
        expect(email('Email non valida')('x')).toBe('Email non valida');
    });
});

describe('pattern', () => {
    it('rejects what does not match', () => {
        const v = pattern(/^\d{5}$/);
        expect(v('12345')).toBeUndefined();
        expect(v('1234')).toBeDefined();
    });

    it('passes on empty and on a non-string', () => {
        const v = pattern(/^x$/);
        expect(v('')).toBeUndefined();
        expect(v(7 as never)).toBeUndefined();
    });

    it('takes a custom message, which it usually needs', () => {
        expect(pattern(/^\d+$/, 'Solo cifre')('a')).toBe('Solo cifre');
    });
});

describe('url', () => {
    const v = url();

    it('accepts a URL with a scheme', () => {
        expect(v('https://example.com')).toBeUndefined();
        expect(v('http://localhost:3000/x?y=1')).toBeUndefined();
    });

    it('rejects a bare host, because the parser does', () => {
        expect(v('example.com'), 'no scheme, no URL').toBeDefined();
    });

    it('rejects nonsense', () => {
        expect(v('http://')).toBeDefined();
        expect(v('not a url at all')).toBeDefined();
    });

    it('passes on empty and on a non-string', () => {
        expect(v('')).toBeUndefined();
        expect(v(null as never)).toBeUndefined();
    });

    it('takes a custom message', () => {
        expect(url('Serve un indirizzo')('x')).toBe('Serve un indirizzo');
    });
});

describe('min / max / integer', () => {
    it('min is inclusive', () => {
        const v = min(5);
        expect(v(4)).toBeDefined();
        expect(v(5)).toBeUndefined();
        expect(v(6)).toBeUndefined();
    });

    it('max is inclusive', () => {
        const v = max(5);
        expect(v(6)).toBeDefined();
        expect(v(5)).toBeUndefined();
    });

    it('both work with negatives and zero bounds', () => {
        expect(min(-10)(-11)).toBeDefined();
        expect(min(-10)(-10)).toBeUndefined();
        expect(max(0)(1)).toBeDefined();
        expect(max(0)(0)).toBeUndefined();
    });

    it('pass on a value that is not a number', () => {
        expect(min(5)('3' as never)).toBeUndefined();
        expect(max(5)(undefined as never)).toBeUndefined();
        expect(integer()('1.5' as never)).toBeUndefined();
    });

    it('integer rejects a fraction and accepts a whole number', () => {
        const v = integer();
        expect(v(1.5)).toBeDefined();
        expect(v(2)).toBeUndefined();
        expect(v(-3)).toBeUndefined();
        expect(v(0)).toBeUndefined();
    });

    it('integer rejects NaN and Infinity, which are not whole numbers', () => {
        const v = integer();
        expect(v(NaN)).toBeDefined();
        expect(v(Infinity)).toBeDefined();
    });

    it('all take a custom message', () => {
        expect(min(1, 'Troppo piccolo')(0)).toBe('Troppo piccolo');
        expect(max(1, 'Troppo grande')(2)).toBe('Troppo grande');
        expect(integer('Solo interi')(1.5)).toBe('Solo interi');
    });
});

describe('Standard Schema adapter', () => {
    const schema = (issues?: { message: string; path?: (string | number)[] }[]) => ({
        '~standard': {
            version: 1 as const,
            vendor: 'test',
            validate: () => (issues ? { issues } : { value: {} }),
        },
    });

    it('returns nothing when the schema is happy', () => {
        expect(validateSchema(schema(), {})).toEqual({});
    });

    it('keys each issue by its dotted path', () => {
        const errors = validateSchema(schema([
            { message: 'too short', path: ['name'] },
            { message: 'bad', path: ['address', 'city'] },
        ]), {});
        expect(errors).toEqual({ name: 'too short', 'address.city': 'bad' });
    });

    it('files a pathless issue under _form', () => {
        // A cross-field rule — "end must be after start" — belongs to the form, not to a field.
        const errors = validateSchema(schema([{ message: 'dates overlap' }]), {});
        expect(errors._form).toBe('dates overlap');
    });

    it('keeps the FIRST message for a field, not the last', () => {
        // A field with three failing rules should say one thing, and the first is the one the
        // schema considered most fundamental.
        const errors = validateSchema(schema([
            { message: 'first', path: ['x'] },
            { message: 'second', path: ['x'] },
        ]), {});
        expect(errors.x).toBe('first');
    });

    it('joins a numeric path segment, for arrays', () => {
        const errors = validateSchema(schema([{ message: 'bad row', path: ['rows', 2, 'qty'] }]), {});
        expect(errors['rows.2.qty']).toBe('bad row');
    });

    it('recognises a Standard Schema, and refuses everything else', () => {
        expect(isStandardSchema(schema())).toBe(true);
        expect(isStandardSchema(null)).toBe(false);
        expect(isStandardSchema(undefined)).toBe(false);
        expect(isStandardSchema({})).toBe(false);
        expect(isStandardSchema('~standard')).toBe(false);
        expect(isStandardSchema(42)).toBe(false);
    });
});
