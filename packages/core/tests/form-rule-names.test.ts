// The compiler's list of core's form rules is core's list (#203).
//
// The compiler cannot import from core, so it keeps the names of the validators it imports for an
// inline `@form` in `CORE_FORM_RULES`. A validator added to core and missing there would be treated as
// a rule the script must declare — `PDX_FORM_UNKNOWN_RULE`, and no import.

import { describe, it, expect } from 'vitest';
import * as validators from '../src/form/validators';
import * as core from '../src/index';
import { CORE_FORM_RULES } from '../../compiler/src/compiler/form-rules';

/** The validator factories: every function `validators.ts` exports but its two schema helpers. */
const HELPERS = new Set(['validateSchema', 'isStandardSchema']);

describe('CORE_FORM_RULES', () => {
    it("is exactly the validator factories core's validators.ts exports", () => {
        const factories = Object.entries(validators)
            .filter(([n, v]) => typeof v === 'function' && !HELPERS.has(n))
            .map(([n]) => n).sort();
        expect([...CORE_FORM_RULES].sort()).toEqual(factories);
    });

    it('each is exported by @pdxui/core, where the compiled module imports it from', () => {
        for (const name of CORE_FORM_RULES) {
            expect((core as Record<string, unknown>)[name], name).toBeTypeOf('function');
        }
    });
});
