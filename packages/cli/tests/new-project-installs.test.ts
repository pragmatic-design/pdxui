// `pdx new project` scaffolds a project that installs, runs its own scripts and renders styled.
//
// Each part can break it: a version range no published release matches installs nothing; scripts
// that call `pdx` without `@pdxui/cli` among the dependencies leave `npm run check` — the command
// its own AGENTS.md tells an agent to run — without a CLI; a missing stylesheet import renders
// unstyled; and an index.html that loads App.pdx without placing `<pdx-app>` is a blank page.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '@pdxui/compiler';
import newCmd from '../src/commands/new';

type Runnable = { run: (c: { args: Record<string, unknown> }) => Promise<void> };

const CLI_PKG = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as { version: string; peerDependencies: Record<string, string> };

let sandbox: string;
beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pdx-new-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sandbox, { recursive: true, force: true });
});

async function scaffold(): Promise<string> {
    await (newCmd as unknown as Runnable).run({ args: { type: 'project', name: 'shop', dir: sandbox } });
    return join(sandbox, 'shop');
}

describe('pdx new project', () => {
    it('names every @pdxui package at the CLI\'s own version, the CLI among them', async () => {
        const pkg = JSON.parse(readFileSync(join(await scaffold(), 'package.json'), 'utf-8')) as {
            scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string>;
        };
        const range = `^${CLI_PKG.version}`;
        // @pdxui/design because index.html imports it by name: reached only through @pdxui/framework,
        // a strict installer (pnpm) does not resolve it.
        expect(pkg.dependencies).toEqual({ '@pdxui/framework': range, '@pdxui/design': range });
        expect(pkg.devDependencies).toEqual({ '@pdxui/cli': range, '@pdxui/compiler': range, vite: CLI_PKG.peerDependencies.vite });
        // Every script calls the CLI the project now depends on.
        for (const script of Object.values(pkg.scripts)) expect(script).toMatch(/^pdx /);
    });

    it('imports the design system\'s base and one theme, and places the app element it loads', async () => {
        const html = readFileSync(join(await scaffold(), 'index.html'), 'utf-8');
        // Base plus the theme that applies with no pdx-theme attribute; each component brings its
        // own CSS. The full sheet — every component and all 13 themes — is not a starter's to pay.
        expect(html).toContain("import '@pdxui/design/base';");
        expect(html).toContain("import '@pdxui/design/themes/neutral';");
        expect(html).not.toContain('@pdxui/framework/css');
        expect(html).not.toMatch(/<html[^>]*pdx-theme=/);
        // App.pdx is <pdx-app>: loaded and never placed, it rendered nothing.
        expect(html).toContain('<pdx-app></pdx-app>');
        expect(html).toContain("import './src/App.pdx';");
        // The tokens' light-dark() needs a scheme on <html> to resolve.
        expect(html).toMatch(/<html[^>]*pdx-scheme="light"/);
    });

    it('the app\'s own styles use the design system\'s tokens, not a colour literal', async () => {
        const app = readFileSync(join(await scaffold(), 'src', 'App.pdx'), 'utf-8');
        expect(app).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });

    it('its App.pdx compiles with no warning', async () => {
        const file = join(await scaffold(), 'src', 'App.pdx');
        const { warnings } = compile(readFileSync(file, 'utf-8'), file);
        expect(warnings.map(w => `${w.code}: ${w.message}`)).toEqual([]);
    });
});
