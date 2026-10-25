// `<pdx-pin-input>` is removed: a masked PIN is `<pdx-otp-input mask>` (#286, decision 48).
//
// `pdx migrate` rewrites the tag, keeping every attribute as written and adding `length="4"` where the
// source had none (otp-input's default is 6). In a .pdx the tag is PDX_REMOVED_FORM. A leftover
// override of the `pin-input` component strings, and a `<pdx-otp-input mask>` whose defaults change
// under it, are flagged.

import { describe, it, expect } from 'vitest';
import { pinInputRemoved, pinInputStrings, otpInputMaskDefaults } from '../src/language/pin-input';
import { languageChanges } from '../src/language/changes';
import { compile } from '../src/plugin';

const fix = pinInputRemoved.fix as (text: string) => string;

describe('pin-input-removed', () => {
    it('rewrites the tag to a masked otp-input with 4 cells, attributes kept as written', () => {
        const source = '<template>\n  <pdx-pin-input></pdx-pin-input>\n  <pdx-pin-input length="6" error></pdx-pin-input>\n</template>';
        expect(pinInputRemoved.detect(source).map((f) => f.line)).toEqual([2, 3]);
        expect(fix(source)).toBe('<template>\n  <pdx-otp-input mask length="4"></pdx-otp-input>\n  <pdx-otp-input mask length="6" error></pdx-otp-input>\n</template>');
    });

    it('keeps bindings, handlers and a bound length, and rewrites a self-closing tag', () => {
        const source = '<pdx-pin-input :length="n" ::value="pin" @pdx-complete="done" name="pin" />';
        expect(fix(source)).toBe('<pdx-otp-input mask :length="n" ::value="pin" @pdx-complete="done" name="pin" />');
    });

    it('a second run changes nothing, and another element is left', () => {
        const once = fix('<pdx-pin-input></pdx-pin-input>\n<pdx-pin-inputs></pdx-pin-inputs>');
        expect(once).toBe('<pdx-otp-input mask length="4"></pdx-otp-input>\n<pdx-pin-inputs></pdx-pin-inputs>');
        expect(pinInputRemoved.detect(once)).toEqual([]);
        expect(fix(once)).toBe(once);
    });

    it('is a removed form the compiler reports, naming <pdx-otp-input mask>', () => {
        const r = compile('<template>\n  <pdx-pin-input length="4"></pdx-pin-input>\n</template>\n', 'f.pdx');
        const removed = r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');
        expect(removed).toHaveLength(1);
        expect(removed[0].line).toBe(2);
        expect(removed[0].message).toContain('<pdx-otp-input mask>');
    });
});

describe('pin-input-strings', () => {
    it('flags an override of the pin-input strings, naming otp-input.maskedLabel', () => {
        const source = "setComponentStrings('pin-input', { label: 'Codice' });\nsetLocaleStrings({\n  select: { placeholder: 'Scegli' },\n  \"pin-input\": { label: 'Codice' },\n});";
        expect(pinInputStrings.detect(source).map((f) => f.line)).toEqual([1, 4]);
        expect(pinInputStrings.message).toContain('otp-input');
        expect(pinInputStrings.message).toContain('maskedLabel');
        expect(pinInputStrings.fix).toBe('flag');
    });

    it('leaves other components and the tag name in a string of markup', () => {
        expect(pinInputStrings.detect("setComponentStrings('otp-input', { maskedLabel: 'Codice' });")).toEqual([]);
        expect(pinInputStrings.detect("const tag = 'pdx-pin-input';")).toEqual([]);
    });

    it('is not a compiler error: the override is valid code that no longer names anything', () => {
        expect(pinInputStrings.kind).toBe('changed');
    });
});

describe('otp-input-mask-defaults', () => {
    it('flags a masked otp-input that leaves its label or its autocomplete to the default', () => {
        const source = [
            '<pdx-otp-input mask></pdx-otp-input>',
            '<pdx-otp-input mask label="Code"></pdx-otp-input>',
            '<pdx-otp-input :mask="hide" autocomplete="one-time-code"></pdx-otp-input>',
            '<pdx-otp-input mask label="Code" autocomplete="off"></pdx-otp-input>',
            '<pdx-otp-input></pdx-otp-input>',
        ].join('\n');
        expect(otpInputMaskDefaults.detect(source).map((f) => f.line)).toEqual([1, 2, 3]);
        expect(otpInputMaskDefaults.fix).toBe('flag');
        expect(otpInputMaskDefaults.kind).toBe('changed');
    });
});

describe('the registry', () => {
    it('registers the three, the defaults change before the removal so one run does not flag its own rewrite', () => {
        const ids = languageChanges().map((c) => c.id);
        expect(ids).toContain(pinInputRemoved.id);
        expect(ids).toContain(pinInputStrings.id);
        expect(ids.indexOf(otpInputMaskDefaults.id)).toBeGreaterThanOrEqual(0);
        expect(ids.indexOf(otpInputMaskDefaults.id)).toBeLessThan(ids.indexOf(pinInputRemoved.id));
    });
});
