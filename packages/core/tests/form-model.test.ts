// A model declared `{ form }` (#135): the serialization of its value, and the descriptor's form of it.
// What a native <form> does with it — FormData, reset, validity, a disabled fieldset — needs
// ElementInternals, which happy-dom does not have: packages/showcase/tests/form-model.spec.ts, in Chromium.

import { describe, it, expect } from 'vitest';
import { toFormValue, isUnsupportedFormValue } from '../src/form/form-model';
import { model } from '../src/component/component-descriptor';

const entries = (v: unknown): [string, string][] =>
    [...(v as FormData).entries()].map(([k, x]) => [k, typeof x === 'string' ? x : (x as File).name]);

describe('toFormValue — the model\'s value as the form submits it', () => {
    it('a string as is, a number as its string', () => {
        expect(toFormValue('typed', 'n', 'on')).toBe('typed');
        expect(toFormValue('', 'n', 'on')).toBe('');
        expect(toFormValue(42, 'n', 'on')).toBe('42');
        expect(toFormValue(0, 'n', 'on')).toBe('0');
    });

    it('a boolean as a native checkbox: the checked value when true, no entry when false', () => {
        expect(toFormValue(true, 'agree', 'on')).toBe('on');
        expect(toFormValue(true, 'agree', 'yes')).toBe('yes');
        expect(toFormValue(false, 'agree', 'yes')).toBeNull();
    });

    it('null and undefined: no entry', () => {
        expect(toFormValue(null, 'n', 'on')).toBeNull();
        expect(toFormValue(undefined, 'n', 'on')).toBeNull();
    });

    it('an array: one entry per item under the name, as a native multi-select', () => {
        expect(entries(toFormValue(['a', 'b', 3], 'tags', 'on'))).toEqual([['tags', 'a'], ['tags', 'b'], ['tags', '3']]);
        expect(entries(toFormValue([], 'tags', 'on'))).toEqual([]);
    });

    it('an array with no name submits nothing, as a nameless control does', () => {
        expect(toFormValue(['a'], null, 'on')).toBeNull();
        expect(toFormValue(['a'], '', 'on')).toBeNull();
    });

    it('a File as the file, and files under the name', () => {
        const f = new File(['x'], 'cv.pdf');
        expect(toFormValue(f, 'cv', 'on')).toBe(f);
        expect(entries(toFormValue([f, new File(['y'], 'b.txt')], 'docs', 'on'))).toEqual([['docs', 'cv.pdf'], ['docs', 'b.txt']]);
    });

    it('a value with no rule — a plain object — is unsupported, not stringified', () => {
        expect(isUnsupportedFormValue(toFormValue({ a: 1 }, 'n', 'on'))).toBe(true);
        expect(isUnsupportedFormValue(toFormValue('x', 'n', 'on'))).toBe(false);
    });
});

describe('model(d, { form: true })', () => {
    it('marks the model form; without it the model is not marked', () => {
        expect(model<string>('', { form: true })).toEqual({ type: String, default: '', model: true, form: true });
        expect(model<string>('')).toEqual({ type: String, default: '', model: true });
        expect(model<string>('', { form: false })).toEqual({ type: String, default: '', model: true });
    });
});
