// A .pdx under src/ is public by its name (`pdx-*`), or internal by its script (`@internal;`, #1102). One that
// is neither would drop out of custom-elements.json — and with it the exports, the site and the skill —
// without anything saying so: the generator refuses it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { undeclaredPdxFiles, buildManifest } from '../../scripts/gen-manifest.mjs';

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
