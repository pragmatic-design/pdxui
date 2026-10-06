// Nothing unexpected may live under a directory a package ships.
//
// `.gitignore` does not govern npm packaging. `@pdxui/ui` declares `files: ["dist","src"]`, and
// `packages/ui/src/.agentflow/` held 2 MB of agent conversation logs — ignored by git, invisible to
// `git status`, and included in the tarball. Measured with `npm pack --dry-run`: 1.4 MB of `.jsonl`
// and 603 kB of `.md`, in a package whose whole tarball was 1.2 MB. Deleting them took it to 711 kB.
//
// This does NOT run `npm pack`: two packages took over two minutes, which is not a price a suite can
// pay on every run. It asserts something narrower and stricter instead — that the source tree under
// a shipped directory contains only the kinds of file that belong there. npm cannot pack what is not
// on disk, so a clean tree is a sufficient condition for a clean tarball, even though it is not the
// same statement.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const PACKAGES = join(__dirname, '..', '..');

/** File kinds a published package legitimately ships. */
const ALLOWED_EXT = new Set([
    '.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json', '.css', '.map',
    '.md', '.html', '.svg', '.woff', '.woff2', '.d',
]);
// `.d.mts` and `.d.cts` are what unbuild emits for @pdxui/cli — declarations, not strays.
/** Named files with no extension, or whose extension is misleading. */
const ALLOWED_NAMES = new Set([
    'LICENSE', 'README', 'CHANGELOG',
    // @pdxui/cli ships the site's documentation beside it: `pdx mcp`'s `docs` tool answers from it,
    // the docs of the CLI's own version. By name, so a stray .txt still fails.
    'llms-full.txt',
]);

interface Offender { pkg: string; path: string; why: string }

function scanShipped(): { packages: string[]; offenders: Offender[] } {
    const offenders: Offender[] = [];
    const names: string[] = [];

    for (const e of readdirSync(PACKAGES, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const dir = join(PACKAGES, e.name);
        const jsonPath = join(dir, 'package.json');
        if (!existsSync(jsonPath)) continue;
        const pkg = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, unknown>;
        if (pkg.private === true) continue;
        const files = pkg.files as string[] | undefined;
        if (!files) continue;
        names.push(String(pkg.name));

        for (const entry of files) {
            const root = join(dir, entry.replace(/\/$/, ''));
            if (!existsSync(root) || !statSync(root).isDirectory()) continue;
            const walk = (d: string, rel: string) => {
                for (const f of readdirSync(d, { withFileTypes: true })) {
                    const p = join(d, f.name);
                    const r = rel ? `${rel}/${f.name}` : f.name;
                    if (f.isDirectory()) {
                        // A dot-directory under a shipped folder is never intentional: it is tooling
                        // state that git hides and npm does not.
                        if (f.name.startsWith('.')) {
                            offenders.push({ pkg: String(pkg.name), path: `${entry}/${r}`, why: 'hidden directory' });
                            continue;
                        }
                        walk(p, r);
                        continue;
                    }
                    const ext = extname(f.name);
                    const base = f.name.replace(ext, '');
                    if (ALLOWED_NAMES.has(base) || ALLOWED_NAMES.has(f.name)) continue;
                    if (!ALLOWED_EXT.has(ext)) {
                        offenders.push({ pkg: String(pkg.name), path: `${entry}/${r}`, why: `extension ${ext || '(none)'}` });
                    }
                }
            };
            walk(root, '');
        }
    }
    return { packages: names, offenders };
}

describe('what a package ships', () => {
    const { packages, offenders } = scanShipped();

    it('finds packages that declare a files list', () => {
        // A zero here would make the assertion below pass by scanning nothing.
        expect(packages.length).toBeGreaterThan(2);
    });

    it('ships no hidden directory and no unexpected file type', () => {
        expect(
            offenders.map(o => `${o.pkg}  ${o.path}  (${o.why})`),
            'these live under a shipped directory and would go into the tarball',
        ).toEqual([]);
    });
});
