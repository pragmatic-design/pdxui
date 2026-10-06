// Every skill reads the same in every agent that loads SKILL.md.
//
// The skills ship as the plugin `pdxui` to Claude Code and to Codex, which reads the same
// `.claude-plugin/marketplace.json`. Measured with `codex debug prompt-input` (Codex 0.157.1, the
// .NET plugin installed beside this one, 47 skills in all), Claude Code forgives what Codex does not:
//
// - `when_to_use` is a Claude Code field. Codex never shows it, so a skill's "when to open me"
//   belongs in the description;
// - Codex shares one listing budget among every installed skill and cuts the long entries mid-word
//   (`pragmatic-ui` stopped at "file format, ru"). The budget is a total: short entries leave room to
//   the others. Measured with this plugin, 6 topic stubs and the .NET plugin, 53 skills:
//   the cut fell at 320 while the .NET descriptions ran to 397, and at 374 once they were at most 236.
//   300 keeps every description here whole with room to spare, as long as the others stay short;
// - a byte-order mark before `---` hides the frontmatter, and the skill is dropped without a word;
// - an unquoted value containing ": " is not valid YAML.
//
// The rules are the .NET repository's `scripts/skill-portability.mjs` (commit b641a4cc5), with the
// limit measured for two plugins instead of one, and the names this plugin carries.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MARKETPLACE_DIR = join(__dirname, '..', '..', '..', 'marketplace');
const marketplace = JSON.parse(readFileSync(join(MARKETPLACE_DIR, '.claude-plugin', 'marketplace.json'), 'utf-8')) as {
    name: string; plugins: { name: string; source: string; version?: string }[] };
const plugin = marketplace.plugins[0];
const PLUGIN_DIR = join(MARKETPLACE_DIR, plugin.source);
const SKILLS_DIR = join(PLUGIN_DIR, 'skills');

const DESCRIPTION_LIMIT = 300;
const SPEC_FIELDS = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];
const CLAUDE_UI_FIELDS = ['argument-hint', 'shell', 'user-invocable', 'disable-model-invocation'];

/** The problems of one SKILL.md, given its folder name and its text. Empty when it is portable. */
export function skillProblems(folder: string, text: string): string[] {
    const problems: string[] = [];
    if (text.startsWith('﻿')) problems.push('starts with a byte-order mark: other agents do not find the frontmatter');
    const lines = text.replace(/^﻿/, '').split(/\r?\n/);
    const end = lines.indexOf('---', 1);
    if (lines[0] !== '---' || end < 0) return [...problems, 'no frontmatter between --- lines at the top'];

    const fields = new Map<string, string>();
    for (const line of lines.slice(1, end)) {
        const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
        if (!m) continue;
        const value = m[2].trim();
        const quoted = /^(".*"|'.*')$/.test(value);
        if (!quoted && /: | #/.test(value)) problems.push(`${m[1]} is unquoted and contains ": " or " #": not valid YAML`);
        fields.set(m[1], quoted ? value.slice(1, -1) : value);
    }

    const name = fields.get('name') ?? '';
    if (name !== folder) problems.push(`name "${name}" differs from its folder "${folder}"`);
    if (!/^pdxui(-[a-z0-9]+)*$/.test(name)) problems.push(`name "${name}" is not pdxui or pdxui-<lowercase words>`);

    const description = fields.get('description') ?? '';
    if (description.length === 0 || description.length > DESCRIPTION_LIMIT)
        problems.push(`description is ${description.length} characters; keep it between 1 and ${DESCRIPTION_LIMIT} so Codex lists it whole`);
    if (fields.has('when_to_use')) problems.push('when_to_use is read by Claude Code only: fold it into the description');
    for (const key of fields.keys())
        if (!SPEC_FIELDS.includes(key) && !CLAUDE_UI_FIELDS.includes(key) && key !== 'when_to_use')
            problems.push(`field "${key}" is neither in the specification nor a known Claude Code UI field`);
    return problems;
}

describe('the skills are portable to every agent', () => {
    const folders = existsSync(SKILLS_DIR)
        ? readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : [];

    it('the plugin is pdxui, and it has skills to check', () => {
        expect(plugin.name, 'the plugin a reader installs').toBe('pdxui');
        expect(marketplace.name).toBe('pdxui');
        expect(folders.length, `no skill under ${SKILLS_DIR}`).toBeGreaterThanOrEqual(12);
    });

    it('EVERY skill is portable', () => {
        const problems = folders.flatMap(f => {
            const file = join(SKILLS_DIR, f, 'SKILL.md');
            return (existsSync(file) ? skillProblems(f, readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')) : ['has no SKILL.md']).map(p => `${f}: ${p}`);
        });
        expect(problems).toEqual([]);
    });

    it('the rules can fail', () => {
        const ok = '---\nname: pdxui-x\ndescription: Covers x. Use when building x.\n---\n';
        expect(skillProblems('pdxui-x', ok)).toEqual([]);
        expect(skillProblems('pdxui-x', `﻿${ok}`).length).toBe(1);
        expect(skillProblems('pdxui-x', ok.replace('---\n\n', '---\nwhen_to_use: x\n---\n').replace('Use when building x.\n---\n', 'Use when building x.\nwhen_to_use: x\n---\n'))
            .some(p => p.includes('when_to_use'))).toBe(true);
        expect(skillProblems('pdxui-x', ok.replace('Covers x.', 'x'.repeat(301))).some(p => p.includes('characters'))).toBe(true);
        expect(skillProblems('pdxui-x', ok.replace('Covers x.', 'Covers: x.')).some(p => p.includes('YAML'))).toBe(true);
        expect(skillProblems('pragmatic-x', ok.replace('pdxui-x', 'pragmatic-x')).some(p => p.includes('is not pdxui'))).toBe(true);
    });
});
