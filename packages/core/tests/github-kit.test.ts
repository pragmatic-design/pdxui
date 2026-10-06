// What GitHub reads from `.github/`: the workflows, dependabot, the issue and pull-request templates.
// None of it runs until the repository is on GitHub, and a template or a dependabot file GitHub cannot
// read is skipped there without a word. So the shape is checked here, where the gate sees it; the
// workflows' full syntax is actionlint's job (`docker run --rm -v <repo>:/repo -w /repo rhysd/actionlint`).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const GITHUB = join(REPO, '.github');
const PUBLIC_REPO = 'https://github.com/pragmatic-design/pdxui';

const read = (...p: string[]): string => readFileSync(join(GITHUB, ...p), 'utf-8').replace(/\r\n/g, '\n');
const yamlIn = (dir: string): string[] => readdirSync(join(GITHUB, dir)).filter(f => /\.ya?ml$/.test(f));

/** A top-level key, at column 0. A YAML file indented with a tab is not YAML. */
const topLevel = (text: string, key: string): boolean => new RegExp(`^${key}:`, 'm').test(text);

describe('the GitHub kit', () => {
    it('found the workflows and the templates — the lists are not empty', () => {
        expect(yamlIn('workflows').length).toBeGreaterThan(3);
        expect(yamlIn('ISSUE_TEMPLATE').length).toBe(3);
    });

    it('NO YAML file under .github is indented with a tab', () => {
        const files = [...yamlIn('workflows').map(f => `workflows/${f}`), ...yamlIn('ISSUE_TEMPLATE').map(f => `ISSUE_TEMPLATE/${f}`), 'dependabot.yml'];
        expect(files.filter(f => read(f).includes('\t'))).toEqual([]);
    });

    it('EVERY workflow names its triggers, its permissions and its jobs', () => {
        const incomplete = yamlIn('workflows').filter(f => {
            const t = read('workflows', f);
            return !topLevel(t, 'name') || !topLevel(t, 'on') || !topLevel(t, 'permissions') || !topLevel(t, 'jobs');
        });
        expect(incomplete, 'a workflow without explicit permissions runs with the default token').toEqual([]);
    });

    it('dependabot watches the npm workspace and the actions', () => {
        const t = read('dependabot.yml');
        expect(t).toMatch(/^version: 2$/m);
        expect(t).toMatch(/package-ecosystem: npm\n\s+directory: \/\n/);
        expect(t).toMatch(/package-ecosystem: github-actions\n\s+directory: \/\n/);
    });

    it('CodeQL analyses the sources and the workflows', () => {
        expect(read('workflows', 'codeql.yml')).toMatch(/language: \[javascript-typescript, actions\]/);
    });

    it('the issue forms are forms, and the chooser points at this repository', () => {
        for (const f of ['bug_report.yml', 'feature_request.yml']) {
            const t = read('ISSUE_TEMPLATE', f);
            expect(topLevel(t, 'name') && topLevel(t, 'description') && topLevel(t, 'body'), f).toBe(true);
        }
        const config = read('ISSUE_TEMPLATE', 'config.yml');
        expect(config).toMatch(/^blank_issues_enabled: false$/m);
        const urls = [...config.matchAll(/url: (\S+)/g)].map(m => m[1]);
        expect(urls.length).toBe(3);
        expect(urls.filter(u => !u.startsWith(PUBLIC_REPO) && !u.startsWith('https://pdxui.com/'))).toEqual([]);
    });

    it('every change has a reviewer, and the pull request asks for the gate', () => {
        expect(read('CODEOWNERS')).toMatch(/^\* @\S+$/m);
        const pr = read('PULL_REQUEST_TEMPLATE.md');
        expect(pr).toMatch(/pnpm test/);
        expect(pr).toMatch(/pnpm certify/);
    });
});
