// The editor knows every rune the compiler knows, from the compiler's own list.
//
// Completion, hover and the projection that blanks declarations before TypeScript sees the script
// derive from `RUNES`, not from copies of the list — a copy drifts, and a rune missing from it gets
// no completion and reaches TypeScript as text. This test feeds them every entry.

import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { RUNES } from '@pdxui/compiler';
import { getRuneCompletions } from '../src/capabilities/completion';
import { getHoverInfo } from '../src/capabilities/hover';
import { PdxTsService, projectScript } from '../src/utils/ts-service';
import { buildVirtualFile } from '../src/utils/virtual-file';
import { getTsDiagnostics } from '../src/capabilities/ts-diagnostics';

const decorators = RUNES.filter(r => r.kind === 'decorator');

/** A statement written the way the rune's shape shows it, with concrete types where it has placeholders. */
function statement(name: string, shape: string): string {
    if (name === 'prop') return "@prop label: string = 'x';";
    if (name === 'event') return '@event changed: number;';
    return shape.replace(/\s{2,}\/\/.*$/, '');
}

describe('the rune list, as the editor reads it', () => {
    it('is the compiler\'s, and holds the declarations the analyzer knows', () => {
        expect(decorators.map(r => r.name)).toEqual(expect.arrayContaining(['inject', 'provide', 'tag', 'loader', 'search', 'prefetch', 'mixin']));
    });

    it('completion offers every rune', () => {
        const labels = getRuneCompletions().map(c => c.label);
        for (const r of RUNES) expect(labels, r.name).toContain(r.kind === 'decorator' ? `@${r.name}` : `$${r.name}`);
    });

    it('hover documents every rune', () => {
        for (const r of RUNES) {
            const word = r.kind === 'decorator' ? `@${r.name}` : `$${r.name}`;
            const line = `${word} `;
            const hover = getHoverInfo(line, { line: 0, character: 1 }) as { contents: { value: string } } | null;
            expect(hover?.contents.value, word).toContain(r.doc);
        }
    });

    it('the projection blanks every declaration: a script that uses them all has no TypeScript error', () => {
        const script = decorators.map(r => statement(r.name, r.shape)).join('\n') + '\n';
        for (const r of decorators.filter(x => x.name !== 'prop')) {
            expect(projectScript(script), `@${r.name} reached TypeScript as text`).not.toContain(`@${r.name}`);
        }
        const root = join(__dirname, '..', '..', '..');
        const vf = buildVirtualFile(script, 0, [], '', -1);
        const found = getTsDiagnostics(new PdxTsService(root), pathToFileURL(join(root, 'all-runes.pdx')).href, vf, script)
            .map(d => `${d.code} ${d.message.split('\n')[0]}`);
        expect(found).toEqual([]);
    });
});
