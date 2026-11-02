// `pdx-list`'s `renderItem` callback is removed (#292): an item is drawn by the `item` snippet or the
// scoped slot. The callback is code, and the markup it returned has to move into the slot by hand, so
// `pdx migrate` flags each `render-item` on a `<pdx-list>` and rewrites nothing.

import type { LanguageChange, LanguageChangeFinding } from './changes';

// Match: the opening tag of a pdx-list, quoted values read whole. Groups: [1]=its attributes
const LIST_TAG = /<pdx-list(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
// Match: a render-item attribute, static or bound, kebab or camel case, with its value.
const RENDER_ITEM = /(?<=\s):{0,2}render(?:-i|I)tem(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>/]+))?/;

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

export const listRenderItem: LanguageChange = {
    id: 'list-render-item',
    kind: 'removed',
    scope: 'pdx',
    issue: 292,
    message: '`pdx-list` has no `renderItem`: draw an item with the `item` snippet or the scoped slot, `<slot name="item" let:item>…</slot>`.',
    marker: /<pdx-list(?=[\s/>])/i,
    detect(text): LanguageChangeFinding[] {
        const out: LanguageChangeFinding[] = [];
        for (const m of text.matchAll(LIST_TAG)) {
            const attr = RENDER_ITEM.exec(m[1]);
            if (attr) out.push({ line: lineAt(text, m.index + '<pdx-list'.length + attr.index), found: attr[0] });
        }
        return out;
    },
    fix: 'flag',
};
