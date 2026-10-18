// The shipped themes are generated from packages/design/theme-sources (#155): each src/themes/<name>.css
// must be exactly what its source expands to, or an edit made to one of the two is lost to the other.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { SOURCES, THEMES, generatedTheme } from '../../design/scripts/gen-themes.mjs';
import { nestedThemeGuard } from '../../design/src/engine/nested-theme-guard';

const sources: string[] = readdirSync(SOURCES).filter((f: string) => f.endsWith('.css'));

describe('the shipped themes are their sources, expanded', () => {
    it('every shipped theme has a source', () => {
        // The control: no source at all would satisfy every case below by producing nothing.
        const themes = readdirSync(THEMES).filter((f: string) => f.endsWith('.css'));
        expect(sources.sort()).toEqual(themes.sort());
        expect(sources.length).toBe(13);
    });

    for (const file of sources) {
        const name = file.replace(/\.css$/, '');
        it(`${name}: src/themes is what theme-sources generates — run packages/design/scripts/gen-themes.mjs`, () => {
            const source = readFileSync(join(SOURCES, file), 'utf8');
            expect(readFileSync(join(THEMES, file), 'utf8')).toBe(generatedTheme(source, name));
        });
    }

    it('a source writes no guard by hand: the generator writes them all', () => {
        const handWritten = sources.filter((file) => readFileSync(join(SOURCES, file), 'utf8').includes(nestedThemeGuard(file.replace(/\.css$/, ''))));
        expect(handWritten).toEqual([]);
    });
});
