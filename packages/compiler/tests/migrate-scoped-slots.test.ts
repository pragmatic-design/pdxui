// The scoped-slot forms and their rewrites (#492): `pdx migrate` turns each alpha form into the typed
// snippet that replaces it, and the compiler reports each as PDX_REMOVED_FORM. A script `@snippet`'s
// `${arg}` is not removed: it is valid beta that reads as text, so it stays a `changed` meaning.

import { describe, it, expect } from 'vitest';
import { scopedSlotParent, scopedSlotOutlet, scriptSnippetInterpolation, templatePropFlag, signatureParamNames } from '../src/language/scoped-slots';
import { outletSnippetParams, slotObjectForm } from '../src/language/scoped-slot-outlet';
import { languageChanges, type LanguageChangeContext } from '../src/language/changes';
import { ComponentResolver } from '../src/component-resolver';
import { compile } from '../src/plugin';

const SIGNATURES: Record<string, Record<string, string[]>> = {
    'pdx-list': { item: ['item', 'index'], empty: [] },
    'pdx-breadcrumb': { item: ['item', 'index', 'isLast'] },
    'pdx-data-grid': { cell: ['row', 'column', 'value'], detail: ['row'] },
};
const CONTEXT: LanguageChangeContext = {
    snippetParamsOf: (tag) => (SIGNATURES[tag] ? new Map(Object.entries(SIGNATURES[tag])) : null),
};

const fixParent = (text: string) => (scopedSlotParent.fix as (t: string, c?: LanguageChangeContext) => string)(text, CONTEXT);
const fixOutlet = (text: string) => (scopedSlotOutlet.fix as (t: string) => string)(text);
const fixObject = (text: string) => (slotObjectForm.fix as (t: string) => string)(text);
const errors = (src: string, file = 'm.pdx') => compile(src, file).warnings.filter((w) => w.severity === 'error');

describe('signatureParamNames', () => {
    it('reads the names of a signature, whatever their types hold', () => {
        expect(signatureParamNames('(item: T, index: number)')).toEqual(['item', 'index']);
        expect(signatureParamNames('(row: T, column: { field: string; [key: string]: unknown }, value: unknown, form: import(\'@pdxui/core\').Form<Record<string, unknown>> | null)'))
            .toEqual(['row', 'column', 'value', 'form']);
        expect(signatureParamNames('(column: C, apply: () => void, clear: () => void)')).toEqual(['column', 'apply', 'clear']);
        expect(signatureParamNames('()')).toEqual([]);
    });
});

describe('scoped-slot-parent: <slot let:> and @slot(), inside a component, become @snippet', () => {
    it('a let: slot becomes a @snippet with the child\'s parameters, in their order', () => {
        const src = '<template>\n  <pdx-list :items="u">\n    <slot name="item" let:index let:item>\n      {{ index }}. {{ item.name }}\n    </slot>\n  </pdx-list>\n</template>\n';
        expect(scopedSlotParent.detect(src, CONTEXT).map((f) => f.line)).toEqual([3]);
        expect(fixParent(src)).toBe('<template>\n  <pdx-list :items="u">\n    @snippet item(item, index) {\n      {{ index }}. {{ item.name }}\n    }\n  </pdx-list>\n</template>\n');
    });

    it('a parameter the slot did not take is still in its place, named so it shadows nothing', () => {
        const src = '<pdx-breadcrumb :items="c"><slot name="item" let:item let:isLast><b>{{ item.label }}{{ isLast }}</b></slot></pdx-breadcrumb>';
        expect(fixParent(src)).toBe('<pdx-breadcrumb :items="c">@snippet item(item, _index, isLast) {<b>{{ item.label }}{{ isLast }}</b>}</pdx-breadcrumb>');
    });

    it('the dummy let:_ is a snippet with no parameters; a body that starts with a brace is spaced off', () => {
        expect(fixParent('<pdx-list><slot name="empty" let:_><p>None</p></slot></pdx-list>')).toBe('<pdx-list>@snippet empty() {<p>None</p>}</pdx-list>');
        expect(fixParent('<pdx-list><slot name="item" let:item>{{ item }}</slot></pdx-list>')).toBe('<pdx-list>@snippet item(item) { {{ item }} }</pdx-list>');
    });

    it('the block form @slot(name, { … }) becomes a @snippet the same way', () => {
        const src = '<pdx-list :items="u">@slot(item, { index, item }) { <i>{{ index }}{{ item }}</i> }</pdx-list>';
        expect(fixParent(src)).toBe('<pdx-list :items="u">@snippet item(item, index) { <i>{{ index }}{{ item }}</i> }</pdx-list>');
    });

    it('flags, and leaves, what it cannot rewrite: a name that is no snippet, a key the signature lacks, a child it does not know', () => {
        const src = [
            '<pdx-data-grid :data="r"><slot name="col:name" let:row>{{ row.name }}</slot></pdx-data-grid>',
            '<pdx-data-grid :data="r"><slot name="detail" let:row let:id>{{ id }}</slot></pdx-data-grid>',
            '<app-other><slot name="row" let:item>{{ item }}</slot></app-other>',
            '<div><slot name="row" let:item>{{ item }}</slot></div>',
        ].join('\n');
        expect(fixParent(src)).toBe(src);
        const notes = scopedSlotParent.detect(src, CONTEXT).map((f) => [f.line, f.note]);
        expect(notes).toEqual([
            [1, expect.stringContaining('`col:name` is not a snippet name')],
            [2, expect.stringContaining('`id`')],
            [3, expect.stringContaining('`app-other`')],
            [4, expect.stringContaining('not directly inside a component')],
        ]);
    });

    it('the rewritten template compiles with no error', () => {
        const src = '<template>\n  <pdx-list :items="u">\n    <slot name="item" let:item let:index>{{ index }} {{ item }}</slot>\n  </pdx-list>\n</template>\n<script>\nlet u = $signal([\'a\']);\n</script>\n';
        expect(errors(fixParent(src))).toEqual([]);
    });

    it('control: a plain <slot> with no data, and escaped markup in a code sample, are not touched', () => {
        const src = '<app-card><slot name="footer"></slot></app-card><pre><code>&lt;slot name="item" let:item&gt;</code></pre>';
        expect(scopedSlotParent.detect(src, CONTEXT)).toEqual([]);
    });
});

describe('scoped-slot-outlet: a child\'s <slot :x> becomes @slot + @render', () => {
    it('with a fallback: @render name?.(args) @else { fallback }, and an optional @slot declared', () => {
        const src = '<template>\n  <ul>@for (items as it; track it) {<li><slot name="row" :item="it">{{ it }}</slot></li>}</ul>\n</template>\n<script>\n@prop items: string[] = [];\n</script>\n';
        const out = fixOutlet(src);
        expect(out).toContain('<li>@render row?.(it) @else { {{ it }} }</li>');
        expect(out).toContain('@slot row?: (item: unknown);');
        expect(scopedSlotOutlet.detect(out)).toEqual([]);
        expect(errors(out)).toEqual([]);
    });

    it('with no fallback: @render name?.(args), the parameters in the order the attributes give', () => {
        const out = fixOutlet('<template><slot name="row" :item="it" :row-index="i" /></template>\n<script>\nconst it = 1, i = 2;\n</script>\n');
        expect(out).toContain('@render row?.(it, i)');
        expect(out).toContain('@slot row?: (item: unknown, rowIndex: unknown);');
    });

    it('the alpha object form gives the types and the order, and is replaced', () => {
        const src = '<template><slot name="row" :index="i" :item="it"></slot></template>\n<script>\n@slot row: { item: User; index: number };\nconst it = 1, i = 2;\n</script>\n';
        const out = fixOutlet(src);
        expect(out).toContain('@slot row?: (item: User, index: number);');
        expect(out).not.toContain('@slot row: {');
        expect(out).toContain('@render row?.(it, i)');
    });

    it('a component with no script gets one', () => {
        expect(fixOutlet('<template><slot name="row" :item="x">-</slot></template>\n')).toContain('<script>\n@slot row?: (item: unknown);\n</script>');
    });

    it('flags, and leaves, an outlet whose slot already has a signature, or whose name is not an identifier', () => {
        const typed = '<template>@render row?.(x) @else {<slot name="row" :item="x">-</slot>}</template>\n<script>\n@slot row?: (item: string);\n</script>\n';
        expect(fixOutlet(typed)).toBe(typed);
        expect(scopedSlotOutlet.detect(typed)[0].note).toContain('already declares');
        const bad = '<template><slot name="col:a" :item="x"></slot></template>\n';
        expect(fixOutlet(bad)).toBe(bad);
    });

    it('the signatures the rewrite will declare: the object form\'s key order, else the first outlet\'s bindings', () => {
        const object = '<template><slot name="row" :index="i" :item="it"></slot></template>\n<script>\n@slot row: { item: User; index: number };\n</script>\n';
        expect(outletSnippetParams(object)?.get('row')).toEqual(['item', 'index']);
        expect(outletSnippetParams('<template><slot name="row" :row-index="i" :item="it"></slot></template>')?.get('row')).toEqual(['rowIndex', 'item']);
        expect(outletSnippetParams('<template><slot :item="it"></slot><slot name="footer"></slot></template>'), 'an outlet it cannot rewrite has no signature').toBeNull();
    });

    it('control: a plain <slot>, and a parent\'s let: slot, are not outlets', () => {
        expect(scopedSlotOutlet.detect('<template><slot name="footer"></slot><pdx-list><slot name="item" let:item>{{ item }}</slot></pdx-list></template>')).toEqual([]);
    });
});

describe('script-snippet-interpolation: a script @snippet body is a template', () => {
    const fix = (t: string) => (scriptSnippetInterpolation.fix as (x: string) => string)(t);

    const pdx = (script: string) => `<template><p>x</p></template>\n<script>\n${script}</script>\n`;

    it('${arg} becomes {{ arg }}, an expression with braces of its own included', () => {
        const script = '@snippet badge(label: string, n: number) {\n  <span class="b">${label}: ${fmt({ n })}</span>\n}\nconst x = `${1}`;\n';
        expect(scriptSnippetInterpolation.detect(pdx(script)).map((f) => [f.line, f.found])).toEqual([[4, '${label}'], [4, '${fmt({ n })}']]);
        expect(fix(pdx(script))).toBe(pdx('@snippet badge(label: string, n: number) {\n  <span class="b">{{ label }}: {{ fmt({ n }) }}</span>\n}\nconst x = `${1}`;\n'));
    });

    it('control: a snippet already in {{ }}, and a template literal outside a snippet, are not touched', () => {
        expect(scriptSnippetInterpolation.detect(pdx('@snippet a(x) { <b>{{ x }}</b> }\nconst y = `${x}`;\n'))).toEqual([]);
    });

    it('control: a @snippet outside the <script> — module text, or none — is not touched', () => {
        expect(scriptSnippetInterpolation.detect("const src = '@snippet a(x) { <b>${x}</b> }';\n")).toEqual([]);
    });
});

describe('template-prop: a template prop on a library component is flagged', () => {
    it('flags :item-template and :itemTemplate on a pdx- tag, and rewrites nothing', () => {
        const src = '<pdx-select :item-template="a" :selected-template="b"></pdx-select>\n<pdx-list :itemTemplate="c"></pdx-list>';
        expect(templatePropFlag.detect(src).map((f) => [f.line, f.found])).toEqual([[1, ':item-template="a"'], [1, ':selected-template="b"'], [2, ':itemTemplate="c"']]);
        expect(templatePropFlag.fix).toBe('flag');
    });

    it('control: an app tag, and a plain attribute named template, are not flagged', () => {
        expect(templatePropFlag.detect('<app-x :item-template="a"></app-x><pdx-list template="t"></pdx-list>')).toEqual([]);
    });
});

describe('slot-object-form: the alpha @slot name: { … } is a signature', () => {
    const fix = fixObject;
    const pdx = (script: string) => `<template><slot name="row"></slot></template>\n<script>\n${script}</script>\n`;

    it('an object type becomes an optional signature, its keys the parameters in their order', () => {
        const src = pdx('@prop n: number = 0;\n  @slot row: { item: User; index?: number };\n');
        expect(slotObjectForm.detect(src).map((f) => f.line)).toEqual([4]);
        expect(fix(src)).toBe(pdx('@prop n: number = 0;\n  @slot row?: (item: User, index: number);\n'));
        expect(slotObjectForm.detect(fix(src))).toEqual([]);
    });

    it('flags, and leaves, a type that is not an object literal', () => {
        const src = pdx('@slot row: RowScope;\n');
        expect(fix(src)).toBe(src);
        expect(slotObjectForm.detect(src)[0].note).toContain('signature');
    });

    it('control: a signature, a slot with no type, and the text of a .ts module are not touched', () => {
        expect(slotObjectForm.detect(pdx('@slot row?: (item: User);\n@slot footer;\n'))).toEqual([]);
        expect(slotObjectForm.detect("const src = '@slot row: { item: User };';\n")).toEqual([]);
    });
});

describe('the registry and the resolver', () => {
    it('the alpha forms are removed; a script snippet\'s ${} stays a changed meaning', () => {
        const byId = new Map(languageChanges().map((c) => [c.id, c]));
        for (const c of [scopedSlotParent, scopedSlotOutlet, slotObjectForm, templatePropFlag]) {
            expect(byId.get(c.id)?.kind, c.id).toBe('removed');
        }
        expect(byId.get(scriptSnippetInterpolation.id)?.kind).toBe('changed');
    });

    it('each removed form is PDX_REMOVED_FORM at its line, and its rewrite compiles with no error', () => {
        const removedAt = (src: string) => compile(src, 'm.pdx').warnings.filter((w) => w.code === 'PDX_REMOVED_FORM').map((w) => w.line);
        const parent = '<template>\n  <pdx-list :items="u">\n    <slot name="item" let:item>{{ item }}</slot>\n  </pdx-list>\n</template>\n<script>\nlet u = $signal([\'a\']);\n</script>\n';
        const block = '<template>\n  <pdx-list :items="u">\n    @slot(item, { item }) { {{ item }} }\n  </pdx-list>\n</template>\n<script>\nlet u = $signal([\'a\']);\n</script>\n';
        const outlet = '<template>\n  <slot name="row" :item="x">-</slot>\n</template>\n<script>\nconst x = 1;\n</script>\n';
        const object = '<template>\n  <slot name="row"></slot>\n</template>\n<script>\n@slot row: { item: string };\n</script>\n';
        const prop = '<template>\n  <pdx-select :item-template="t"></pdx-select>\n</template>\n<script>\nconst t = () => null;\n</script>\n';
        expect([removedAt(parent), removedAt(block), removedAt(outlet), removedAt(object), removedAt(prop)]).toEqual([[3], [3], [2], [5], [2]]);
        expect([errors(fixParent(parent)), errors(fixParent(block)), errors(fixOutlet(outlet)), errors(fixObject(object))]).toEqual([[], [], [], []]);
    });

    it('the resolver reads a library component\'s snippet parameters from its manifest', () => {
        const resolver = new ComponentResolver();
        expect(resolver.registerUiManifest()).toBe(true);
        expect(resolver.snippetParamsOf('pdx-list')?.get('item')).toEqual(['item', 'index']);
        expect(resolver.snippetParamsOf('pdx-data-grid')?.get('filterPopover')).toEqual(['column', 'apply', 'clear']);
        expect(resolver.snippetParamsOf('pdx-button')).toBeNull();
    });
});
