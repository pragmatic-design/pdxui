// `llms.txt` lists every component on one line, with the sentence that says what it is for.
//
// The line is `- [tag](/components/tag): <description> — props: …`, and the description comes from
// the component's JSDoc, which wraps. Copied as it is, a description with a line break splits the
// entry in two — an agent reading line by line gets half a sentence and an orphan line.
// Without a description, the line says only the category: `pdx-transfer — Forms`.

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = join(__dirname, '..', '..', 'site');
let lines: string[] = [];

beforeAll(() => {
    execFileSync(process.execPath, [join(SITE, 'scripts', 'gen-llms.mjs')], { cwd: SITE, stdio: 'pipe' });
    const text = readFileSync(join(SITE, 'public', 'llms.txt'), 'utf-8').replace(/\r\n/g, '\n');
    const section = text.split('## Components\n')[1] ?? '';
    lines = section.split('\n').filter(l => l.trim());
}, 60_000);

describe('llms.txt — the component list', () => {
    it('has the components, so the checks below are not vacuous', () => {
        expect(lines.length).toBeGreaterThan(100);
    });

    // Every component package, not only @pdxui/ui: the router's elements are known to the compiler
    // and the editor, and belong here too.
    it('lists the router\'s elements beside the library\'s', () => {
        for (const tag of ['pdx-router-outlet', 'pdx-link']) {
            expect(lines.some(l => l.startsWith(`- [${tag}](/components/${tag}): `)), tag).toBe(true);
        }
    });

    it('is one line per component: no description breaks its entry', () => {
        const orphans = lines.filter(l => !l.startsWith('- [pdx-'));
        expect(orphans, 'lines that are the rest of an entry above').toEqual([]);
    });

    it('each line says what the component is for, not only its category', () => {
        const bare = lines
            .map(l => /^- \[([^\]]+)\]\([^)]*\): (.*?)(?: — props: .*)?$/.exec(l))
            .filter((m): m is RegExpExecArray => !!m)
            .filter(m => m[2].split(/\s+/).length < 4)
            .map(m => `${m[1]}: "${m[2]}"`);
        expect(bare, 'these say a word or two — a category, not a sentence').toEqual([]);
    });
});
