// Every command and every flag the CLI takes is in the CLI's docs page.
//
// The flags an agent drives — `check --json`, `--fix`, `--types`, `analyze --json`, `mcp` — are
// learned from `cli.md`: a flag the page leaves out is one an agent never learns exists. The
// commands' own `args` are the list, so a new flag fails here until the page says it.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

type Command = { meta?: { name?: string }; args?: Record<string, { type?: string }> };

const CLI_MD = readFileSync(join(__dirname, '..', '..', 'site', 'content', 'docs', 'cli.md'), 'utf-8');

/** The subcommands `pdx` registers, read from its entry so a new one is not missed. */
const INDEX = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');
const COMMANDS = [...INDEX.matchAll(/^\s+(\w+): \(\) => import\('\.\/commands\/(\w+)'\)/gm)].map(m => ({ name: m[1], file: m[2] }));

describe('the agents page', () => {
    const page = join(__dirname, '..', '..', 'site', 'content', 'docs', 'agents.md');

    it('exists, and says how to install the skills, where the docs for a model are, and the MCP server', () => {
        expect(existsSync(page), 'site/content/docs/agents.md is missing').toBe(true);
        const md = readFileSync(page, 'utf-8');
        for (const needle of ['claude plugin install pdxui@pragmatic-design', '/llms.txt', 'AGENTS.md', 'npx pdx mcp', 'pdx check --json']) {
            expect(md, `the agents page does not say ${needle}`).toContain(needle);
        }
    });

    it('the CLI page points to it', () => {
        expect(CLI_MD).toContain('/docs/agents');
    });
});

describe('cli.md covers the CLI', () => {
    it('found the commands, so the checks below are not vacuous', () => {
        expect(COMMANDS.length).toBeGreaterThan(8);
    });

    it('names every command as `pdx <command>`', () => {
        const missing = COMMANDS.filter(c => !CLI_MD.includes(`pdx ${c.name}`)).map(c => c.name);
        expect(missing, 'commands the docs page never mentions').toEqual([]);
    });

    it('names every flag of every command', async () => {
        const missing: string[] = [];
        for (const c of COMMANDS) {
            const cmd = (await import(`../src/commands/${c.file}.ts`)).default as Command;
            for (const [flag, def] of Object.entries(cmd.args ?? {})) {
                if (def.type === 'positional') continue;
                if (!CLI_MD.includes(`--${flag}`)) missing.push(`pdx ${c.name} --${flag}`);
            }
        }
        expect(missing, 'flags the docs page never mentions').toEqual([]);
    });
});
