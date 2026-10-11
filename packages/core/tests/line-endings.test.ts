// Every text file is LF in the repository and in every checkout, Windows included.
//
// Without a rule, `core.autocrlf=true` (the Windows default) checks the sources out as CRLF while the
// generators write LF, or a mix of both when they copy a source into their output: every build on
// Windows then showed ~80 generated files as modified, and a `git stash` round trip rewrote files
// as CRLF. `.gitattributes` with `eol=lf` is the one place that decides it.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');

/** `git ls-files --eol`: index eol, worktree eol, attributes, path — for every tracked file. */
function filesWithEol(): { index: string; attr: string; path: string }[] {
    const out = execFileSync('git', ['ls-files', '--eol'], { cwd: REPO, encoding: 'utf-8', maxBuffer: 64 << 20 });
    return out.split('\n').filter(Boolean).map((line) => {
        const [meta, path] = line.split('\t');
        const [index, , ...attr] = meta.trim().split(/\s+/);
        return { index, attr: attr.join(' '), path };
    });
}

describe('line endings', () => {
    const files = filesWithEol();
    // `i/-text` is a binary, `i/none` an empty file (a .gitkeep): neither has line endings.
    const text = files.filter((f) => f.index !== 'i/-text' && f.index !== 'i/none');

    it('every text file in the index is LF', () => {
        expect(text.filter((f) => f.index !== 'i/lf').map((f) => `${f.index} ${f.path}`)).toEqual([]);
    });

    it('every text file is checked out as LF on every platform (eol=lf)', () => {
        const unruled = text.filter((f) => !/eol=lf/.test(f.attr)).map((f) => f.path);
        expect(unruled.length, `${unruled.length} text files with no eol rule, e.g. ${unruled.slice(0, 3).join(', ')}`).toBe(0);
    });

    it('a PNG is binary, never converted', () => {
        const png = files.filter((f) => f.path.endsWith('.png'));
        expect(png.length).toBeGreaterThan(0);
        expect(png.filter((f) => !/-text|binary/.test(f.attr) && f.index !== 'i/-text').map((f) => f.path)).toEqual([]);
    });
});
