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

    it('dependabot leaves Playwright alone, and gives happy-dom and citty a pull request each', () => {
        // Every Playwright release brings its own Chromium, and the certification image and its
        // visual baselines are pinned to one: bumped in the weekly group it would turn the visual
        // dimension red with nothing to fix but the image.
        const t = read('dependabot.yml');
        for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
            expect(t, `${name} is not ignored`).toMatch(new RegExp(`- dependency-name: "${name}"\\s*\\n`));
        }
        expect(t).toMatch(/happy-dom:\n\s+patterns: \["happy-dom"\]/);
        expect(t).toMatch(/citty:\n\s+patterns: \["citty"\]/);
        expect(t).toMatch(/exclude-patterns: \["happy-dom", "citty"\]/);
    });

    it('dependabot leaves @types/vscode to the engine, and moves a range only when it must', () => {
        // The extension's types follow `engines.vscode` (vscode-types-engine.test.ts); and a range in
        // a published package's peerDependencies is a promise to its users, not a pointer to the
        // latest patch.
        const t = read('dependabot.yml');
        expect(t, '@types/vscode is not ignored').toMatch(/- dependency-name: "@types\/vscode"\s*\n/);
        expect(t).toMatch(/^\s+versioning-strategy: increase-if-necessary$/m);
    });

    it('Quality builds before it typechecks: the meta-package checks against its siblings\' dist', () => {
        // packages/framework typechecks against what core, ui and router PUBLISH (its tsconfig empties
        // the development condition), so on a fresh runner a typecheck before the build cannot
        // resolve them.
        const t = read('workflows', 'quality.yml');
        const build = t.indexOf('run: pnpm build');
        const typecheck = t.indexOf('run: pnpm typecheck');
        expect(build, 'quality.yml has no `pnpm build` step').toBeGreaterThan(-1);
        expect(typecheck, 'quality.yml has no `pnpm typecheck` step').toBeGreaterThan(-1);
        expect(build, 'the build must run before the typecheck').toBeLessThan(typecheck);
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
