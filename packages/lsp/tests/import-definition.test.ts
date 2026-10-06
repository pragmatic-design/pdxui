// LSP — go-to-definition on a symbol IMPORTED from a local .ts module has to point at
// the LINE of the declaration in the target file, not at the start of the file.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { PdxTsService } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { tsDefinition } from '../src/capabilities/ts-features';

const TESTS_DIR = __dirname;
const ROOT = join(TESTS_DIR, '..', '..', '..');
// A virtual .pdx beside the fixtures, so that `./fixtures/helpers` resolves.
const URI = 'file:///' + join(TESTS_DIR, 'x.pdx').split('\\').join('/');
const svc = new PdxTsService(ROOT);

// scriptStart=0 → the script offsets are 1:1 in the virtual file.
const vfOf = (script: string) => buildVirtualFile(script, 0, [], '', -1);

describe('go-to-definition on a local import', () => {
    it('makeUser → the line of the function in the target file (not 0)', () => {
        const script = "\nimport { makeUser } from './fixtures/helpers';\nconst u = makeUser('a');\n";
        const off = script.lastIndexOf('makeUser'); // the use, not the import
        const locs = tsDefinition(svc, URI, vfOf(script), off, script);
        expect(locs.length).toBeGreaterThan(0);
        expect(locs[0].uri).toMatch(/helpers\.ts$/);
        // makeUser is declared on line 2 (0-based) in helpers.ts
        expect(locs[0].range.start.line).toBe(2);
    });

    it('greeting → the line of the const in the target file (not 0)', () => {
        const script = "\nimport { greeting } from './fixtures/helpers';\nconst g = greeting;\n";
        const off = script.lastIndexOf('greeting');
        const locs = tsDefinition(svc, URI, vfOf(script), off, script);
        expect(locs.length).toBeGreaterThan(0);
        expect(locs[0].uri).toMatch(/helpers\.ts$/);
        expect(locs[0].range.start.line).toBe(0); // greeting is on line 0
        expect(locs[0].range.start.character).toBeGreaterThan(0); // but not column 0 (it points at the name)
    });
});
