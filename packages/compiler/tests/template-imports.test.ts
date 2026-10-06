// A template reaches what the script imports.
//
// `prefixCtx` prepends `ctx.` to every free identifier it does not recognise, so it has to
// recognise the file's own imports as well as the browser's globals and core primitives: otherwise
// `@click="toggleDarkMode()"` with `import { toggleDarkMode } from '@pdxui/core'` compiles to
// `ctx.toggleDarkMode()`, and the click throws «e.toggleDarkMode is not a function». The template
// is compiled into the same module, so an imported name is in scope there; the prefix is what
// would take it out.
//
// This file is the compiler half: what is emitted, on each path. The runtime half, a component
// compiled, mounted and clicked, is packages/ui/tests/unit/template-imports-runtime.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const PATHS = {
    dev: {},
    build: { production: true },
    'production inline': { production: true, inlineBindings: true },
} as const;

function sfc(script: string, template: string): string {
    return `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;
}

function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

for (const [name, opts] of Object.entries(PATHS)) {
    describe(`imports in the template — ${name}`, () => {
        const compileWith = (script: string, template: string) =>
            compile(sfc(`let n = $signal(0);\n${script}`, template), 'imp.pdx', [], undefined, opts).code;

        it('a core import called from a handler is the import, not ctx.<name>', () => {
            const code = compileWith("import { toggleDarkMode } from '@pdxui/core';", '<button @click="toggleDarkMode()">x</button>');
            parses(code);
            expect(code, 'the handler reaches for a context property that does not exist').not.toMatch(/ctx\.toggleDarkMode/);
            expect(code).toMatch(/toggleDarkMode\(\)/);
        });

        it('a named user import read in an interpolation', () => {
            const code = compileWith("import { fmt } from './helpers';", '<p>{{ fmt(n) }}</p>');
            parses(code);
            expect(code).not.toMatch(/ctx\.fmt/);
        });

        it('an aliased, a default and a namespace import', () => {
            const code = compileWith(
                "import { format as fmt2 } from './a';\nimport label from './b';\nimport * as h from './c';",
                '<p @click="h.go(label, fmt2(n))">{{ label }}</p>');
            parses(code);
            expect(code, 'an aliased import is known by its local name').not.toMatch(/ctx\.fmt2/);
            expect(code, 'a default import').not.toMatch(/ctx\.label/);
            expect(code, 'a namespace import').not.toMatch(/ctx\.h\b/);
        });
    });
}

describe('imports in the template — what does not change', () => {
    const compileDev = (script: string, template: string) =>
        compile(sfc(`let n = $signal(0);\n${script}`, template), 'imp.pdx', [], undefined, {}).code;

    it('control — a name the component declares is its own, even when an import shares it', () => {
        // The setup's `function fmt` shadows the module's import inside the setup. The template is
        // outside the setup, so reaching the setup's one takes `ctx.`, exactly as for `confirm`:
        // a global yields to a name the component declares, and so does an import.
        const code = compileDev("import { fmt } from './helpers';\nfunction fmt(v) { return v; }", '<p>{{ fmt(n) }}</p>');
        expect(code, 'the template reached past the component\'s own function to the import').toMatch(/ctx\.fmt/);
    });

    it('control — an `import type` is not a runtime binding', () => {
        const code = compileDev("import type { Row } from './types';", '<p>{{ Row }}</p>');
        expect(code, 'a type-only name was left bare, where it would be a ReferenceError').toMatch(/ctx\.Row/);
    });

    it('control — a plain declared function keeps ctx., as before', () => {
        const code = compileDev('function go() {}', '<button @click="go()">x</button>');
        expect(code).toMatch(/ctx\.go/);
    });
});
