// TypeScript in a .pdx script is erased by the compiler, types only.
//
// A script's `lang` defaults to `ts` and the editor checks it as TypeScript, so `import type`,
// annotations, `as`, `!` and generic call arguments must not reach the browser as written: the module
// would not parse. The erasure replaces the type syntax with spaces: every line and column of the
// module stays where it is, so the source map and the positions of the findings do not move (a
// blanker of our own, no dependency).

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { eraseTypes } from '../src/compiler/erase-types';

/** The module parses as JavaScript: imports dropped, `new Function` judges the rest. */
function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '').replace(/^export /gm, '');
    expect(() => new Function(body), `the module is not valid JavaScript:\n${code}`).not.toThrow();
}

const TYPED = `<template><p>{{ label }} {{ n }}</p></template>
<script setup>
import type { ViewState } from './data/views';
import { pickView, type SavedView } from './data/views';
interface Row { id: number; name?: string }
type Mode = 'a' | 'b';
@prop label: string = 'x';
let n = $signal<number>(1);
const o = {} as Record<string, string>;
const p = pickView({}) satisfies ViewState;
function f(a: string, b?: number): string { return a + (b ?? 0); }
const g = api.get<Row[]>('/x');
const h = (el: HTMLElement | null): HTMLElement => el!;
const s: SavedView | null = null;
let q!: Mode;
class Box<T> implements Iterable<T> { private items: T[] = []; [Symbol.iterator]() { return this.items[Symbol.iterator](); } }
const first = document.querySelector('p')!.textContent;
function bump(): void { n++; }
</script>`;

describe('TypeScript in a .pdx script', () => {
    for (const [label, opts] of [['dev', {}], ['production', { production: true }]] as const) {
        it(`${label}: the module parses as JavaScript, with every runtime statement kept`, () => {
            const { code } = compile(TYPED, 'typed.pdx', [], undefined, opts);
            parses(code);
            expect(code).not.toMatch(/import type|interface Row|type Mode|as Record|satisfies|<Row\[\]>|: string\)|private items/);
            expect(code).toContain("import { pickView");
            expect(code).not.toMatch(/\btype SavedView\b/);
            expect(code).toContain('function f(a');
            expect(code).toContain("api.get");
            expect(code).toContain('class Box');
            // The runes still lowered: the signal is a signal, and its write a .set.
            expect(code).toMatch(/__n\.set\(/);
        });
    }

    it('a type imported from @pdxui/core is not imported at runtime', () => {
        // The core import is merged into the one the compiler writes. Taking every name between the
        // braces would make `DataSource`, a type, a runtime import, and the browser would refuse the
        // module — «does not provide an export named 'DataSource'» — in dev only.
        const script = "import type { DataSource } from '@pdxui/core';\nimport { createDataSource, type SortDescriptor } from '@pdxui/core';\n"
            + "const s: DataSource<unknown> | null = null;\nconst sort: SortDescriptor[] = [];\nconst d = createDataSource({ sort });\n";
        for (const source of [
            `<template><p>x</p></template>\n<script setup>\n${script}</script>`,
            `<template><p>x</p></template>\n<script>\n${script}const props = defineProps({});\nreturn { s, d };\n</script>`,
        ]) {
            const { code } = compile(source, 'core-types.pdx');
            const runtime = code.match(/^import \{([^}]*)\} from '@pdxui\/core';$/m)?.[1] ?? '';
            expect(runtime).toContain('createDataSource');
            expect(runtime).not.toMatch(/\bDataSource\b|SortDescriptor/);
            parses(code);
        }
    });

    it('keeps every position: the same length, every newline where it was, only spaces in place of types', () => {
        const typed = "import type { A } from './a';\nconst x: number = f<A>(1) as number;\nfunction g(\n  a: string,\n): void {}\n";
        const out = eraseTypes(typed, 'x.pdx');
        expect(out.length).toBe(typed.length);
        expect([...out].map((c, i) => c === '\n' ? i : -1).filter(i => i >= 0))
            .toEqual([...typed].map((c, i) => c === '\n' ? i : -1).filter(i => i >= 0));
        expect([...out].every((c, i) => c === typed[i] || c === ' ')).toBe(true);
        expect(out).toContain('const x         = f   (1)          ;');
    });

    it('a finding after a typed line keeps its position in the file', () => {
        const source = TYPED.replace('</script>', 'let unused = $signal(0);\n</script>');
        const w = compile(source, 'typed.pdx').warnings.find(x => x.code === 'PDX_UNUSED_REACTIVE');
        expect(w?.line).toBe(source.split('\n').findIndex(l => l.startsWith('let unused')) + 1);
    });

    it('a .pdx.ts with types compiles to JavaScript too', () => {
        const { code } = compile("import type { X } from './x';\nconst count: number = 1;\nexport function twice(v: number): number { return v * 2; }\n", 'util.pdx.ts');
        expect(code).not.toMatch(/import type|: number/);
        expect(code).toContain('export function twice(v');
    });

    it('TypeScript with a runtime of its own stops the compile, naming the construct', () => {
        for (const [name, script] of [
            ['enum', 'enum Color { Red, Green }\nlet c = $signal(Color.Red);'],
            ['namespace', 'namespace NS { export const a = 1; }\nlet c = $signal(1);'],
            ['parameter property', 'class A { constructor(private x: number) {} }\nlet c = $signal(1);'],
        ] as const) {
            expect(() => compile(`<template><p>{{ c }}</p></template>\n<script setup>\n${script}\n</script>`, 'rt.pdx'), name)
                .toThrow(/PDX_TS_UNSUPPORTED/);
        }
    });

    it('control — a script with no TypeScript compiles to the module it always did', () => {
        const plain = "<template><p>{{ n }}</p></template>\n<script setup>\nlet n = $signal(1);\nfunction bump() { n++; }\n</script>";
        const { code } = compile(plain, 'plain.pdx');
        parses(code);
        expect(code).toContain('function bump() { __n.set(');
    });
});
