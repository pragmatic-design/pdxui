// What a .pdx component declares, with its documentation (#1003): what a generator reads to describe
// it as the library's manifest describes a TypeScript component().
//
// The component's own JSDoc is the first `/** … */` of the script, before any declaration or import
// (owner, 2026-11-10). A `/** … */` directly above a declaration describes that declaration.

import { describe, it, expect } from 'vitest';
import { describeComponent, scriptDocComments } from '../src/index';

const pdx = (script: string, template = '<p>x</p>') => `<template>${template}</template>\n<script>\n${script}\n</script>`;

describe('scriptDocComments', () => {
    it('the first block before any code is the component\'s', () => {
        const docs = scriptDocComments("/**\n * A thing.\n * @summary Short.\n */\nimport { a } from 'a';\n@prop x: string = '';");
        expect(docs.component).toBe('/**\n * A thing.\n * @summary Short.\n */');
        expect(docs.declarations).toEqual([]);
    });

    it('a block directly above a declaration is that declaration\'s, of each kind', () => {
        const script = [
            '/** The component. */',
            "/** The label. */\n@prop label: string = '';",
            '/** The value. */\n@model value: string = \'\' { form };',
            "/** Opened. */\n@event 'open-change': { value: boolean };",
            '/** Picked. */\n@event(bubbles) picked: string;',
            '/** A row. */\n@slot row?: (item: T) => Node;',
            '/** Busy. */\n@state busy = loading;',
            "/** The size. */\n@variants { size: { md: '.x-md', sm: '.x-sm' } = md; }",
            '/** Focus it. */\nfunction focus() {}',
            '/** Async. */\nasync function load() {}',
            '/** The item. */\nconst item = $derived(1);',
        ].join('\n');
        expect(scriptDocComments(script).declarations).toEqual([
            { kind: 'prop', name: 'label', doc: '/** The label. */' },
            { kind: 'model', name: 'value', doc: '/** The value. */' },
            { kind: 'event', name: 'open-change', doc: '/** Opened. */' },
            { kind: 'event', name: 'picked', doc: '/** Picked. */' },
            { kind: 'slot', name: 'row', doc: '/** A row. */' },
            { kind: 'state', name: 'busy', doc: '/** Busy. */' },
            { kind: 'variant', name: 'size', doc: '/** The size. */' },
            { kind: 'declaration', name: 'focus', doc: '/** Focus it. */' },
            { kind: 'declaration', name: 'load', doc: '/** Async. */' },
            { kind: 'declaration', name: 'item', doc: '/** The item. */' },
        ]);
    });

    it('a line comment between the block and the declaration does not detach it, as in TypeScript', () => {
        const docs = scriptDocComments("import x from 'x';\n/** Parts. */\n// pdx-ignore X: why\n@prop a: string = '';");
        expect(docs.declarations).toEqual([{ kind: 'prop', name: 'a', doc: '/** Parts. */' }]);
    });

    it('the controls: a plain block comment, a block inside a string, and code in between describe nothing', () => {
        const script = [
            "import x from 'x';",
            "/* not a doc */\n@prop a: string = '';",
            "const s = '/** in a string */';\n@prop b: string = '';",
            "/** Lost. */\nlet n = 1; @prop c: string = '';",
        ].join('\n');
        expect(scriptDocComments(script)).toEqual({ declarations: [{ kind: 'declaration', name: 'n', doc: '/** Lost. */' }] });
    });

    it('with no block before the first code, the component has no doc', () => {
        expect(scriptDocComments("import x from 'x';\n/** The label. */\n@prop label: string = '';").component).toBeUndefined();
    });
});

describe('describeComponent', () => {
    it('the tag, the analysis, the template and the docs of one file', () => {
        const d = describeComponent(pdx("/** A switch. */\nimport { a } from 'a';\n/** On. */\n@model checked: boolean = false;", '<input role="switch">'), 'pilot/switch.pdx', { prefix: 'pdx' });
        expect(d.tag).toBe('pdx-switch');
        expect(d.analysis.props.map((p) => p.name)).toEqual(['checked']);
        expect(d.template).toContain('role="switch"');
        expect(d.docs.component).toBe('/** A switch. */');
        expect(d.docs.declarations).toEqual([{ kind: 'model', name: 'checked', doc: '/** On. */' }]);
    });

    it('a library file named pdx-x.pdx is <pdx-x>, and @tag wins over the file name', () => {
        expect(describeComponent(pdx(''), 'src/switch/pdx-switch.pdx', { prefix: 'pdx' }).tag).toBe('pdx-switch');
        expect(describeComponent(pdx("@tag 'pdx-toggle';"), 'src/switch/pdx-switch.pdx', { prefix: 'pdx' }).tag).toBe('pdx-toggle');
    });
});
