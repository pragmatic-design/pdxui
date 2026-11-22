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

    it('the library has none, and its manifest builds', () => {
        expect(() => buildManifest()).not.toThrow();
    });
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

describe('the roles a module beside the component draws (#1210)', () => {
    // pdx-form-template builds its fields in form-template-fields.ts, which sets role="group" on a group:
    // the role is rendered by the component, wherever its builder lives.
    it('are its own, through the modules that module imports in turn', () => {
        write('x/pdx-x.pdx', '<template><div></div></template>\n<script>\nimport { build } from \'./x-build\';\nbuild();\n</script>');
        write('x/x-build.ts', "import { row } from './x-row';\nexport function build() { const el = document.createElement('div'); el.setAttribute('role', 'group'); row(el); }\n");
        write('x/x-row.ts', "export function row(el: HTMLElement) { el.setAttribute('role', 'row'); }\n");
        const file = join(root, 'x/pdx-x.pdx');
        const [mod] = analyzePdxFile(file, readFileSync(file, 'utf-8'), {});
        expect(mod.declarations[0].roles).toEqual(['group', 'row']);
    });

    it('the control: a package import is not read, nor a role only in a comment of the module', () => {
        write('x/pdx-x.pdx', '<template><div></div></template>\n<script>\nimport { signal } from \'@pdxui/core\';\nimport { build } from \'./x-build\';\nbuild(signal);\n</script>');
        write('x/x-build.ts', "// it once set role=\"note\" here\nexport function build(_s: unknown) {}\n");
        const file = join(root, 'x/pdx-x.pdx');
        const [mod] = analyzePdxFile(file, readFileSync(file, 'utf-8'), {});
        expect(mod.declarations[0].roles ?? []).toEqual([]);
    });
});
