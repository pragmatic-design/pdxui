// `pdx migrate` and #752: an `@expose`d $signal or $derived is its value on the element now, so a
// caller that called it — `ref.name()` on the `:ref` of that component — reads a value and calls it.
// The change flags each call; the resolver says which exposed names of a project .pdx are reactive.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComponentResolver } from '../src/component-resolver';
import { LANGUAGE_CHANGES } from '../src/language/changes';

const change = LANGUAGE_CHANGES.find((c) => c.id === 'expose-reactive-call')!;

const PARENT = [
    '<template>',
    '  <app-counter :ref="counter"></app-counter>',
    '  <app-other :ref="other"></app-other>',
    '</template>',
    '<script>',
    'let counter = $signal(null);',
    'let other = $signal(null);',
    'function read() {',
    '  const n = counter.count();',
    '  const d = counter?.doubled();',
    '  counter.reset();',
    '  other.count();',
    '}',
    '</script>',
    '',
].join('\n');

const reactive = (tag: string): ReadonlySet<string> | null =>
    tag === 'app-counter' ? new Set(['count', 'doubled']) : tag === 'app-other' ? new Set() : null;

describe('the expose-reactive-call change', () => {
    it('is registered as a flag of #752', () => {
        expect(change).toBeDefined();
        expect(change.issue).toBe(752);
        expect(change.fix).toBe('flag');
    });

    it('flags a call of a reactive exposed name on the ref of that component, and nothing else', () => {
        expect(change.detect(PARENT, { reactiveExposedOf: reactive })).toEqual([
            { line: 9, found: 'counter.count()' },
            { line: 10, found: 'counter?.doubled()' },
        ]);
    });

    it('control: without the lookup, it finds nothing', () => {
        expect(change.detect(PARENT, {})).toEqual([]);
    });
});

describe('the resolver knows the reactive exposed names', () => {
    it('of a project .pdx: the @expose names declared $signal or $derived, not its functions', () => {
        const root = mkdtempSync(join(tmpdir(), 'pdx-exposed-'));
        try {
            mkdirSync(join(root, 'src'), { recursive: true });
            writeFileSync(join(root, 'src', 'counter.pdx'), [
                '<template><p>{{ count }}</p></template>',
                '<script>',
                'let count = $signal<number>(0);',
                'const doubled: number = $derived(count * 2);',
                'function reset() { count = 0; }',
                '@expose count, doubled, reset;',
                '</script>',
                '',
            ].join('\n'));
            const r = new ComponentResolver();
            r.registerProjectComponents(root);
            expect([...r.reactiveExposedOf('app-counter')!].sort()).toEqual(['count', 'doubled']);
            expect(r.reactiveExposedOf('app-unknown')).toBeNull();
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
