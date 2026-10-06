// No source file of the language server is over 400 lines.
//
// The repository's rule: a file over 400 lines has more than one responsibility. A handler added
// where the handlers already are grows one file without anyone noticing, so the server is split by
// responsibility — the connection, the project state, a module per capability — and this keeps it
// that way.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', 'src');
const LIMIT = 400;

function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...tsFiles(full));
        else if (name.endsWith('.ts')) out.push(full);
    }
    return out;
}

describe('the language server source', () => {
    it(`has no file over ${LIMIT} lines`, () => {
        const files = tsFiles(SRC);
        expect(files.length, 'no source found: the folder moved').toBeGreaterThan(10);
        const over = files
            .map((f) => ({ file: relative(SRC, f).replace(/\\/g, '/'), lines: readFileSync(f, 'utf8').split('\n').length }))
            .filter((f) => f.lines > LIMIT)
            .map((f) => `${f.file}: ${f.lines}`);
        expect(over, 'split these by responsibility, not to hit the number').toEqual([]);
    });
});
