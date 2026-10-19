// `$signal()` with no initial value is a signal that starts at `undefined` (#186).
//
// The declaration put the debug name after the initial value with a comma, whatever the value was:
// with none it emitted `signal(, { name: 'a:x' })`, which is not JavaScript. The compile succeeded
// and reported nothing; the module failed to parse where it was imported.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SOURCE = '<template><p>{{ picked ?? "none" }} {{ typed ?? "" }}</p></template>\n<script>\nlet picked = $signal();\nlet typed = $signal<string | undefined>( );\n</script>\n';

/** The module without its import/export lines, as `new Function` takes it. */
const parses = (code: string): string | null => {
    try {
        new Function(code.split('\n').filter((l) => !/^\s*(import|export)\s/.test(l)).join('\n'));
        return null;
    } catch (e) {
        return (e as Error).message;
    }
};

describe('$signal() with no initial value', () => {
    for (const production of [false, true]) {
        it(`compiles to a module that parses, the signal starting at undefined (${production ? 'production' : 'dev'})`, () => {
            const { code, warnings } = compile(SOURCE, 'a.pdx', [], undefined, { production });
            expect(warnings.filter((w) => w.severity !== 'info').map((w) => w.code)).toEqual([]);
            expect(parses(code), 'the module does not parse').toBeNull();
            expect(code).not.toMatch(/signal\(\s*,/);
            expect(code).toMatch(/__picked = signal\(undefined[,)]/);
            expect(code).toMatch(/__typed = signal\(undefined[,)]/);
        });
    }
});
