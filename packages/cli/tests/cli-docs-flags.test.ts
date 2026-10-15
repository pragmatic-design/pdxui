// Every command and every flag the CLI takes is in the CLI's docs page.
//
// The flags an agent drives — `check --json`, `--fix`, `--types`, `analyze --json`, `mcp` — are
// learned from `cli.md`: a flag the page leaves out is one an agent never learns exists. The
// commands' own `args` are the list, so a new flag fails here until the page says it.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const CLI_MD = readFileSync(join(__dirname, '..', '..', 'site', 'content', 'docs', 'cli.md'), 'utf-8');

/** The subcommands `pdx` registers, read from its entry so a new one is not missed. */
const INDEX = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');
const COMMANDS = [...INDEX.matchAll(/^\s+(\w+): \(\) => import\('\.\/commands\/(\w+)'\)/gm)].map(m => ({ name: m[1], file: m[2] }));

/**
 * The flags of a command module: the keys of `args` in its `export default defineCommand({ … })`,
 * without the positionals. Read from the source, not by importing it: a command module loads what
 * its command runs (the compiler, Vite, the MCP SDK), and importing all of them cost this test
 * 2.5 s of a 5 s budget (#330). `null` when the declaration is not in that shape, so a command
 * written another way fails here instead of reporting no flags.
 */
function flagsOf(file: string): string[] | null {
    const path = join(__dirname, '..', 'src', 'commands', `${file}.ts`);
    const source = ts.createSourceFile(path, readFileSync(path, 'utf-8'), ts.ScriptTarget.Latest);
    const exported = source.statements.find(ts.isExportAssignment)?.expression;
    const decl = exported && ts.isCallExpression(exported) ? exported.arguments[0] : undefined;
    if (!decl || !ts.isObjectLiteralExpression(decl)) return null;
    const args = decl.properties.find((p) => p.name && ts.isIdentifier(p.name) && p.name.text === 'args');
    if (!args) return [];
    if (!ts.isPropertyAssignment(args) || !ts.isObjectLiteralExpression(args.initializer)) return null;
    const flags: string[] = [];
    for (const p of args.initializer.properties) {
        // A name is written bare (`json`) or quoted (`'max-warnings'`).
        if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
            || !ts.isObjectLiteralExpression(p.initializer)) return null;
        const type = p.initializer.properties.find((q) => q.name && ts.isIdentifier(q.name) && q.name.text === 'type');
        const positional = !!type && ts.isPropertyAssignment(type) && ts.isStringLiteral(type.initializer)
            && type.initializer.text === 'positional';
        if (!positional) flags.push(p.name.text);
    }
    return flags;
}

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

    it('reads the flags of every command, so the check below is not vacuous', () => {
        const unread = COMMANDS.filter(c => flagsOf(c.file) === null).map(c => c.file);
        expect(unread, 'commands whose `args` is not an object literal in `export default defineCommand({ … })`')
            .toEqual([]);
        // The control: flags known to exist are read.
        expect(flagsOf('check')).toEqual(expect.arrayContaining(['json', 'fix']));
        expect(flagsOf('explain'), 'a positional is not a flag').not.toContain('code');
    });

    it('names every flag of every command', () => {
        const missing: string[] = [];
        for (const c of COMMANDS) {
            for (const flag of flagsOf(c.file) ?? []) {
                if (!CLI_MD.includes(`--${flag}`)) missing.push(`pdx ${c.name} --${flag}`);
            }
        }
        expect(missing, 'flags the docs page never mentions').toEqual([]);
    });
});
