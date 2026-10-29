// `getValue()` and `setValue()` duplicated a picker's model and are removed (#287): the model is the
// way, `el.value`. `pdx migrate` rewrites `getValue()` on a `:ref` bound on such a picker in the same
// file to `.value`; `setValue(v)` is flagged — it turned anything but an array into `[]`, which `.value = v`
// does not — and so is either call on a lookup of the tag.

import { describe, it, expect } from 'vitest';
import { modelGetValue, modelSetValue, modelMethodsUnbound, MODEL_METHOD_TAGS } from '../src/language/model-methods';
import { languageChanges } from '../src/language/changes';
import { compile } from '../src/plugin';

const fix = modelGetValue.fix as (text: string) => string;

describe('model-get-value: getValue() on a ref\'d picker is its model', () => {
    it('a call in the template and in the script, plain and optional', () => {
        const source = '<template><pdx-cascader :ref="cas"></pdx-cascader><p>{{ cas.getValue() }}</p></template>\n<script>\nlet cas = $signal(null);\nfunction path() { return cas?.getValue(); }\n</script>';
        const out = fix(source);
        expect(out).toContain('{{ cas.value }}');
        expect(out).toContain('return cas?.value;');
        expect(modelGetValue.detect(out)).toEqual([]);
        expect(fix(out)).toBe(out);
    });

    it('a ref on another component is left', () => {
        const source = '<template><pdx-input :ref="inp"></pdx-input></template>\n<script>\nfunction f() { return inp.getValue(); }\n</script>';
        expect(modelGetValue.detect(source)).toEqual([]);
        expect(fix(source)).toBe(source);
    });

    it('holds the pickers the issue names that have moved: pdx-cascader, pdx-tree-select', () => {
        expect([...MODEL_METHOD_TAGS].sort()).toEqual(['pdx-cascader', 'pdx-tree-select']);
    });

    it('a ref on a pdx-tree-select', () => {
        expect(fix('<template><pdx-tree-select :ref="t"></pdx-tree-select><p>{{ t.getValue() }}</p></template>'))
            .toBe('<template><pdx-tree-select :ref="t"></pdx-tree-select><p>{{ t.value }}</p></template>');
    });
});

describe('model-set-value: setValue(v) is flagged', () => {
    it('on a ref\'d picker, naming `.value =`', () => {
        const source = '<template><pdx-cascader :ref="cas"></pdx-cascader><button @click="cas.setValue([\'it\'])">x</button></template>';
        const found = modelSetValue.detect(source);
        expect(found).toHaveLength(1);
        expect(found[0].note).toContain('cas.value =');
        expect(modelSetValue.fix).toBe('flag');
    });
});

describe('model-methods-unbound: a lookup of the tag is flagged', () => {
    it('`document.querySelector(\'pdx-cascader\').getValue()`', () => {
        expect(modelMethodsUnbound.detect("document.querySelector('pdx-cascader').getValue();")).toHaveLength(1);
        expect(modelMethodsUnbound.detect("document.querySelector('pdx-input').getValue();")).toEqual([]);
    });
});

describe('the registry and the compiler', () => {
    it('holds the three entries, each removed, for #287', () => {
        for (const id of ['model-get-value', 'model-set-value', 'model-methods-unbound']) {
            const entry = languageChanges().find((c) => c.id === id);
            expect(entry?.kind, id).toBe('removed');
            expect(entry?.issue).toBe(287);
        }
    });

    it('`cas.getValue()` on a pdx-cascader is PDX_REMOVED_FORM', () => {
        const r = compile('<template>\n  <pdx-cascader :ref="cas"></pdx-cascader>\n  <p>{{ cas.getValue() }}</p>\n</template>\n<script>\nlet cas = $signal(null);\n</script>\n', 'f.pdx');
        expect(r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM').map((w) => w.line)).toEqual([3]);
    });
});
