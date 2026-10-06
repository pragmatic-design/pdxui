// A project created with `pdx new project` tells an AI agent how to work in it: AGENTS.md, the
// cross-agent convention.
//
// Without it a scaffold tells an agent nothing: index.html, package.json, App.pdx, vite.config.ts.
// An agent opened in it writes PDX from its training data, not from the skills, and does not
// know `pdx check --json --fix` exists.
//
// The rules AGENTS.md lists are the `pdxui` skill's, in lockstep: the skill is where they are
// written and reviewed, and the template may not drift from it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import newCmd from '../src/commands/new';
import { AGENTS_RULES, rulesMissingFrom, skillRules } from '../src/templates/agents-md';

type Runnable = { run: (c: { args: Record<string, unknown> }) => Promise<void> };

const SKILL = join(__dirname, '..', '..', '..', 'marketplace', 'plugins', 'pdxui', 'skills', 'pdxui', 'SKILL.md');

let sandbox: string;
beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pdx-agents-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sandbox, { recursive: true, force: true });
});

describe('pdx new project writes AGENTS.md', () => {
    it('with the check loop, where the truth is, and the plugin install line', async () => {
        await (newCmd as unknown as Runnable).run({ args: { type: 'project', name: 'shop', dir: sandbox } });
        const file = join(sandbox, 'shop', 'AGENTS.md');
        expect(existsSync(file), 'no AGENTS.md in the new project').toBe(true);
        const md = readFileSync(file, 'utf-8').replace(/\r\n/g, '\n');
        for (const needle of [
            'npx pdx check --json', 'npx pdx check --fix', 'npx pdx check --types', 'npx pdx explain',
            'claude plugin install pdxui@pragmatic-design', 'codex plugin add pdxui@pragmatic-design',
            'https://pdxui.com/llms.txt', 'npx pdx analyze --json', '__PDX_DEVTOOLS__', 'npx pdx mcp',
        ]) expect(md, `AGENTS.md does not say ${needle}`).toContain(needle);
        for (const rule of AGENTS_RULES) expect(md).toContain(rule);
    });
});

describe('the rules in AGENTS.md are the pdxui skill\'s', () => {
    // Normalised: a Windows checkout writes the skill pages with \r\n.
    const skill = readFileSync(SKILL, 'utf-8').replace(/\r\n/g, '\n');

    it('the skill lists them, so the comparison is not vacuous', () => {
        expect(skillRules(skill).length).toBeGreaterThanOrEqual(5);
    });

    it('are the same, in the same order', () => {
        expect(AGENTS_RULES).toEqual(skillRules(skill));
        expect(rulesMissingFrom(skill)).toEqual([]);
    });

    it('and the check fails when the skill changes a rule the template did not', () => {
        // The demonstration the story asks for: a rule rewritten in the skill alone is caught.
        const changed = skill.replace(AGENTS_RULES[0], `${AGENTS_RULES[0]} (edited in the skill only)`);
        expect(changed, 'the demonstration did not change the skill text').not.toBe(skill);
        expect(rulesMissingFrom(changed)).toEqual([AGENTS_RULES[0]]);
    });
});
