// The .d.ts of `@expose` on a reactive name (#752): a $derived is a `readonly` member of its value's
// type, a $signal a writable one. The type is the one written — `$signal<T>(…)`, `$derived<T>(…)` or
// an annotation — since the compiler has no type checker to infer it; without one it is `unknown`.
// What runs is held in packages/core/tests/expose-accessor.test.ts.

import { describe, it, expect } from 'vitest';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts, exposedMembers } from '../src/compiler/dts-generator';

function dtsOf(script: string): string {
    const analysis = analyzeScript(script, 'counter.pdx');
    return generateDts({ tag: 'app-counter', props: analysis.props, events: analysis.events, slots: analysis.slots, exposed: exposedMembers(analysis) });
}

describe('the .d.ts of an exposed reactive name', () => {
    it('a $derived is readonly, a $signal is writable, each with the type written', () => {
        const dts = dtsOf([
            'let count = $signal<number>(0);',
            'const doubled = $derived<number>(count * 2);',
            '@expose count, doubled;',
        ].join('\n'));
        expect(dts).toContain('export interface AppCounterExposed {\n  count: number;\n  readonly doubled: number;\n}');
        expect(dts).toContain("'app-counter': HTMLElement & AppCounterProps & AppCounterExposed;");
    });

    it('an annotation is the type too; with neither, the member is unknown', () => {
        const dts = dtsOf([
            'let label: string = $signal(\'\');',
            'const big = $derived(label.length > 3);',
            '@expose label, big;',
        ].join('\n'));
        expect(dts).toContain('  label: string;\n  readonly big: unknown;\n');
    });

    it('a type with a comma or an arrow is kept whole', () => {
        const dts = dtsOf([
            'let map = $signal<Record<string, number>>({});',
            'const pick = $derived<() => void>(() => () => {});',
            '@expose map, pick;',
        ].join('\n'));
        expect(dts).toContain('  map: Record<string, number>;\n  readonly pick: () => void;\n');
    });

    it('control: a component that exposes nothing adds no interface', () => {
        const dts = dtsOf('function reset() {}');
        expect(dts).not.toContain('Exposed');
        expect(dts).toContain("'app-counter': HTMLElement & AppCounterProps;");
    });
});

// A published component's declaration is its public API (#1004): the methods it exposes and the parts a
// caller reaches through it are typed, not left out.
describe('the .d.ts of an exposed function and an exposed part', () => {
    it('a function is a method of the element, with the parameters and the return type written', () => {
        const dts = dtsOf([
            'function reset() {}',
            'function goTo(index: number, smooth?: boolean): void {}',
            'async function load(id: string, force = false) {}',
            'const pick = (value: string): string => value;',
            '@expose reset, goTo, load, pick;',
        ].join('\n'));
        expect(dts).toContain([
            'export interface AppCounterExposed {',
            '  reset(): unknown;',
            '  goTo(index: number, smooth?: boolean): void;',
            '  load(id: string, force?: unknown): Promise<unknown>;',
            '  pick(value: string): string;',
            '}',
        ].join('\n'));
    });

    it('an exposed part is its element, or the array of them when the template renders more than one', () => {
        const analysis = analyzeScript('@part trigger, option;\n@expose trigger, option;', 'counter.pdx');
        const exposed = exposedMembers(analysis, new Map([['trigger', 1], ['option', Infinity]]));
        expect(exposed).toEqual([
            { name: 'trigger', type: 'HTMLElement | null', readonly: true },
            { name: 'option', type: 'HTMLElement[]', readonly: true },
        ]);
    });
});
