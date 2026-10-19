// A save that changes only a `<style>` block swaps the style in the open page; it does not re-render
// the component (#246). Re-rendering rebuilt the elements: focus, scroll and anything typed into an
// unbound input were lost for a colour change.
//
// The plugin keeps the source each `.pdx` was last compiled from. When the new source differs only
// inside its style blocks, it sends `pdx:style` with each changed block's element id and new CSS, and
// returns no modules, so Vite runs no module update. Anything else is a full update, as before.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pdx } from '../src/plugin';
import { styleOnlyUpdate } from '../src/hmr-style';
import { hash } from '../src/compiler/codegen-styles';

const PAGE = `<template>
  <p class="note">{{ text }}</p>
</template>

<script setup>
let text = $signal('hello');
</script>

<style scoped>
.note { color: red; }
</style>
`;

const FILE = '/app/src/pages/note.pdx';

describe('styleOnlyUpdate: which saves are a style swap', () => {
    it('a change inside <style scoped> only: the block\'s element id and its new scoped CSS', () => {
        const swaps = styleOnlyUpdate(PAGE, PAGE.replace('color: red', 'color: blue'), FILE);
        expect(swaps).toEqual([{ id: `pdx-s-${hash(FILE)}`, css: expect.stringContaining('color: blue') }]);
        // As the compile scopes it on the default target: the donut scope (#152).
        expect(swaps![0].css, 'the CSS is scoped as the compile scopes it').toContain(`@scope ([data-pdx-${hash(FILE)}], [data-pdx-${hash(FILE)}-in])`);
        expect(swaps![0].css).toContain('.note');
    });

    it('scopes the swap for the target the plugin compiles for', () => {
        const swaps = styleOnlyUpdate(PAGE, PAGE.replace('color: red', 'color: blue'), FILE, 'baseline-2024');
        expect(swaps![0].css, 'a baseline-2024 app got the donut in its swap').toContain(`[data-pdx-${hash(FILE)}] .note`);
    });

    it('names only the blocks that changed, the second by its index', () => {
        const two = PAGE + '\n<style>\nbody { margin: 0; }\n</style>\n';
        const swaps = styleOnlyUpdate(two, two.replace('margin: 0', 'margin: 4px'), FILE);
        expect(swaps).toEqual([{ id: `pdx-s-${hash(FILE)}-1`, css: expect.stringContaining('margin: 4px') }]);
    });

    it('nothing changed: no swap, and no full update either', () => {
        expect(styleOnlyUpdate(PAGE, PAGE, FILE)).toEqual([]);
    });

    for (const [what, next] of [
        ['the template', PAGE.replace('{{ text }}', '{{ text }}!')],
        ['the script', PAGE.replace("'hello'", "'hi'")],
        ['a block made scoped or unscoped', PAGE.replace('<style scoped>', '<style>')],
        ['a block added', PAGE + '\n<style>\nbody { margin: 0; }\n</style>\n'],
        ['a new bind() name, which changes the setup', PAGE.replace('color: red', 'color: bind(text)')],
    ] as const) {
        it(`a change to ${what} is a full update`, () => {
            expect(styleOnlyUpdate(PAGE, next, FILE)).toBeNull();
        });
    }

    it('a shadow component, whose CSS is adopted in its setup, is a full update', () => {
        const shadow = PAGE.replace('<template>', '<template shadow>');
        expect(styleOnlyUpdate(shadow, shadow.replace('color: red', 'color: blue'), FILE)).toBeNull();
    });
});

describe('the plugin on the dev server', () => {
    let root: string | null = null;
    afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = null; });

    /** A plugin in serve mode that has compiled PAGE once, and a recording slice of the dev server. */
    function served() {
        root = mkdtempSync(join(tmpdir(), 'pdx-hmr-style-'));
        mkdirSync(join(root, 'src', 'pages'), { recursive: true });
        const [plugin] = pdx();
        (plugin.config as (c: object, e: { command: string }) => void)({}, { command: 'serve' });
        (plugin.configResolved as (c: { root: string; server: { fs: { allow: string[] } } }) => void)(
            { root, server: { fs: { allow: [] } } });
        const id = join(root, 'src', 'pages', 'note.pdx').replace(/\\/g, '/');
        const transform = plugin.transform as (this: { error(m: string): never }, code: string, id: string) => { code: string };
        const code = transform.call({ error(m: string): never { throw new Error(m); } }, PAGE, id).code;
        const sent: { type: string; event?: string; data?: unknown }[] = [];
        const invalidated: string[] = [];
        const module = { id };
        const server = {
            ws: { send(payload: { type: string; event?: string; data?: unknown }) { sent.push(payload); } },
            moduleGraph: {
                getModuleById: (i: string) => (i === id ? module : undefined),
                invalidateModule(m: { id: string }) { invalidated.push(m.id); },
            },
        };
        const hot = plugin.handleHotUpdate as (ctx: unknown) => Promise<unknown[] | void> | unknown[] | void;
        const update = (next: string) => hot({ file: id, modules: [module], read: async () => next, server });
        return { id, code, sent, invalidated, update };
    }

    it('a style-only save sends pdx:style and runs no module update', async () => {
        const s = served();
        const result = await s.update(PAGE.replace('color: red', 'color: blue'));
        expect(result, 'no modules: Vite runs no update').toEqual([]);
        expect(s.sent).toEqual([{
            type: 'custom',
            event: 'pdx:style',
            data: { styles: [{ id: `pdx-s-${hash(s.id)}`, css: expect.stringContaining('color: blue') }] },
        }]);
        // The cached module still holds the old CSS: a reload must compile it again.
        expect(s.invalidated).toEqual([s.id]);
    });

    it('a template save is the full update it always was', async () => {
        const s = served();
        const result = await s.update(PAGE.replace('{{ text }}', '{{ text }}!'));
        expect(result, 'left to Vite: the module is updated').toBeUndefined();
        expect(s.sent.filter((p) => p.event === 'pdx:style')).toEqual([]);
        expect(s.invalidated).toEqual([s.id]);
    });

    it('a second style save is compared with the first, not with the compile', async () => {
        const s = served();
        const blue = PAGE.replace('color: red', 'color: blue');
        await s.update(blue);
        await s.update(blue.replace('color: blue', 'color: green'));
        expect(s.sent.at(-1)).toMatchObject({ event: 'pdx:style', data: { styles: [{ css: expect.stringContaining('color: green') }] } });
    });

    it('the module listens for pdx:style and writes the CSS into the element with that id', () => {
        const s = served();
        expect(s.code).toContain("import.meta.hot.on('pdx:style'");
    });
});
