// The seam only works if it is the ONLY door.
//
// `packages/router/src/active.ts` is where a production build installs its route table (#108). A
// file in this package that imports `./runtime` directly could be evaluated before the seam, and
// read `routeTable()` before anything installed it: an outlet that starts the router with no routes.
// Nothing fails; the app simply answers 404 in a production build only.
//
// So the seam is asserted on the SHAPE of the package rather than on a behaviour.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');
const SEAM = 'active.ts';
/** The implementations. Only the seam may name one. */
const IMPLEMENTATIONS = /from\s+'\.\/(runtime|active)'/g;

function sources(): { file: string; text: string }[] {
    return readdirSync(SRC)
        .filter(f => f.endsWith('.ts'))
        .map(file => ({ file, text: readFileSync(join(SRC, file), 'utf-8') }));
}

describe('every router import in this package goes through the seam', () => {
    const files = sources();

    it('read the package, not an empty directory', () => {
        // Without this the assertion below passes on a scan that found nothing.
        expect(files.length).toBeGreaterThan(3);
        expect(files.map(f => f.file)).toContain(SEAM);
    });

    it('no file but the seam imports an implementation directly', () => {
        const offenders = files
            .filter(f => f.file !== SEAM)
            .flatMap(f => [...f.text.matchAll(IMPLEMENTATIONS)]
                .filter(m => m[1] === 'runtime')
                .map(() => f.file));

        expect([...new Set(offenders)],
            'these bypass the seam, where a production build installs the route table',
        ).toEqual([]);
    });

    it('the seam does name one — otherwise there is nothing to swap', () => {
        // The control. "No file imports ./runtime" is satisfied perfectly by a package that imports
        // no router at all, which is not what this asserts.
        const seam = files.find(f => f.file === SEAM)!;

        expect(seam.text).toMatch(/from\s+'\.\/runtime'/);
    });

    it('the package entry re-exports from the seam, so a component gets the running router', () => {
        // `@pdxui/router` is what a compiled component imports. If index.ts re-exported ./runtime,
        // an app that imported only from the package would never evaluate the seam, and the route
        // table a production build installs there would never be installed.
        const index = files.find(f => f.file === 'index.ts')!;

        expect(index.text).toMatch(/from\s+'\.\/active'/);
        expect(index.text).not.toMatch(/from\s+'\.\/runtime'/);
    });
});
