// The skills reach the shared skills repository whole, and a stale copy is caught.
//
// Run against a throwaway skills repository with the .NET plugin already in its marketplace: the
// copy must leave that entry alone, leave `tools/` behind, and `--check` must fail on drift.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(__dirname, '..', '..', '..', 'scripts', 'sync-skills.mjs');

function run(args: string[]): { code: number; out: string } {
    try {
        return { code: 0, out: execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' }) };
    } catch (e) {
        const err = e as { status: number; stdout: string };
        return { code: err.status, out: err.stdout };
    }
}

describe('scripts/sync-skills.mjs', () => {
    let repo: string;
    beforeAll(() => {
        repo = mkdtempSync(join(tmpdir(), 'pdx-skills-'));
        mkdirSync(join(repo, '.claude-plugin'), { recursive: true });
        writeFileSync(join(repo, '.claude-plugin', 'marketplace.json'), JSON.stringify({
            name: 'pragmatic-design', owner: { name: 'x' },
            plugins: [{ name: 'pragmatic-design', source: './plugins/pragmatic-design', description: 'the .NET skills', version: '0.11.20' }],
        }, null, 2));
    });

    it('finds a fresh repository out of date', () => {
        const r = run([repo, '--check']);
        expect(r.code, r.out).toBe(1);
        expect(r.out).toMatch(/no "pdxui" entry/);
    });

    it('copies the plugin, leaves tools behind, and keeps the other plugins', () => {
        const r = run([repo]);
        expect(r.code, r.out).toBe(0);
        expect(existsSync(join(repo, 'plugins/pdxui/skills/pdxui/SKILL.md'))).toBe(true);
        expect(existsSync(join(repo, 'plugins/pdxui/skills/pdxui-language/SKILL.md'))).toBe(true);
        expect(existsSync(join(repo, 'plugins/pdxui/skills/pdxui/tools')), 'maintainer material travelled').toBe(false);
        const m = JSON.parse(readFileSync(join(repo, '.claude-plugin', 'marketplace.json'), 'utf-8')) as { plugins: { name: string; version: string }[] };
        expect(m.plugins.map(p => p.name)).toEqual(['pragmatic-design', 'pdxui']);
        expect(m.plugins[0].version, 'the .NET entry was touched').toBe('0.11.20');
        expect(run([repo, '--check']).code).toBe(0);
    });

    it('fails --check when the copy there changes', () => {
        appendFileSync(join(repo, 'plugins/pdxui/skills/pdxui-theme/SKILL.md'), '\nedited by hand\n');
        const r = run([repo, '--check']);
        expect(r.code).toBe(1);
        expect(r.out).toContain('differs: skills/pdxui-theme/SKILL.md');
    });

    // An installed plugin updates only when its `version` changes, so new content under the version
    // already published reaches nobody who has it installed.
    it('says the version must move when the content changed and the version did not', () => {
        const r = run([repo, '--check']);
        expect(r.code).toBe(1);
        expect(r.out).toContain('the content changed and the version did not');
    });

    it('the plugin carries one version: its marketplace entry and its plugin.json agree', () => {
        // The message above tells whoever publishes to raise both; this keeps them from parting.
        const root = join(__dirname, '..', '..', '..', 'marketplace');
        const entry = (JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf-8')) as { plugins: { name: string; version: string }[] })
            .plugins.find(p => p.name === 'pdxui');
        const plugin = JSON.parse(readFileSync(join(root, 'plugins', 'pdxui', '.claude-plugin', 'plugin.json'), 'utf-8')) as { version: string };
        expect(entry?.version, 'no pdxui entry with a version in marketplace.json').toBeTruthy();
        expect(plugin.version).toBe(entry!.version);
    });

    it('does not say it when the version there is an older one — the control', () => {
        const mpFile = join(repo, '.claude-plugin', 'marketplace.json');
        const m = JSON.parse(readFileSync(mpFile, 'utf-8')) as { plugins: { name: string; version: string }[] };
        m.plugins.find(p => p.name === 'pdxui')!.version = '0.0.0-older';
        writeFileSync(mpFile, JSON.stringify(m, null, 2));
        const r = run([repo, '--check']);
        expect(r.code).toBe(1);
        expect(r.out).not.toContain('the content changed and the version did not');
    });
});
