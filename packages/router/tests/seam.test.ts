// The seam only works if it is the ONLY door.
//
// `packages/router/src/active.ts` is what a production build swaps for the generated router. A file
// in this package that imports `./runtime` directly bypasses that swap, and the result is the worst
// shape a router can take: two routers alive in one build, one navigating and the other
// being read. It is invisible in dev — where both are the same module — and it is invisible in a
// production build too, because nothing fails; the page simply stops agreeing with the URL.
//
// So the seam is asserted on the SHAPE of the package rather than on a behaviour. There is no test
// that can catch a split brain after the fact.

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
            'these bypass the dev/prod swap and would run a second router beside the one navigating',
        ).toEqual([]);
    });

    it('the seam does name one — otherwise there is nothing to swap', () => {
        // The control. "No file imports ./runtime" is satisfied perfectly by a package that imports
        // no router at all, which is not what this asserts.
        const seam = files.find(f => f.file === SEAM)!;

        expect(seam.text).toMatch(/from\s+'\.\/runtime'/);
    });

    it('the package entry re-exports from the seam, so a component gets the running router', () => {
        // `@pdxui/router` is what a compiled component imports. If index.ts kept re-exporting
        // ./runtime, every component in a production build would read the interpreted router while
        // the outlet navigated with the generated one — and p2-plus.test.ts's assertion that no
        // component imports `virtual:pdx-router` would be guarding a split brain it cannot see.
        const index = files.find(f => f.file === 'index.ts')!;

        expect(index.text).toMatch(/from\s+'\.\/active'/);
        expect(index.text).not.toMatch(/from\s+'\.\/runtime'/);
    });
});
