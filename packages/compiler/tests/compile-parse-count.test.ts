// One compile parses a script once for the checks that read it whole (#915).
//
// The design checks (`parseableScript`) parsed the same `<script>` again for each of their six
// callers, and the unused-variable check (`isReferencedInBody`) parsed the same body again for every
// name it looked up. Measured on three showcase and pilot files, the two were 11.5% of a dev compile.
// Parses are counted by the file name each pass gives its own, `ts.createSourceFile` wrapped.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const parses = vi.hoisted(() => new Map<string, number>());

vi.mock('typescript', async (importOriginal) => {
    const actual = (await importOriginal<{ default: typeof import('typescript') }>()).default;
    const wrapped = {
        ...actual,
        createSourceFile: (name: string, ...rest: unknown[]) => {
            parses.set(name, (parses.get(name) ?? 0) + 1);
            return (actual.createSourceFile as (...a: unknown[]) => unknown)(name, ...rest);
        },
    };
    return { ...wrapped, default: wrapped };
});

const { compile } = await import('../src/plugin');

// The template reads one of them: the others are read only in the script, which is what sends them to
// the body lookup.
const NAMES = Array.from({ length: 10 }, (_, i) => `count${i}`);
// Each test compiles its own text: a parse kept from another test's compile would count as none.
const source = (test: string): string => `<template>
  <button @click="bump()">{{ count0 }}</button>
</template>

<script>
// ${test}
${NAMES.map((n, i) => `let ${n} = $signal(${i});`).join('\n')}
let unused = $signal(0);
function bump() { ${NAMES.map((n) => `${n}++;`).join(' ')} }
</script>
`;

beforeEach(() => parses.clear());

describe('one compile and its parses of the whole script', () => {
    it('the design checks share one parse of the script', () => {
        compile(source(expect.getState().currentTestName ?? ''), '/src/counter.pdx', [], undefined, { production: false } as never);
        expect(parses.get('__pdx_design.ts'), 'parses of the script for the design checks').toBe(1);
    });

    it('the unused-variable check parses a body once, whatever the number of names', () => {
        compile(source(expect.getState().currentTestName ?? ''), '/src/counter.pdx', [], undefined, { production: false } as never);
        const n = parses.get('__pdx_check.ts') ?? 0;
        // At least one: the names are looked up, so a count of none would be a test that measured nothing.
        expect(n, 'parses of a body to look its names up').toBeGreaterThanOrEqual(1);
        expect(n, 'parses of a body to look its names up').toBeLessThanOrEqual(2);
    });

    it('still reports the one variable nothing reads', () => {
        const { warnings } = compile(source(expect.getState().currentTestName ?? ''), '/src/counter.pdx', [], undefined, { production: false } as never) as { warnings?: { message: string }[] };
        const unusedWarnings = (warnings ?? []).filter((w) => /'unused'/.test(w.message));
        expect(unusedWarnings.length).toBe(1);
        expect((warnings ?? []).filter((w) => NAMES.some((n) => w.message.includes(`'${n}'`) && /not used/.test(w.message)))).toEqual([]);
    });
});
