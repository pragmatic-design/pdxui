// A file that starts with `#!` is checked out with LF line endings, whatever the clone's settings.
//
// With `core.autocrlf` on — Git for Windows' default — a script checked out with CRLF has a shebang
// ending in `\r`, and vitest cannot import it: `SyntaxError: Invalid or unexpected token`, and the
// suite that imports it is red on every such clone and on none of the machines that wrote it.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const git = (...args: string[]): string => execFileSync('git', args, { cwd: REPO, encoding: 'utf-8' });

const scripts = git('ls-files', '--', '*.mjs', '*.cjs', '*.js', '*.ts', '*.sh')
    .split('\n').map(s => s.trim()).filter(Boolean)
    .filter(f => readFileSync(join(REPO, f), 'utf-8').startsWith('#!'));

describe('a script with a shebang is checked out with LF', () => {
    it('found the scripts — the list is not empty', () => {
        expect(scripts.length, 'no tracked file starts with #!').toBeGreaterThan(2);
    });

    it('EVERY script with a shebang has eol=lf in .gitattributes', () => {
        const attrs = git('check-attr', 'eol', '--', ...scripts);
        const missing = attrs.split('\n').filter(l => l.trim() && !l.endsWith(': eol: lf'));
        expect(missing, 'add these to .gitattributes with `text eol=lf`').toEqual([]);
    });
});
