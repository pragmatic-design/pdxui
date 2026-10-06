// A custom element the file's own script registers is not "unresolved".
//
// PDX_UNRESOLVED_COMPONENT asks the resolver — @pdxui/* exports and the project's .pdx files — and
// reads the script too. The error-boundary demo defines `demo-flaky-widget` with
// `defineComponent('demo-flaky-widget', …)` and renders it; asking only the resolver, `pdx check`
// would call it "not resolved … will not be registered", a false defect.
//
// The rule: a string literal passed first to `customElements.define(`, `defineComponent(` or
// `component(` in the script registers that tag. Nothing beyond that is guessed — a name held in a
// variable still counts as unresolved, which is the half this must not lose.

import { describe, it, expect } from 'vitest';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate } from '../src/compiler/validate';

function unresolved(template: string, script: string): string[] {
    // A rune keeps the script in the new mode: analyzeScript alone reads a rune-less script as legacy,
    // and validate() then checks nothing — every case below would pass for no reason.
    const src = `<template>\n${template}\n</template>\n\n<script setup>\nlet probe = $signal(0);\n${script}\n</script>`;
    const d = parseSFC(src);
    const warnings = validate(analyzeScript(d.script?.content ?? '', 'probe.pdx'), parseTemplate(d.template?.content ?? ''), 'probe.pdx', { isKnownTag: () => false });
    return warnings.filter((w) => w.code === 'PDX_UNRESOLVED_COMPONENT').map((w) => /<([\w-]+)>/.exec(w.message)![1]);
}

describe('a tag the file defines itself is known', () => {
    it('defineComponent(…) in the script', () => {
        expect(unresolved('<x-local></x-local>', "import { component as defineComponent } from '@pdxui/core';\ndefineComponent('x-local', { render: () => null });")).toEqual([]);
    });

    it('component(…) in the script', () => {
        expect(unresolved('<x-local></x-local>', "import { component } from '@pdxui/core';\ncomponent('x-local', { render: () => null });")).toEqual([]);
    });

    it('customElements.define(…), also inside a guard, as the showcase writes it', () => {
        expect(unresolved('<x-local></x-local>', "if (!customElements.get('x-local')) {\n  customElements.define('x-local', class extends HTMLElement {});\n}")).toEqual([]);
    });

    it('control — a tag defined nowhere is still reported', () => {
        expect(unresolved('<x-local></x-local><x-other></x-other>', "customElements.define('x-local', class extends HTMLElement {});")).toEqual(['x-other']);
    });

    it('control — a name held in a variable is not guessed', () => {
        expect(unresolved('<x-local></x-local>', "const name = 'x-local';\ncustomElements.define(name, class extends HTMLElement {});")).toEqual(['x-local']);
    });
});
