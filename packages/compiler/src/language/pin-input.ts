// `<pdx-pin-input>` is removed: a masked PIN is `<pdx-otp-input mask>` (#286, decision 48).
//
// The pin-input was an otp-input with `mask` and three other defaults: 4 cells, `autocomplete="off"`
// and the group name «PIN». The otp-input now takes the last two itself when `mask` is set, so the
// rewrite is the tag, `mask`, and `length="4"` where the source had no length. `numeric` defaults to
// true in both and is not written. Three entries:
//
//   pin-input-removed       — removed: the tag is PDX_REMOVED_FORM, and `pdx migrate` rewrites it;
//   pin-input-strings       — changed: an override of the `pin-input` component strings names nothing
//                             any more (its label is `otp-input.maskedLabel`); flagged;
//   otp-input-mask-defaults — changed: a `<pdx-otp-input mask>` that leaves its label or autocomplete to
//                             the default now gets the PIN ones; flagged.

import { openTags } from '../text-scan';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

/** Whether a tag's attributes hold `name`, written bare, bound (`:name`) or two-way (`::name`). */
function hasAttr(attrs: string, name: string): boolean {
    // Match: ` name`, ` :name` or ` ::name`, ended by `=`, whitespace, `/`, `>` or the end.
    return new RegExp(`(?:^|\\s)(?:::?)?${name}(?=[\\s=/>]|$)`).test(attrs);
}

// Match: the closing tag `</pdx-pin-input>`, any case, whitespace before its `>`.
const CLOSING = /<\/pdx-pin-input\s*>/gi;

export const pinInputRemoved: LanguageChange = {
    id: 'pin-input-removed',
    kind: 'removed',
    scope: 'pdx',
    issue: 286,
    message: '`<pdx-pin-input>` is removed: write `<pdx-otp-input mask>`, which takes the PIN defaults (an `off` autocomplete, the «PIN» group name); pin-input had 4 cells, otp-input has 6, so give it `length="4"`.',
    marker: /<pdx-pin-input/i,
    detect(text): LanguageChangeFinding[] {
        return [...openTags(text, 'pdx-pin-input')].map((tag) => ({ line: lineAt(text, tag.start), found: tag.text }));
    },
    fix(text) {
        let out = text;
        // From the last, so earlier offsets stay valid.
        for (const tag of [...openTags(text, 'pdx-pin-input')].reverse()) {
            const added = hasAttr(tag.attrs, 'length') ? ' mask' : ' mask length="4"';
            out = out.slice(0, tag.start) + '<pdx-otp-input' + added + tag.attrs + '>' + out.slice(tag.end);
        }
        return out.replace(CLOSING, '</pdx-otp-input>');
    },
};

// Match: a call of setComponentStrings or registerComponentStrings whose first argument is the string
// pin-input, in any quote. Groups: [1]=the quote
const STRINGS_CALL = /\b(?:set|register)ComponentStrings\s*\(\s*(['"`])pin-input\1/g;
// Match: `'pin-input':` as a key of an object literal — a locale catalogue's entry.
// Groups: [1]=the quote
const STRINGS_KEY = /(['"`])pin-input\1\s*:/g;

export const pinInputStrings: LanguageChange = {
    id: 'pin-input-strings',
    kind: 'changed',
    scope: 'script',
    issue: 286,
    message: 'The `pin-input` component strings name nothing since `<pdx-pin-input>` was removed: its label is `otp-input`\'s `maskedLabel`.',
    marker: 'pin-input',
    detect(text): LanguageChangeFinding[] {
        const out: LanguageChangeFinding[] = [];
        for (const re of [STRINGS_CALL, STRINGS_KEY]) {
            for (const m of text.matchAll(re)) out.push({ line: lineAt(text, m.index), found: m[0] });
        }
        return out.sort((a, b) => a.line - b.line);
    },
    fix: 'flag',
};

export const otpInputMaskDefaults: LanguageChange = {
    id: 'otp-input-mask-defaults',
    kind: 'changed',
    scope: 'pdx',
    issue: 286,
    message: 'A masked `<pdx-otp-input>` now defaults to `autocomplete="off"` and the «PIN» group name (`otp-input.maskedLabel`); it had `one-time-code` and «Verification code». Set `autocomplete` and `label` to keep the old ones.',
    marker: /<pdx-otp-input/i,
    detect(text): LanguageChangeFinding[] {
        const out: LanguageChangeFinding[] = [];
        for (const tag of openTags(text, 'pdx-otp-input')) {
            if (!hasAttr(tag.attrs, 'mask')) continue;
            if (hasAttr(tag.attrs, 'label') && hasAttr(tag.attrs, 'autocomplete')) continue;
            out.push({ line: lineAt(text, tag.start), found: tag.text });
        }
        return out;
    },
    fix: 'flag',
};
