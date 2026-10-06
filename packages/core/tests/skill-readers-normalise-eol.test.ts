// A test that reads a skill page normalises its line endings.
//
// The repo has no .gitattributes, and a Windows checkout with core.autocrlf=true writes every
// marketplace page with \r\n. A reader that splits on '\n' and anchors with `$`, or looks for a fence
// followed by '\n', then matches nothing: measured with every skill page rewritten as CRLF,
// skill-catalog-areas failed 4 cases, mock-transport-recipe 13 and catch-params 3. The page was fine; the test was reading bytes a checkout had changed.
//
// The rule: in a test file that reads from marketplace/, every readFileSync of a page — a path that
// ends in `.md`, in the call or in the `const` it names — is followed by `.replace(/\r\n/g, '\n')`
// (the convention) or split with `/\r?\n/`. This scans for the calls that are not.
//
// What it does not see: a page read through a loop variable (`readFileSync(join(DIR, f))` with `f`
// from a readdir), whose path the scan cannot resolve. Those readers normalise by the same rule.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = join(__dirname, '../..');

function testFiles(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
        if (e === 'node_modules' || e === 'dist' || e === 'generated') continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) testFiles(p, acc);
        else if (/\.(test|spec)\.ts$/.test(e)) acc.push(p);
    }
    return acc;
}

/** Every test file of every package. */
function allTestFiles(): string[] {
    const out: string[] = [];
    for (const pkg of readdirSync(PACKAGES)) {
        const tests = join(PACKAGES, pkg, 'tests');
        try { if (statSync(tests).isDirectory()) testFiles(tests, out); } catch { continue; }
    }
    return out;
}

/** The text of the call starting at `open` (the index of its '('), up to the matching ')'. */
function callEnd(src: string, open: number): number {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '(') depth++;
        else if (c === ')' && --depth === 0) return i;
    }
    return -1;
}

/** What a normalised read is followed by. */
const NORMALISED = /^\s*\.\s*(?:replace\(\s*\/\\r\\n\/g\s*,|split\(\s*\/\\r\?\\n\/)/;
/** A page: the path, in the call or in the `const` it names, ends in `.md`. */
const PAGE_PATH = /\.md['"`]/;

/** The call, and — when its first argument is a bare name — the `const` that defines that name. */
function pathText(src: string, call: string): string {
    const first = call.match(/^readFileSync\(\s*([A-Za-z_$][\w$]*)\s*[,)]/);
    const def = first ? src.match(new RegExp(`const\\s+${first[1]}\\s*=\\s*([^;]+);`)) : null;
    return def ? `${call} ${def[1]}` : call;
}

type Raw = { file: string; line: number; call: string };

export function rawSkillReads(files: string[]): Raw[] {
    const out: Raw[] = [];
    for (const file of files) {
        if (file === __filename) continue; // the scanner, whose own source names the call it looks for
        const src = readFileSync(file, 'utf-8').replace(/\r\n/g, '\n');
        if (!src.includes('marketplace')) continue;
        for (const m of src.matchAll(/\breadFileSync\(/g)) {
            const open = m.index! + m[0].length - 1;
            const close = callEnd(src, open);
            if (close < 0) continue;
            const call = src.slice(m.index!, close + 1);
            if (!PAGE_PATH.test(pathText(src, call))) continue;
            if (NORMALISED.test(src.slice(close + 1))) continue;
            out.push({ file: file.slice(PACKAGES.length + 1).replace(/\\/g, '/'), line: src.slice(0, m.index).split('\n').length, call });
        }
    }
    return out;
}

describe('tests that read a skill page normalise CRLF', () => {
    it('finds skill readers to check (an empty scan would pass forever)', () => {
        const readers = allTestFiles().filter((f) => readFileSync(f, 'utf-8').replace(/\r\n/g, '\n').includes('marketplace'));
        expect(readers.length).toBeGreaterThan(15);
    });

    it('no reader takes a skill page raw', () => {
        const raw = rawSkillReads(allTestFiles()).map((r) => `${r.file}:${r.line} ${r.call}`);
        expect(raw, 'a Windows checkout writes these pages with \\r\\n').toEqual([]);
    });
});
