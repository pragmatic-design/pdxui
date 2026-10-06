// The compiler page says what production does, and names what measures it.
//
// A claim like "not implemented" for production validation or route pre-linking goes stale the day
// the feature ships, and a page can contradict itself from one section to the next. The
// `pdxui-setup` skill copies the page verbatim, so agents would read a stale claim too.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const page = readFileSync(join(ROOT, 'packages', 'site', 'content', 'docs', 'compiler.md'), 'utf8').replace(/\r\n/g, '\n');

/** The paragraph or table row that mentions `subject`, so a claim is read where it is made. */
function blocksAbout(subject: RegExp): string[] {
    return page.split(/\n(?=\|)|\n\n/).filter(b => subject.test(b));
}

describe('compiler.md tells the truth about production', () => {
    it('does not call validation "not implemented"', () => {
        const rows = blocksAbout(/^\| Validation\b/m);
        expect(rows.length, 'the Dual mode table has no Validation row').toBeGreaterThan(0);
        for (const row of rows) expect(row).not.toMatch(/not implemented/i);
    });

    it('does not call route pre-linking "not implemented"', () => {
        const blocks = blocksAbout(/pre-link/i);
        expect(blocks.length, 'the page no longer mentions route pre-linking').toBeGreaterThan(0);
        for (const b of blocks) expect(b, b).not.toMatch(/not\s+implemented/i);
    });

    it('the Validation row names the files that measure it, and they exist', () => {
        const row = blocksAbout(/^\| Validation\b/m).join('\n');
        for (const file of ['packages/showcase/tests/diagnostics.spec.ts', 'packages/core/tests/diagnostics-behind-dev.test.ts']) {
            expect(row, `the Validation row does not name ${file}`).toContain(file);
            expect(existsSync(join(ROOT, file)), `${file} is named and does not exist`).toBe(true);
        }
    });
});
