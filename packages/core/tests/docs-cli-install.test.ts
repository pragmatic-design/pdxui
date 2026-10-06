// A page that tells you to run `pdx` tells you to install it first.
//
// An app that has installed @pdxui/framework — "one install, everything" — and runs
// `npx pdx theme …` gets `404 Not Found - GET https://registry.npmjs.org/pdx`: the meta-package does
// not include the CLI, so npx goes looking for a public package called `pdx`. The CLI is a dev
// dependency and is installed as one; the pages say so in the command, where a reader copying the
// block cannot miss it.
//
// The rule, per file: the first fenced block that runs `pdx` installs @pdxui/cli before it. A
// page is read top-down, so the later blocks of the same page are covered by that one; in the skills,
// where an agent copies a single block, the first block IS the one that runs it.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '../../..');
const ROOTS = [join(REPO, 'marketplace/plugins'), join(REPO, 'packages/site/content')];

function markdown(dir: string, acc: string[] = []): string[] {
    for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) markdown(p, acc);
        else if (f.endsWith('.md')) acc.push(p);
    }
    return acc;
}

/** A line that runs the CLI: `pdx <cmd>` or `npx pdx <cmd>`, at the start of a line. */
const RUNS_PDX = /^\s*(?:npx\s+)?pdx\s+[a-z]/m;
/** Installing the CLI as a dev dependency, with any of the three package managers. */
const INSTALLS_CLI = /^\s*(?:npm\s+(?:i|install)\s+(?:-D|--save-dev)|pnpm\s+add\s+-D|yarn\s+add\s+-D)\s+@pdxui\/cli\b/m;

interface Finding { file: string; block: string }

function firstBlockRunningPdx(text: string): string | null {
    // Match: a fence at column 0, its info string, the body, the closing fence. Groups: [1]=body
    for (const m of text.matchAll(/^```[^\n]*\n([\s\S]*?)^```[ \t]*$/gm)) {
        if (RUNS_PDX.test(m[1])) return m[1];
    }
    return null;
}

describe('pages that run pdx install @pdxui/cli first', () => {
    const pages: Finding[] = [];
    for (const root of ROOTS) {
        for (const file of markdown(root)) {
            const block = firstBlockRunningPdx(readFileSync(file, 'utf-8').replace(/\r\n/g, '\n'));
            if (block) pages.push({ file: relative(REPO, file).replace(/\\/g, '/'), block });
        }
    }

    it('found the pages to check', () => {
        // The control: pdxui-theme is the page the lab copied from.
        expect(pages.map(p => p.file)).toContain('marketplace/plugins/pdxui/skills/pdxui-theme/SKILL.md');
        expect(pages.length).toBeGreaterThanOrEqual(4);
    });

    it('install it in the first block that runs it, before the command', () => {
        const without = pages.filter(({ block }) => {
            const install = block.search(INSTALLS_CLI);
            return install === -1 || install > block.search(RUNS_PDX);
        }).map(p => p.file);
        expect(without).toEqual([]);
    });
});

describe('the meta-package does not claim to be everything', () => {
    it('describes itself as the runtime, and points at the CLI', () => {
        const pkg = JSON.parse(readFileSync(join(REPO, 'packages/framework/package.json'), 'utf-8'));
        expect(pkg.dependencies['@pdxui/cli'], 'if it ever does include the CLI, this test changes with it').toBeUndefined();
        expect(pkg.description).not.toMatch(/all packages|everything/i);
        expect(pkg.description).toContain('@pdxui/cli');
    });
});
