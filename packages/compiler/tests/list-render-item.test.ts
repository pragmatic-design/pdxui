// `pdx-list`'s `renderItem` callback is removed (#292): an item is drawn by the `item` snippet or slot.
// `pdx migrate` flags a `render-item` on a `<pdx-list>` — a callback is code, and its markup has to be
// moved into the slot by a person — and in a .pdx it is PDX_REMOVED_FORM.

import { describe, it, expect } from 'vitest';
import { listRenderItem } from '../src/language/list-render-item';
import { languageChanges } from '../src/language/changes';
import { compile } from '../src/plugin';

describe('list-render-item', () => {
    it('flags render-item on a pdx-list, bound or not, at its line, and rewrites nothing', () => {
        const source = '<template>\n  <pdx-list :items="u" :render-item="row"></pdx-list>\n  <pdx-list :renderItem="row" dividers></pdx-list>\n</template>';
        expect(listRenderItem.detect(source).map((f) => [f.line, f.found])).toEqual([[2, ':render-item="row"'], [3, ':renderItem="row"']]);
        expect(listRenderItem.fix).toBe('flag');
    });

    it('control: the item slot, and render-item on another tag, are not reported', () => {
        expect(listRenderItem.detect('<pdx-list :items="u"><slot name="item" let:item>{{ item.name }}</slot></pdx-list>')).toEqual([]);
        expect(listRenderItem.detect('<other-list :render-item="row"></other-list>')).toEqual([]);
    });

    it('is PDX_REMOVED_FORM in a .pdx, naming the item slot', () => {
        const r = compile('<template>\n  <pdx-list :render-item="row"></pdx-list>\n</template>\n<script>\nfunction row() { return \'\'; }\n</script>\n', 'f.pdx');
        const removed = r.warnings.filter((w) => w.code === 'PDX_REMOVED_FORM');
        expect(removed).toHaveLength(1);
        expect(removed[0].line).toBe(2);
        expect(removed[0].message).toContain('`item`');
    });

    it('is registered', () => {
        expect(languageChanges().map((c) => c.id)).toContain(listRenderItem.id);
    });
});
