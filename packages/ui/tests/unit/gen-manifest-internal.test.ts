// A .pdx under src/ is public by its name (`pdx-*`), or internal by its script (`@internal;`, #1102). One that
// is neither would drop out of custom-elements.json — and with it the exports, the site and the skill —
// without anything saying so: the generator refuses it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { undeclaredPdxFiles, buildManifest } from '../../scripts/gen-manifest.mjs';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { analyzePdxFile } from '../../scripts/manifest-pdx.mjs';

let root: string;
const write = (rel: string, content: string) => {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
};

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-undeclared-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('a .pdx that is neither public nor internal', () => {
    it('is found, wherever it is under src', () => {
        write('x/pdx-x.pdx', '<template><p></p></template>');
        write('x/helper.pdx', '<template><p></p></template>\n<script>\n@prop a: string = \'\';\n</script>');
        expect((undeclaredPdxFiles(root) as string[]).map((f) => f.replace(/\\/g, '/'))).toEqual([join(root, 'x/helper.pdx').replace(/\\/g, '/')]);
    });

    it('is no longer one once its script declares @internal', () => {
        write('x/helper.pdx', '<template><p></p></template>\n<script>\n@internal;\n</script>');
        expect(undeclaredPdxFiles(root)).toEqual([]);
    });

    // A whole-library build: ~1.3 s alone, 5.1 s in a pre-push beside the other suites (#1313).
    // The same ceiling as the one in manifest-component-tokens.test.ts (#539); it is no speed check.
    it('the library has none, and its manifest builds', () => {
        expect(() => buildManifest()).not.toThrow();
    }, 60_000);
});

describe('the roles an @internal view draws', () => {
    it('are its owner\'s, through the views it imports in turn', () => {
        write('x/pdx-x.pdx', '<template><div role="grid"><x-view></x-view></div></template>\n<script>\nimport \'./x-view.pdx\';\n</script>');
        write('x/x-view.pdx', '<template><div role="rowgroup"><x-row></x-row></div></template>\n<script>\n@internal;\nimport \'./x-row.pdx\';\n</script>');
        write('x/x-row.pdx', '<template><div role="row"></div></template>\n<script>\n@internal;\n</script>');
        const file = join(root, 'x/pdx-x.pdx');
        const [mod] = analyzePdxFile(file, readFileSync(file, 'utf-8'), {});
        const roles = mod.declarations[0].roles as string[];
        expect(roles).toEqual(expect.arrayContaining(['grid', 'rowgroup', 'row']));
    });
});

// A role the script writes is the component's as much as one its template draws. The analysis takes the
// `$effect`s out of the script's body, and a role set in one was not read: pdx-inline-edit builds its
// display in script and names it a button in the effect that redraws it (#1210).
describe('the roles a .pdx script writes', () => {
    it('are read inside a $effect, as in the body', () => {
        write('y/pdx-y.pdx', [
            '<template></template>',
            '<script>',
            '@host el;',
            "$effect(() => { el.setAttribute('role', 'button'); });",
            "el.setAttribute('aria-roledescription', 'x');",
            "function f(n: HTMLElement) { n.setAttribute('role', 'note'); }",
            '</script>',
        ].join('\n'));
        const file = join(root, 'y/pdx-y.pdx');
        const [mod] = analyzePdxFile(file, readFileSync(file, 'utf-8'), {});
        expect((mod.declarations[0].roles as string[]).sort()).toEqual(['button', 'note']);
    });

    // A comment is not a rendered role, in a $effect as in the body: pdx-calendar's structure
    // effect says why its frame is a group, quoting a role it does not draw, and the manifest published
    // `application` as a role the calendar draws (#1425).
    it('are not read from a comment inside a $effect', () => {
        write('c/pdx-c.pdx', [
            '<template></template>',
            '<script>',
            '@host el;',
            '$effect(() => {',
            '  // A group, not role="application", which switches browse mode off.',
            '  /* Nor role="note", in a block comment. */',
            "  el.setAttribute('role', 'group');",
            '});',
            '</script>',
        ].join('\n'));
        const file = join(root, 'c/pdx-c.pdx');
        const [mod] = analyzePdxFile(file, readFileSync(file, 'utf-8'), {});
        expect((mod.declarations[0].roles as string[]).sort()).toEqual(['group']);
    });

    // `@host { role="x" }` is where a .pdx names its host's role; the analysis takes it out of the
    // body, so the manifest lost every one: pdx-sparkline's `img`, pdx-button-group's `group`,
    // pdx-radio-group's `radiogroup` (#1397). A bound `:role` is read as the template's is.
    it('are read on @host, static or bound', () => {
        write('h/pdx-h.pdx', [
            '<template><slot></slot></template>',
            '<script>',
            '@prop mode: string = \'a\';',
            '@host el {',
            '  role="toolbar"',
            '}',
            '</script>',
        ].join('\n'));
        write('k/pdx-k.pdx', [
            '<template><slot></slot></template>',
            '<script>',
            '@prop single: boolean = false;',
            '@host el { :role="single ? \'radiogroup\' : \'group\'" }',
            '</script>',
        ].join('\n'));
        const roles = (rel: string) => {
            const file = join(root, rel);
            return (analyzePdxFile(file, readFileSync(file, 'utf-8'), {})[0].declarations[0].roles as string[]).sort();
        };
        expect(roles('h/pdx-h.pdx')).toEqual(['toolbar']);
        expect(roles('k/pdx-k.pdx')).toEqual(['group', 'radiogroup']);
    });

    // A script `@snippet` is a template the component renders with `@render`; the analysis takes it
    // out of the body, and its roles were lost: pdx-command draws each option in one (#1210, #1412).
    it('are read in a script @snippet, as in the template', () => {
        write('s/pdx-s.pdx', [
            '<template><div role="listbox">@render optionRow(\'a\')</div></template>',
            '<script>',
            '@snippet optionRow(label: string) { <div role="option">{{ label }}</div> }',
            '</script>',
        ].join('\n'));
        const file = join(root, 's/pdx-s.pdx');
        const [mod] = analyzePdxFile(file, readFileSync(file, 'utf-8'), {});
        expect((mod.declarations[0].roles as string[]).sort()).toEqual(['listbox', 'option']);
    });
});

// A module beside the component is part of it, as gen-manifest reads a TypeScript component's: the
// roles and contexts of the code it moved there are the component's. pdx-json-editor's sub-modal
// is a role="dialog" built in json-editor-fields.ts (#1210), and the manifest lost it.
describe('the TypeScript modules in a .pdx component\'s folder', () => {
    it('give it the roles they write and the contexts they read', () => {
        write('w/pdx-w.pdx', '<template></template>\n<script>\nimport { openPanel } from \'./w-panel\';\n</script>');
        write('w/w-panel.ts', [
            "import { inject } from '@pdxui/core';",
            'export function openPanel(host: HTMLElement): void {',
            "    const box = document.createElement('div');",
            "    box.setAttribute('role', 'dialog');",
            '    inject(PanelContext, host, null);',
            '}',
        ].join('\n'));
        const file = join(root, 'w/pdx-w.pdx');
        const [mod] = analyzePdxFile(file, readFileSync(file, 'utf-8'), {});
        expect(mod.declarations[0].roles).toEqual(['dialog']);
        expect(mod.declarations[0]['x-pdx-context']).toEqual({ injects: [{ token: 'PanelContext', optional: true }] });
    });

    it('a .d.ts beside it, and another component\'s file, are not', () => {
        write('v/pdx-v.pdx', '<template></template>\n<script>\n</script>');
        write('v/pdx-v.pdx.d.ts', "declare const x: 'role=\"alert\"';");
        write('v/pdx-other.ts', "document.body.setAttribute('role', 'alert');");
        const file = join(root, 'v/pdx-v.pdx');
        const [mod] = analyzePdxFile(file, readFileSync(file, 'utf-8'), {});
        expect(mod.declarations[0].roles).toBeUndefined();
    });
});

// `@prop(icon)` (#1317) is the .pdx form of `prop('inbox', { iconName: true })`: the manifest says the
// prop names an icon, and the compiler imports the icon a consumer writes in it (icon-imports.ts).
describe('a .pdx prop that names an icon', () => {
    it('is iconName in the manifest, and a plain prop beside it is not', () => {
        write('z/pdx-z.pdx', [
            '<template><p>{{ emptyIcon }} {{ label }}</p></template>',
            '<script>',
            "@prop(icon) emptyIcon: string = 'inbox';",
            "@prop label: string = '';",
            '</script>',
        ].join('\n'));
        const file = join(root, 'z/pdx-z.pdx');
        const [mod] = analyzePdxFile(file, readFileSync(file, 'utf-8'), {});
        const members = mod.declarations[0].members as { name: string; iconName?: boolean; type: { text: string }; default?: string }[];
        expect(members.find(m => m.name === 'emptyIcon')).toEqual(expect.objectContaining({ iconName: true, type: { text: 'string' }, default: "'inbox'" }));
        expect(members.find(m => m.name === 'label')).not.toHaveProperty('iconName');
    });
});
