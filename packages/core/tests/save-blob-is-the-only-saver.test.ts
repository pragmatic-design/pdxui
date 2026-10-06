// One place in the library turns a Blob into a saved file.
//
// The anchor/object-URL dance lives in `saveBlob` alone. A second copy is where
// `revokeObjectURL` gets dropped — the blob then stays alive for the life of the document, which no
// test would ever notice.
//
// The guard is shaped like the defect: a file that sets an anchor's `download` is saving a file, and
// only `saveBlob` may. It fails the moment someone writes the eight lines again instead of calling
// it, which is the only moment worth failing at.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = join(__dirname, '..', '..');

/** The one implementation, by path. Anything else that saves a file is a copy of it. */
const THE_SAVER = 'core/src/http/upload.ts';

function sources(): string[] {
    return globSync('{core,ui,router,design}/src/**/*.ts', { cwd: ROOT })
        .map((p) => p.split('\\').join('/'));
}

describe('saveBlob is the only thing that saves a file', () => {
    it('scans a source tree that is actually there', () => {
        const files = sources();
        // About 365 files. The floor is well under that and well over zero: the failure
        // this catches is a glob that stops matching, which makes every check below vacuously green.
        expect(files.length, 'the glob found almost nothing — the guard would pass on nothing').toBeGreaterThan(300);
        expect(files).toContain(THE_SAVER);
        for (const pkg of ['core', 'ui', 'router', 'design']) {
            expect(files.some((f) => f.startsWith(`${pkg}/src/`)), `${pkg} contributed no file to the scan`).toBe(true);
        }
    });

    it('no other file sets an anchor download attribute', () => {
        const offenders = sources().filter((rel) => {
            if (rel === THE_SAVER) return false;
            return /\.download\s*=/.test(readFileSync(join(ROOT, rel), 'utf8'));
        });
        expect(offenders, `these save a file themselves instead of calling saveBlob: ${offenders.join(', ')}`).toEqual([]);
    });

    it('the chart exports its PNG through saveBlob', () => {
        const src = readFileSync(join(ROOT, 'ui/src/chart/core/export.ts'), 'utf8');
        expect(src).toContain('saveBlob');
        expect(src, 'the chart kept its own copy of the object-URL dance').not.toContain('createObjectURL');
    });

    it('the one implementation revokes the URL it created', () => {
        const src = readFileSync(join(ROOT, THE_SAVER), 'utf8');
        expect(src).toContain('URL.revokeObjectURL');
    });
});

describe('the saver is reachable', () => {
    it('saveBlob is exported from the package barrel', () => {
        const barrel = readFileSync(join(ROOT, 'core/src/index.ts'), 'utf8');
        expect(barrel, 'a helper nobody can import is still boilerplate for everyone').toMatch(/\bsaveBlob\b/);
    });
});
