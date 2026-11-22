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
});
