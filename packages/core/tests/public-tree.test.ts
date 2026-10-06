// What the repository publishes, and what it does not.
//
// Agent instructions and agent tooling are working material, not project content: the CLAUDE.md
// files, everything under `.claude/`, and the Jira tooling the backlog loop runs on. They live on
// disk under an ignored `.claude/`, and none of them may reach the index again.
//
// `--others --exclude-standard` as well as the index, for the reason docs-language.test.ts gives:
// a file written but not yet committed is exactly the one this has to catch, and a
// guard that only reads the index reports it one commit too late.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');

const published = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: REPO, encoding: 'utf-8' })
    .split('\n').map(s => s.trim()).filter(Boolean);

/**
 * Private agent material: a CLAUDE.md anywhere but the root, everything under `.claude/`, the Jira
 * tooling. The root CLAUDE.md is the public one — it imports AGENTS.md, which every agent reads.
 */
function isAgentMaterial(file: string): boolean {
    return file.startsWith('.claude/') || file.endsWith('/CLAUDE.md') || file.startsWith('tools/jira/');
}

describe('the repository publishes no private agent material', () => {
    it('found the tree — the list is not empty', () => {
        // Without this the zero below is satisfied by a git call that listed nothing.
        expect(published.length, 'git listed no files at all').toBeGreaterThan(1000);
    });

    it('NO CLAUDE.md below the root, nothing under .claude/, no Jira tooling', () => {
        expect(published.filter(isAgentMaterial), 'these files would be published').toEqual([]);
    });

    it('the root CLAUDE.md is the public one: it imports AGENTS.md, and both are published', () => {
        expect(publishedPaths.has('AGENTS.md'), 'AGENTS.md is not published').toBe(true);
        expect(publishedPaths.has('CLAUDE.md'), 'CLAUDE.md is not published').toBe(true);
        expect(readFileSync(join(REPO, 'CLAUDE.md'), 'utf-8').replace(/\r\n/g, '\n'), 'CLAUDE.md does not import AGENTS.md')
            .toMatch(/^@AGENTS\.md$/m);
    });

    it('the agent filter can fail', () => {
        expect(['packages/ui/CLAUDE.md', '.claude/CLAUDE.md', '.claude/STATUS.md', 'tools/jira/jira.mjs']
            .every(isAgentMaterial)).toBe(true);
        expect(['CLAUDE.md', 'AGENTS.md', 'README.md', 'docs/CLAUDE-notes.md', 'tools/lang/italian-scan.mjs', 'claude.md.bak']
            .some(isAgentMaterial)).toBe(false);
    });
});

// Every document a published file cites is published too.
//
// The planning, review and audit documents live in `.internals/`, which is not published. A
// comment or a README that names one sends a reader to a file they cannot open. Two forms of
// citation are read: a path under `docs/` (which must exist as that path), and an upper-case
// document name such as `THEMING.md` or `CONTRIBUTING.md` (which must exist under that name
// somewhere in the tree — a package README cites its sibling without the directory).

const TEXT = /\.(md|ts|mjs|js|json|css|pdx|html|yml|yaml)$/;
const citing = published.filter(f => TEXT.test(f) && !isAgentMaterial(f)
    && !f.includes('/__snapshots__/') && !f.includes('/generated/')
    && f !== 'packages/core/tests/public-tree.test.ts');
const publishedPaths = new Set(published);
const publishedNames = new Set(published.map(f => f.slice(f.lastIndexOf('/') + 1)));

/**
 * The private agent files, cited by their path — `core/CLAUDE.md`, `.claude/STATUS.md`. They are
 * not published, so a comment that sends a reader to one sends them nowhere; AGENTS.md and
 * CONTRIBUTING.md hold what a contributor needs. The root CLAUDE.md, named bare, is the public one.
 */
const AGENT_CITATION = /(?:[\w.-]+\/)+CLAUDE\.md\b|\.claude\/[\w.-]+\.md\b/g;

/** Where a `docs/…md` is a value, not a citation: a URL the router test navigates to. */
const NOT_A_CITATION = new Set(['packages/router/tests/router-v2.test.ts']);

const DOCS_PATH = /(?<![\w/.-])docs\/[\w./-]+?\.md\b/g;
const DOC_NAME = /(?<![\w/-])[A-Z][A-Z0-9_-]{2,}\.md\b/g;

/** `docs/forms.md` is the site's `packages/site/content/docs/forms.md`: a suffix counts. */
function isPublishedPath(path: string): boolean {
    return publishedPaths.has(path) || published.some(f => f.endsWith(`/${path}`));
}

function unresolvedCitations(file: string, text: string): string[] {
    const out: string[] = [];
    if (NOT_A_CITATION.has(file)) return out;
    for (const [path] of text.matchAll(DOCS_PATH)) {
        if (!isPublishedPath(path)) out.push(`${file} → ${path}`);
    }
    for (const [name] of text.matchAll(DOC_NAME)) {
        if (!publishedNames.has(name)) out.push(`${file} → ${name}`);
    }
    for (const [agent] of text.matchAll(AGENT_CITATION)) out.push(`${file} → ${agent}`);
    return out;
}

describe('the repository cites only what it publishes', () => {
    it('found the files that cite — the list is not empty', () => {
        expect(citing.length, 'no text file was found').toBeGreaterThan(1000);
    });

    it('NO published file cites a document that is not published', () => {
        const dangling = citing.flatMap(f => unresolvedCitations(f, readFileSync(join(REPO, f), 'utf-8')));
        expect([...new Set(dangling)], 'these citations point outside the published tree').toEqual([]);
    });

    it('the citation reader can fail, and reads both forms', () => {
        expect(unresolvedCitations('x', 'see docs/NOT-A-DOC.md §2')).toEqual(['x → docs/NOT-A-DOC.md']);
        expect(unresolvedCitations('x', 'the plan (NOT-A-DOC.md M1)')).toEqual(['x → NOT-A-DOC.md']);
        expect(unresolvedCitations('x', 'docs/LICENSING.md, THEMING.md and the README.md')).toEqual([]);
        // A file the CLI writes for the user is not a citation of this tree; its neighbour still is.
        expect(unresolvedCitations('x', 'pdx new writes AGENTS.md, see AGENTS-PLAN.md')).toEqual(['x → AGENTS-PLAN.md']);
        expect(unresolvedCitations('x', 'as core/CLAUDE.md and .claude/STATUS.md say'))
            .toEqual(['x → core/CLAUDE.md', 'x → .claude/STATUS.md']);
        // The root CLAUDE.md is published: naming it is a citation that resolves.
        expect(unresolvedCitations('x', 'see CLAUDE.md and AGENTS.md')).toEqual([]);
    });
});

// What a stranger lands on.
//
// Every package that goes to npm carries a README — it is the page npm shows — and the root README
// sends a reader to the community files. A relative link in published markdown resolves to a
// published file: a README that links a moved document, or a file that was never written, is the
// first broken thing a new reader finds.

function packageJson(dir: string): { name?: string; private?: boolean } {
    return JSON.parse(readFileSync(join(REPO, dir, 'package.json'), 'utf-8'));
}

const packageDirs = published.filter(f => /^packages\/[^/]+\/package\.json$/.test(f))
    .map(f => f.slice(0, -'/package.json'.length));
const npmPackages = packageDirs.filter(d => !packageJson(d).private);

const COMMUNITY = ['CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'SUPPORT.md', 'CHANGELOG.md', 'LICENSE'];

const MD_LINK = /\]\((?!https?:|mailto:|#)([^)\s]+?)(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g;

function brokenLinks(file: string, text: string): string[] {
    const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    const out: string[] = [];
    for (const [, target] of text.matchAll(MD_LINK)) {
        const parts: string[] = [];
        for (const seg of (base + target).split('/')) {
            if (seg === '..') parts.pop(); else if (seg !== '.' && seg !== '') parts.push(seg);
        }
        const path = parts.join('/');
        const isDir = published.some(f => f.startsWith(`${path}/`));
        if (!publishedPaths.has(path) && !isDir) out.push(`${file} → ${target}`);
    }
    return out;
}

/** The markdown a reader of the repository opens: not the site's content, which the site routes. */
const readerMarkdown = published.filter(f => f.endsWith('.md') && !isAgentMaterial(f)
    && !f.startsWith('packages/site/content/') && !f.startsWith('marketplace/'));

describe('a stranger finds an open project', () => {
    it('found the packages — the list is not empty', () => {
        expect(npmPackages.length, 'no published package was found').toBeGreaterThan(5);
    });

    it('EVERY package that goes to npm has a README', () => {
        const missing = npmPackages.filter(d => !publishedPaths.has(`${d}/README.md`));
        expect(missing, 'these packages publish no README').toEqual([]);
    });

    it('the root README links the community files, and each one exists', () => {
        const readme = readFileSync(join(REPO, 'README.md'), 'utf-8').replace(/\r\n/g, '\n');
        expect(COMMUNITY.filter(f => !publishedPaths.has(f)), 'these files are missing').toEqual([]);
        expect(COMMUNITY.filter(f => !readme.includes(`](${f})`)), 'the README does not link these').toEqual([]);
    });

    it('NO relative link in the markdown a reader opens is broken', () => {
        const broken = readerMarkdown.flatMap(f => brokenLinks(f, readFileSync(join(REPO, f), 'utf-8')));
        expect(broken, 'these links lead nowhere').toEqual([]);
    });

    it('the link reader can fail', () => {
        expect(brokenLinks('packages/core/README.md', '[x](../design/README.md) [y](./NOPE.md) [z](https://a.b/c.md)'))
            .toEqual(['packages/core/README.md → ./NOPE.md']);
        expect(brokenLinks('README.md', '[l](docs/LICENSING.md#tiers "Tiers") [p](packages/core)')).toEqual([]);
    });
});

// The npm scope is @pdxui.
//
// The old scope belongs to someone else on npm: a publish under it would fail, or land under a name
// the project does not own. The old scope's name is assembled here rather than written out, so that
// a rename removing it cannot rewrite this guard too. `integrations/` is covered like the rest. The
// VS Code extension is not an npm package: it ships to the Marketplace under its own name.

const OLD_SCOPE = new RegExp(`@${'prag'}matic(?![.\\w-])`);
const NOT_ON_NPM = new Set(['packages/vscode-pdx']);
const PUBLIC_REPO = 'https://github.com/pragmatic-design/pdxui';
const PUBLIC_REPO_GIT = 'git+https://github.com/pragmatic-design/pdxui.git';

function oldScopeFiles(): string[] {
    return published.filter(f => f !== 'packages/core/tests/public-tree.test.ts'
        && !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|vsix)$/i.test(f))
        .filter(f => OLD_SCOPE.test(readFileSync(join(REPO, f), 'utf-8')));
}

// "Pragmatic Design UI" (the site's lockup, the builder's title) and "Pragmatic Design eXperience"
// (PDX spelled out) are the same product under two more names; "Pragmatic Design" alone is the
// organisation, and stays.
const OLD_PRODUCT_NAME = /Pragmatic UI|Pragmatic Design Web Components|Pragmatic\.Design\.UI|Pragmatic Design UI|Pragmatic Design eXperience/i;
const FRONT_DOOR = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md'];

/** What npm publishes and shows — description, README, sources — and the repository's front door. */
function oldProductNameFiles(): string[] {
    const pkgs = npmPackages.filter(d => !NOT_ON_NPM.has(d));
    const descriptions = pkgs.filter(d => OLD_PRODUCT_NAME.test(
        (packageJson(d) as { description?: string }).description ?? '')).map(d => `${d}/package.json`);
    const texts = published.filter(f => FRONT_DOOR.includes(f)
        || pkgs.some(d => f === `${d}/README.md` || (f.startsWith(`${d}/src/`) && TEXT.test(f))));
    return [...descriptions, ...texts.filter(f => OLD_PRODUCT_NAME.test(readFileSync(join(REPO, f), 'utf-8')))];
}

describe('the packages carry a scope the project owns', () => {
    it('EVERY package that goes to npm is named @pdxui/*', () => {
        const wrong = npmPackages.filter(d => !NOT_ON_NPM.has(d))
            .map(d => `${d}: ${packageJson(d).name}`).filter(s => !s.includes(': @pdxui/'));
        expect(wrong, 'these packages would publish under another scope').toEqual([]);
    });

    it('the npm packages are ready for a public release', () => {
        // One version for the set, as it moves together; public access, because a scoped package
        // publishes as restricted without it; `files`, because without it npm ships the folder,
        // sources and tests included.
        const pkgs = npmPackages.filter(d => !NOT_ON_NPM.has(d)).map(d => ({ d, m: packageJson(d) as {
            version?: string; files?: string[]; publishConfig?: { access?: string } } }));
        expect(pkgs.map(p => `${p.d}: ${p.m.version}`).filter(s => !s.endsWith(': 1.0.0-alpha.1')),
            'these packages are not at the release version').toEqual([]);
        expect(pkgs.filter(p => p.m.publishConfig?.access !== 'public').map(p => p.d),
            'these packages would publish as restricted').toEqual([]);
        expect(pkgs.filter(p => !Array.isArray(p.m.files) || p.m.files.length === 0).map(p => p.d),
            'these packages would publish their whole folder').toEqual([]);
    });

    it('NO published file names the old scope', () => {
        expect(oldScopeFiles(), 'these files still name the old scope').toEqual([]);
    });

    it('the npm packages point to the public repository', () => {
        // Without these npm shows a package with no source link and no place to report a bug.
        const pkgs = npmPackages.filter(d => !NOT_ON_NPM.has(d)).map(d => ({ d, m: packageJson(d) as {
            homepage?: string; bugs?: { url?: string };
            repository?: { type?: string; url?: string; directory?: string } } }));
        expect(pkgs.filter(p => p.m.repository?.url !== PUBLIC_REPO_GIT || p.m.repository?.directory !== p.d)
            .map(p => p.d), 'these packages do not name their place in the public repository').toEqual([]);
        expect(pkgs.filter(p => p.m.bugs?.url !== `${PUBLIC_REPO}/issues`).map(p => p.d),
            'these packages send bug reports nowhere').toEqual([]);
        expect(pkgs.filter(p => p.m.homepage !== 'https://pdxui.com').map(p => p.d),
            'these packages have no homepage').toEqual([]);
    });

    it('the npm packages and the front door call the product PDX UI', () => {
        // npm shows a package's description and README; `pdx --help` prints the CLI's. None of them
        // may say "Pragmatic UI", "Pragmatic Design Web Components" or "Pragmatic.Design.UI" for a
        // product the scope, the site and the trademark line call PDX UI. "Pragmatic" alone is the author.
        expect(oldProductNameFiles(), 'these files still name the product the old way').toEqual([]);
    });

    it('NO published file names the product the old way', () => {
        // The site, the skills, the showcase, the integrations and the docs too, not only the npm
        // packages. This file is the one exception: it holds the names it looks for.
        const old = published.filter(f => f !== 'packages/core/tests/public-tree.test.ts'
            && !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|vsix)$/i.test(f))
            .filter(f => OLD_PRODUCT_NAME.test(readFileSync(join(REPO, f), 'utf-8')));
        expect(old, 'these files still name the product the old way').toEqual([]);
    });

    it('the product-name reader can fail, and leaves the author alone', () => {
        expect(OLD_PRODUCT_NAME.test('Reactive core for Pragmatic UI — signals')).toBe(true);
        expect(OLD_PRODUCT_NAME.test('# Pragmatic.Design.UI')).toBe(true);
        expect(OLD_PRODUCT_NAME.test('Pragmatic Design Web Components — button')).toBe(true);
        expect(OLD_PRODUCT_NAME.test('<title>PDX Theme Builder — Pragmatic Design UI</title>')).toBe(true);
        expect(OLD_PRODUCT_NAME.test('PDX — Pragmatic Design eXperience — is a')).toBe(true);
        expect(OLD_PRODUCT_NAME.test('<span aria-label="Pragmatic Design"></span>')).toBe(false);
        expect(OLD_PRODUCT_NAME.test('"Pragmatic" and "PDX UI" are trademarks')).toBe(false);
    });

    it('the scope reader can fail, and leaves an e-mail address alone', () => {
        expect(OLD_SCOPE.test(`import '@${'prag'}matic/core'`)).toBe(true);
        expect(OLD_SCOPE.test(`join(root, 'node_modules', '@${'prag'}matic')`)).toBe(true);
        expect(OLD_SCOPE.test(`value="alex@${'prag'}matic.dev"`)).toBe(false);
        expect(OLD_SCOPE.test(`import '@pdxui/core'`)).toBe(false);
    });
});

// Everything is MIT.
//
// Every package, and every app in the repository, is MIT: no source-available licence, no
// commercial tiers. The old licence's name is assembled, so that a rename removing it cannot rewrite
// this guard too.

const OLD_LICENCE = new RegExp(`poly${'form'}`, 'i');
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|vsix)$/i;

function oldLicenceFiles(): string[] {
    return published.filter(f => !BINARY.test(f) && f !== 'packages/core/tests/public-tree.test.ts')
        .filter(f => OLD_LICENCE.test(readFileSync(join(REPO, f), 'utf-8')));
}

describe('everything in the repository is MIT', () => {
    it('NO published file names the old licence', () => {
        expect(oldLicenceFiles(), 'these files still name the old licence').toEqual([]);
    });

    it('EVERY package declares the MIT licence', () => {
        const other = packageDirs.map(d => `${d}: ${(packageJson(d) as { license?: string }).license}`)
            .filter(s => !s.endsWith(': MIT'));
        expect(other, 'these packages declare another licence').toEqual([]);
    });

    it('the licence reader can fail', () => {
        expect(OLD_LICENCE.test(`${'Poly'}Form Small Business 1.0.0`)).toBe(true);
        expect(OLD_LICENCE.test('MIT License')).toBe(false);
    });
});

// What the single-commit export to the public repository carries.
//
// The export is `git archive HEAD`: the tree as it is, without its history. So the tree must not
// send a reader to the maintainer's machine or notes, must not keep baselines that nothing
// compares against, and must leave out what is not ready to be public yet.

const TEXT_FILE = /\.(md|ts|mjs|cjs|js|json|css|pdx|html|yml|yaml|txt)$/;
const exportedText = published.filter(f => TEXT_FILE.test(f) && !isAgentMaterial(f)
    && f !== 'packages/core/tests/public-tree.test.ts');

/** A file under `.internals/`, cited by name: the notes are not published, so the path leads nowhere. */
const INTERNALS_CITATION = /\.internals\/[\w.-]+\.\w+/g;
/** A path on the maintainer's machine, or the lab next to the repository. */
const LOCAL_PATH = /C:[\\/]+Pragmatic\b|\/c\/Pragmatic\b|Pragmatic[\\/]examples\b/gi;
/** A personal mailbox. The project's own address is info@pragmaticdesign.net. */
const PERSONAL_MAIL = /[\w.+-]+@(gmail|outlook|hotmail|yahoo|icloud)\.com/gi;

function matchesIn(re: RegExp): string[] {
    return exportedText.flatMap(f => [...readFileSync(join(REPO, f), 'utf-8').matchAll(re)].map(m => `${f} → ${m[0]}`));
}

/** A baseline directory and the spec it belongs to: `x.spec.ts-snapshots/`, `__screenshots__/x.spec.ts/`, `__snapshots__/x.test.ts.snap`. */
function specOf(file: string): string | null {
    let m = /^(.*\/)([^/]+\.(?:spec|test)\.[cm]?[jt]sx?)-snapshots\//.exec(file);
    if (m) return m[1] + m[2];
    m = /^(.*\/)__screenshots__\/([^/]+\.(?:spec|test)\.[cm]?[jt]sx?)\//.exec(file);
    if (m) return m[1] + m[2];
    m = /^(.*\/)__snapshots__\/([^/]+\.(?:spec|test)\.[cm]?[jt]sx?)\.snap$/.exec(file);
    if (m) return m[1] + m[2];
    return null;
}

/** The files a package script runs with `node`, resolved against the directory it runs in (`cd x &&` moves it). */
function scriptFiles(pkgDir: string, cmd: string): string[] {
    let cwd = pkgDir;
    const out: string[] = [];
    for (const part of cmd.split('&&')) {
        const cd = /^\s*cd\s+(\S+)\s*$/.exec(part);
        if (cd) { cwd = posix.normalize(`${cwd}${cd[1]}/`); continue; }
        for (const m of part.matchAll(/\bnode\s+(?:--[\w-]+(?:=\S+)?\s+)*([\w./-]+\.(?:m?js|cjs|ts))\b/g)) {
            out.push(posix.normalize(`${cwd}${m[1]}`));
        }
    }
    return out;
}

describe('the export carries the project, and only the project', () => {
    it('found the files to scan — the list is not empty', () => {
        expect(exportedText.length, 'no text file was found').toBeGreaterThan(1000);
    });

    it('NO published file cites a note under .internals/', () => {
        expect(matchesIn(INTERNALS_CITATION), 'these cite notes that are not published').toEqual([]);
    });

    it('NO published file names a path on the maintainer\'s machine', () => {
        expect(matchesIn(LOCAL_PATH), 'these name a local path').toEqual([]);
    });

    it('NO published file carries a personal mailbox', () => {
        expect(matchesIn(PERSONAL_MAIL), 'these carry a personal address').toEqual([]);
    });

    it('EVERY baseline belongs to a spec that exists', () => {
        const orphans = [...new Set(published.map(f => [f, specOf(f)] as const)
            .filter(([, spec]) => spec !== null && !publishedPaths.has(spec))
            .map(([, spec]) => spec as string))];
        expect(orphans, 'baselines of these specs remain, and the specs are gone').toEqual([]);
    });

    it('integrations/ is exported, and installs from the public registry', () => {
        // Its three apps install @pdxui/* from npm, as a stranger would, so the export carries them;
        // an app that resolved from a local registry would not install from the export.
        const attr = execFileSync('git', ['check-attr', 'export-ignore', 'integrations', 'integrations/README.md'], { cwd: REPO, encoding: 'utf-8' });
        expect(attr.trim().split(/\r?\n/), 'git archive would leave integrations/ out').toEqual([
            'integrations: export-ignore: unspecified',
            'integrations/README.md: export-ignore: unspecified',
        ]);
        const local = published.filter(f => f.startsWith('integrations/')).filter(f => /(^|\/)\.npmrc$/.test(f)
            || /localhost:4873|verdaccio/i.test(readFileSync(join(REPO, f), 'utf-8')));
        expect(local, 'these point an app at a local registry').toEqual([]);
    });

    /**
     * A clean clone has to build. A script renamed while `build` still calls the old name fails
     * `pnpm build` at the first package, and no gate runs the build, so nothing else sees it.
     */
    it('EVERY script a package runs with node exists', () => {
        const missing = published.filter(f => /(^|\/)package\.json$/.test(f))
            .flatMap(f => {
                const scripts = (JSON.parse(readFileSync(join(REPO, f), 'utf-8')).scripts ?? {}) as Record<string, string>;
                return Object.entries(scripts).flatMap(([name, cmd]) =>
                    scriptFiles(f.slice(0, -'package.json'.length), cmd)
                        .filter(p => !publishedPaths.has(p))
                        .map(p => `${f} "${name}" → ${p}`));
            });
        expect(missing, 'these package scripts run a file that does not exist').toEqual([]);
    });

    /**
     * The root declares no TypeScript, so `pnpm exec tsc` at the root runs whatever tsc the
     * machine has: a stale 5.9 left in the root's node_modules, or in a clean clone a global
     * TypeScript 6, which turns unresolved side-effect imports into errors: 90 of them, on the CSS
     * each component imports. Each `tsc -p` runs with the TypeScript
     * of the package that owns the tsconfig.
     */
    it('NO root script runs a tsc the root does not declare', () => {
        const root = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf-8')) as {
            scripts: Record<string, string>; devDependencies?: Record<string, string> };
        if (root.devDependencies?.typescript) return;
        const loose = Object.entries(root.scripts).filter(([, cmd]) => /(^|&&\s*)pnpm exec tsc\b/.test(cmd)).map(([n]) => n);
        expect(loose, 'these root scripts run an undeclared tsc').toEqual([]);
    });

    it('the script reader follows a cd, and can fail', () => {
        expect(scriptFiles('packages/vscode-pdx/', 'cd ../lsp && node build.mjs')).toEqual(['packages/lsp/build.mjs']);
        expect(scriptFiles('packages/design/', 'node scripts/a.mjs && node --no-warnings b.ts')).toEqual(['packages/design/scripts/a.mjs', 'packages/design/b.ts']);
        expect(scriptFiles('packages/x/', 'node -e "1"')).toEqual([]);
    });

    it('the readers can fail', () => {
        const at = (re: RegExp, s: string) => [...s.matchAll(re)].length;
        expect(at(INTERNALS_CITATION, 'see .internals/tree-view.md')).toBe(1);
        expect(at(INTERNALS_CITATION, '.internals/\n.internals/**')).toBe(0);
        expect(at(LOCAL_PATH, 'C:\\Pragmatic\\examples and C:/Pragmatic/x')).toBe(2);
        expect(at(LOCAL_PATH, "'C:\\\\work\\\\app\\\\a.pdx'")).toBe(0);
        expect(at(PERSONAL_MAIL, '"email": "someone@gmail.com"')).toBe(1);
        expect(at(PERSONAL_MAIL, 'info@pragmaticdesign.net')).toBe(0);
        expect(specOf('a/x.spec.ts-snapshots/b-win32.png')).toBe('a/x.spec.ts');
        expect(specOf('a/__screenshots__/v.spec.ts/c.png')).toBe('a/v.spec.ts');
        expect(specOf('a/__snapshots__/g.test.ts.snap')).toBe('a/g.test.ts');
        expect(specOf('a/b.ts')).toBeNull();
    });
});

// The published tree carries no issue-tracker key, no finding of an internal review and no link to a
// private session.
//
// The public repository is read by people who cannot open the tracker or the review, so a key in a
// comment or a test title points nowhere; and a session link is private. The key's pattern is assembled, so that
// this file, which is published too, does not match itself.
//
// The areas not yet cleaned are listed, and the list may only shrink: an area that is already clean
// and still listed fails too, so the guard tightens with every area that is done.

// One definition, shared with the commit-message check: the files and the history refuse the same.
import { TRACKER_KEY, SESSION_LINK, REVIEW_REF } from '../../../scripts/lib/tracker-reference.mjs';

/** The area a file belongs to, as the hygiene work divides the tree. */
function areaOf(file: string): string {
    const m = /^(packages\/[^/]+|marketplace)\//.exec(file);
    return m ? m[1] : 'root';
}

/** Areas still to be cleaned. Remove an entry when its area is done; never add one. */
const NOT_YET_CLEAN = new Set<string>([]);

/** Published text files that carry a tracker key or a session link, by area. */
function trackerHitsByArea(): Map<string, string[]> {
    const hits = new Map<string, string[]>();
    for (const f of exportedText) {
        const text = readFileSync(join(REPO, f), 'utf-8');
        if (!TRACKER_KEY.test(text) && !SESSION_LINK.test(text) && !REVIEW_REF.test(text)) continue;
        const area = areaOf(f);
        hits.set(area, [...(hits.get(area) ?? []), f]);
    }
    return hits;
}

describe('the published tree names no tracker key and no private session', () => {
    const hits = trackerHitsByArea();

    it('NO file outside the areas still being cleaned carries one', () => {
        const outside = [...hits].filter(([area]) => !NOT_YET_CLEAN.has(area)).flatMap(([, files]) => files);
        expect(outside, 'remove the key, or the account of history it stands for').toEqual([]);
    });

    it('NO area is listed as not yet clean once it is clean: the list only shrinks', () => {
        const stale = [...NOT_YET_CLEAN].filter((area) => !hits.has(area));
        expect(stale, 'these areas are clean: take them off NOT_YET_CLEAN').toEqual([]);
    });

    it('the readers can fail', () => {
        expect(TRACKER_KEY.test(`see ${'PDX'}UI-849`)).toBe(true);
        expect(TRACKER_KEY.test('the @pdxui scope, PDX UI, pdxui-setup')).toBe(false);
        expect(SESSION_LINK.test(`${'Claude'}-Session: https://claude.ai/${'code'}/session_x`)).toBe(true);
        expect(REVIEW_REF.test(`a stale time (review ${'F'}81)`)).toBe(true);
        expect(REVIEW_REF.test(`describe('${'L'}-143 — the panel survives')`)).toBe(true);
        expect(REVIEW_REF.test('Shift+F10 opens it; F11 and F12 too')).toBe(false);
        expect(REVIEW_REF.test('a heading that is not one (CD-B1)')).toBe(false);
        expect(REVIEW_REF.test(`stale indexes (${'F'}12)`)).toBe(true);
        expect(REVIEW_REF.test(`// review ${'F'}2/${'F'}11 — remount`)).toBe(true);
        expect(areaOf('packages/ui/src/x.ts')).toBe('packages/ui');
        expect(areaOf('marketplace/plugins/a.md')).toBe('marketplace');
        expect(areaOf('README.md')).toBe('root');
        expect(areaOf('docs/architecture/core.md')).toBe('root');
    });
});
