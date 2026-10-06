// A template directive is not a prop, and the two lists that say so cannot drift.
//
// `:show` on a `<pdx-*>` element works: the template engine routes `:show` itself, in
// `bindAttribute`, exactly as it routes `:ref`. A check that does not know that draws
// PDX_UNKNOWN_PROP — *"the value lands on an element property nothing reads"* — with a hint
// proposing `:size`, which would break the screen.
//
// Cheap to write off as one missing string, and expensive as a habit: such a warning is printed on
// every build of the showcase, names a correct line, and proposes a replacement that is wrong. A
// diagnostic that is wrong about working code is how a build log stops being read — and this
// repository's log has to be read, because PDX_UNRESOLVED_COMPONENT and PDX_INVALID_ENUM_VALUE
// speak there too.
//
// So the list is named, and this file is the lockstep: the runtime's branches are read out of
// core's source and compared to what the compiler believes. `@pdxui/compiler` cannot import
// from `@pdxui/core` — they are separate packages and the compiler runs in Node — so "one
// definition" is enforced the way the repository enforces it elsewhere (`gen-manifest-fresh`,
// `skill-catalog-lockstep`): by regenerating the fact and comparing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../src/plugin';
import { ComponentResolver } from '../src/component-resolver';
import { TEMPLATE_DIRECTIVES } from '../src/compiler/codegen-prop-names';

const resolver = new ComponentResolver();
resolver.registerUiManifest();
const propsOf = (tag: string) => resolver.propsOf(tag);

function compileTemplate(template: string) {
    const source = `<template>\n${template}\n</template>\n<script setup>\n  let on = $signal(false);\n  let box = $signal(null);\n</script>`;
    return compile(source, 'directives.pdx', [], undefined, { propsOf });
}

const codes = (r: ReturnType<typeof compile>) => r.warnings.map((w) => w.code);
const messages = (r: ReturnType<typeof compile>) => r.warnings.map((w) => w.message).join('\n');

describe('a directive bound on a known component', () => {
    it(':show is not reported as an unknown prop', () => {
        const r = compileTemplate('<pdx-button :show="on">Save</pdx-button>');
        expect(codes(r), messages(r)).not.toContain('PDX_UNKNOWN_PROP');
    });

    it(':ref is not either — the case that was already right, as the control', () => {
        const r = compileTemplate('<pdx-button :ref="box">Save</pdx-button>');
        expect(codes(r), messages(r)).not.toContain('PDX_UNKNOWN_PROP');
    });

    it('and a genuinely unknown prop still warns', () => {
        // Without this, the fix is "stop checking" and every test above passes.
        const r = compileTemplate('<pdx-button :nosuchprop="on">Save</pdx-button>');
        expect(codes(r)).toContain('PDX_UNKNOWN_PROP');
    });

    it('and the same directives on a NATIVE element are silent, as they always were', () => {
        const r = compileTemplate('<span :show="on">hi</span>');
        expect(codes(r), messages(r)).not.toContain('PDX_UNKNOWN_PROP');
    });
});

describe('the directive list and the template engine', () => {
    /**
     * The names `bindAttribute` routes before it falls through to a property binding.
     *
     * Read out of the source rather than imported: the compiler may not depend on core. Both the
     * exact matches (`key === ':show'`) and the prefixes (`key.startsWith(':class.')`) count — a
     * prefix means the ROOT name is a directive, which is what the compiler checks.
     */
    function directivesInRuntime(): string[] {
        const src = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), '../../core/src/renderer/template.ts'), 'utf8');
        const start = src.indexOf('function bindAttribute');
        expect(start, 'bindAttribute has moved or been renamed — this lockstep is reading nothing')
            .toBeGreaterThan(-1);
        const body = src.slice(start, start + 2000);

        const names = new Set<string>();
        for (const m of body.matchAll(/key === ':([\w-]+)'/g)) names.add(m[1]);
        for (const m of body.matchAll(/key\.startsWith\(':([\w-]+)\./g)) names.add(m[1]);
        return [...names].sort();
    }

    it('agree, name for name', () => {
        const runtime = directivesInRuntime();
        expect(runtime.length, 'no directive branches were found — has bindAttribute changed shape?')
            .toBeGreaterThan(2);
        expect([...TEMPLATE_DIRECTIVES].sort(),
            'the compiler and the template engine disagree about what is a directive: '
            + `runtime says [${runtime}], the compiler says [${[...TEMPLATE_DIRECTIVES].sort()}]`,
        ).toEqual(runtime);
    });
});
