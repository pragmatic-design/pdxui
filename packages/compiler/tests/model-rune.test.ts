// `@model name: T = default;` declares a prop the component may write (#124): the descriptor's
// `models`, a script name whose assignment writes the prop and dispatches `<name>-change`, and in the
// parent `::name`, which is valid on a model and on the value properties of native form elements only.
//
// This file is the compiler half. The runtime half — a child and a parent compiled and mounted, the
// value going both ways — is packages/ui/tests/unit/model-runtime.test.ts.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { ComponentResolver } from '../src/component-resolver';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts } from '../src/compiler/dts-generator';
import { validate } from '../src/compiler/validate';
import { parseTemplate } from '../src/parser/template';

function sfc(script: string, template = '<input ::value="value" />'): string {
    return `<template>\n${template}\n</template>\n<script>\n${script}\n</script>`;
}

const FIELD = "@model value: string = '';\n@prop label: string = '';\nfunction clear() { value = ''; }";

for (const [name, opts] of Object.entries({ dev: {}, build: { production: true } })) {
    describe(`@model — ${name}`, () => {
        it('goes into the descriptor\'s models, not its props', () => {
            const { code } = compile(sfc(FIELD), 'field.pdx', [], undefined, opts);
            expect(code).toMatch(/models: \{\s*value: \{ type: String, default: '' \}\s*\}/);
            const props = code.match(/props: (\{[\s\S]*?\n {2}\}|\{\})/)?.[1] ?? '';
            expect(props).toContain('label');
            expect(props).not.toContain('value');
        });

        it('is a signal in the script: an assignment writes it through the model', () => {
            const { code } = compile(sfc(FIELD), 'field.pdx', [], undefined, opts);
            expect(code).toContain('const __value = ctx.value;');
            expect(code).toMatch(/function clear\(\) \{ __value\.set(Raw)?\(''\); \}/);
        });
    });
}

describe('@model — the analysis and the types', () => {
    it('is a prop marked as a model', () => {
        const analysis = analyzeScript("@model value: string = '';", 'field.pdx');
        expect(analysis.props).toEqual([expect.objectContaining({ name: 'value', tsType: 'string', default: "''", model: true })]);
    });

    it('a model without a type is the same error a prop without one is', () => {
        const analysis = analyzeScript('@model value;', 'field.pdx');
        expect(analysis.warnings.map(w => w.code)).toContain('PDX_PROP_NO_TYPE');
    });

    it('writing a model is no PDX_PROP_WRITE; writing a prop still is', () => {
        const codes = compile(sfc(FIELD + "\nfunction rename() { label = 'x'; }"), 'field.pdx', [], undefined, {}).warnings
            .filter(w => w.code === 'PDX_PROP_WRITE').map(w => w.message);
        expect(codes).toHaveLength(1);
        expect(codes[0]).toContain('label');
    });

    it('the .d.ts declares the prop and its <name>-change event, { value: T }', () => {
        const analysis = analyzeScript("@model selectedId: string = '';", 'pick.pdx');
        const dts = generateDts({ tag: 'pdx-pick', props: analysis.props, events: analysis.events, slots: [] });
        expect(dts).toMatch(/selectedId\??: string;/);
        expect(dts).toMatch(/'selected-id-change': \{ value: string \};/);
    });
});

describe('PDX_TWO_WAY_NOT_MODEL', () => {
    const MODELS: Record<string, ReadonlySet<string>> = { 'app-field': new Set(['value']) };
    const modelsOf = (tag: string) => MODELS[tag] ?? null;
    function codes(template: string): string[] {
        const analysis = analyzeScript("let name = $signal('');", 'parent.pdx');
        return validate(analysis, parseTemplate(template), 'parent.pdx', { modelsOf })
            .filter(w => w.code === 'PDX_TWO_WAY_NOT_MODEL').map(w => `${w.severity}: ${w.message} | ${w.hint}`);
    }

    it('::x on a prop of a component that declares its models is an error, with the hint', () => {
        const found = codes('<app-field ::label="name"></app-field>');
        expect(found).toHaveLength(1);
        expect(found[0]).toMatch(/^error: /);
        expect(found[0]).toContain("'label'");
        expect(found[0]).toContain('declare `@model label` in the child');
    });

    it('a modifier does not hide the name: ::label.trim is the same error', () => {
        expect(codes('<app-field ::label.trim="name"></app-field>')).toHaveLength(1);
    });

    it('::x on a model is valid', () => {
        expect(codes('<app-field ::value="name"></app-field>')).toEqual([]);
    });

    it('the value properties of native form elements are the platform\'s models', () => {
        expect(codes('<input ::value="name" /><input type="checkbox" ::checked="name" /><textarea ::value="name"></textarea><select ::value="name"></select>')).toEqual([]);
    });

    it('::group binds a component\'s one model: valid with one, an error with none or several (#127)', () => {
        const groupCodes = (template: string, models: Record<string, string[]>) => {
            const analysis = analyzeScript("let name = $signal('');", 'parent.pdx');
            const lookup = (tag: string) => (models[tag] ? new Set(models[tag]) : null);
            return validate(analysis, parseTemplate(template), 'parent.pdx', { modelsOf: lookup })
                .filter(w => w.code === 'PDX_TWO_WAY_NOT_MODEL').map(w => w.message);
        };
        expect(groupCodes('<app-tags ::group="name"></app-tags>', { 'app-tags': ['value'] })).toEqual([]);
        expect(groupCodes('<app-pair ::group="name"></app-pair>', { 'app-pair': ['from', 'to'] })).toHaveLength(1);
        expect(groupCodes('<app-none ::group="name"></app-none>', { 'app-none': [] })[0]).toContain('::group');
        expect(groupCodes('<input type="checkbox" value="a" ::group="name" />', {}), 'native: the platform group').toEqual([]);
    });

    it('a component whose models are not known (no manifest entry, none listed) is left as it was', () => {
        expect(codes('<pdx-input ::value="name"></pdx-input><other-thing ::open="name"></other-thing>')).toEqual([]);
    });
});

describe('the resolver knows the models', () => {
    it('of a project .pdx, read from its @model lines, again when the file changes', () => {
        const root = mkdtempSync(join(tmpdir(), 'pdx-models-'));
        try {
            const file = join(root, 'src', 'name-field.pdx');
            mkdirSync(join(root, 'src'), { recursive: true });
            writeFileSync(file, "<template><input ::value=\"value\" /></template>\n<script>\n@model value: string = '';\n@prop label: string = '';\n</script>\n");
            const r = new ComponentResolver();
            r.registerProjectComponents(root);
            expect([...r.modelsOf('app-name-field')!]).toEqual(['value']);
            writeFileSync(file, "<template><p/></template>\n<script>\n@prop label: string = '';\n</script>\n");
            // A later modification time, as an edit gives it: the cache is read again.
            utimesSync(file, new Date(), new Date(Date.now() + 5000));
            expect([...r.modelsOf('app-name-field')!], 'a component that declares none answers an empty set').toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('of a library component, from its manifest; an empty set when it lists none (#125)', () => {
        const r = new ComponentResolver();
        r.registerUiManifest(process.cwd());
        expect([...r.modelsOf('pdx-input')!]).toEqual(['value']);
        expect([...r.modelsOf('pdx-select')!]).toEqual(['value']);
        expect([...r.modelsOf('pdx-otp-input')!]).toEqual(['value']);
        // The page and its size are positions the pager changes itself (#289): models.
        expect([...r.modelsOf('pdx-pagination')!]).toEqual(['page', 'pageSize']);
        // A progress bar shows a value only its parent writes: no model, and that is known — so
        // `::value` on it is refused, not left to a listening that never comes.
        expect(r.has('pdx-progress')).toBe(true);
        expect([...r.modelsOf('pdx-progress')!]).toEqual([]);
        expect(r.modelsOf('pdx-not-a-component')).toBeNull();
    });

    it('`::x` on a library component that lists no model is PDX_TWO_WAY_NOT_MODEL (#125)', () => {
        const r = new ComponentResolver();
        r.registerUiManifest(process.cwd());
        const { warnings } = compile('<template>\n  <pdx-progress ::value="p"></pdx-progress>\n  <pdx-pagination ::page="n"></pdx-pagination>\n</template>\n<script>\nlet p = $signal(40);\nlet n = $signal(1);\n</script>\n',
            'page.pdx', [], undefined, { modelsOf: (tag) => r.modelsOf(tag) });
        // The pager's `::page` is a model since #289, and is not reported.
        expect(warnings.filter((w) => w.code === 'PDX_TWO_WAY_NOT_MODEL').map((w) => w.message))
            .toEqual([expect.stringContaining("'::value' on <pdx-progress>")]);
    });
});

// `@model value: T = default { form }` (#135): the component is form-associated, and this model is the
// value its form submits. The runtime half — a native <form> in Chromium — is
// packages/showcase/tests/form-model.spec.ts.
describe('@model … { form }', () => {
    it('with a default: the default is the default, and the model is marked form', () => {
        const analysis = analyzeScript("@model value: string = '' { form };", 'field.pdx');
        expect(analysis.props).toEqual([expect.objectContaining({ name: 'value', tsType: 'string', default: "''", model: true, form: true })]);
        expect(analysis.warnings).toEqual([]);
    });

    it('without a default: the type is the type', () => {
        const analysis = analyzeScript('@model tags: string[] { form };', 'field.pdx');
        expect(analysis.props).toEqual([expect.objectContaining({ name: 'tags', tsType: 'string[]', model: true, form: true })]);
        expect(analysis.props[0].default).toBeUndefined();
    });

    it('control: a model without it is not marked, and an object default is left alone', () => {
        const analysis = analyzeScript("@model value: string = '';\n@model point: { x: number } = { x: 0 };", 'field.pdx');
        expect(analysis.props.map(p => [p.name, p.default, p.form])).toEqual([['value', "''", undefined], ['point', '{ x: 0 }', undefined]]);
    });

    for (const [name, opts] of Object.entries({ dev: {}, build: { production: true } })) {
        it(`goes into the descriptor with core's form wiring, imported — ${name}`, () => {
            const { code } = compile(sfc("@model value: string = '' { form };"), 'field.pdx', [], undefined, opts);
            expect(code).toMatch(/models: \{\s*value: \{ type: String, default: '', form: wireFormModel \}\s*\}/);
            expect(code).toMatch(/import \{[^}]*\bwireFormModel\b[^}]*\} from '@pdxui\/core'/);
        });
    }

    it('control: without { form } the wiring is not imported', () => {
        const { code } = compile(sfc("@model value: string = '';"), 'field.pdx', [], undefined, {});
        expect(code).not.toContain('wireFormModel');
    });
});
