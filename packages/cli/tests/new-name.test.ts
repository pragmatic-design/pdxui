// The same positional argument was a name in two branches and a path in the third.
//
// `pdx new` declares `name` as "Name (kebab-case)". For `component` and `page` it goes through
// `toKebab()`, which reduces it to [a-z0-9-] and so cannot contain a path separator. For `project` it
// was used raw — as a filesystem path (`resolve(baseDir, name)`) and as the npm `"name"` field.
//
// This is NOT a vulnerability: the argument is typed by the person running the command, and several
// scaffolders deliberately take a path. It is an inconsistency, and the question it raises is which
// of the two the argument is. `pdx new` already has `--dir` for "where", so the positional is "what
// to call it" — a path there would duplicate `--dir` and contradict the description. So: a name, in
// all three branches.
//
// The escape case writes into a directory NESTED inside the temp root on purpose, so that a red run
// (which really does write outside the root) still cannot touch anything but the scratch area.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import newCmd from '../src/commands/new';

/** npm's rule, the part a generated name can violate: lowercase, URL-safe, not starting . or _ */
const NPM_NAME = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

let sandbox: string;
let root: string;

beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pdx-new-'));
    // Two levels down, so `../../x` lands inside the sandbox and never outside it.
    root = join(sandbox, 'a', 'b');
    mkdirSync(root, { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sandbox, { recursive: true, force: true });
});

async function run(type: string, name: string, dir = root): Promise<void> {
    await (newCmd as { run: (c: { args: Record<string, string> }) => Promise<void> })
        .run({ args: { type, name, dir } });
}

describe('pdx new project — the name is a name in every branch', () => {
    it('writes nothing outside the output directory', async () => {
        await run('project', '../../Escaped');
        // The sibling levels must be untouched: only `b` (the output dir) may have gained anything.
        expect(readdirSync(join(sandbox, 'a')).sort()).toEqual(['b']);
        expect(readdirSync(sandbox).sort()).toEqual(['a']);
    });

    it('generates a package.json name npm would accept', async () => {
        await run('project', '../../My Project');
        const dirs = readdirSync(root);
        expect(dirs, 'nothing was scaffolded').toHaveLength(1);
        const pkg = JSON.parse(readFileSync(join(root, dirs[0], 'package.json'), 'utf-8')) as { name: string };
        expect(pkg.name, `"${pkg.name}" is not a valid npm package name`).toMatch(NPM_NAME);
    });

    it('names the directory the same thing it names the package', async () => {
        // Two answers to "what is this project called" is how the two drift apart.
        await run('project', 'My Cool App');
        const dirs = readdirSync(root);
        expect(dirs).toEqual(['my-cool-app']);
        const pkg = JSON.parse(readFileSync(join(root, 'my-cool-app', 'package.json'), 'utf-8')) as { name: string };
        expect(pkg.name).toBe('my-cool-app');
    });

    it('still scaffolds a working shape for an ordinary name', async () => {
        // The fix must sanitise, not reject everything.
        await run('project', 'shop-front');
        for (const f of ['package.json', 'index.html', 'vite.config.ts', join('src', 'App.pdx')]) {
            expect(existsSync(join(root, 'shop-front', f)), f).toBe(true);
        }
    });
});

describe('the other two branches agree with it', () => {
    it('component: a name with separators becomes one file in the output dir', async () => {
        await run('component', '../../Evil Widget');
        expect(readdirSync(join(sandbox, 'a')).sort()).toEqual(['b']);
        expect(readdirSync(root)).toEqual(['evil-widget.pdx']);
    });

    it('page: same, under src/routes', async () => {
        await run('page', '../../Evil Page');
        expect(readdirSync(join(sandbox, 'a')).sort()).toEqual(['b']);
        expect(readdirSync(join(root, 'src', 'routes'))).toEqual(['evil-page.pdx']);
    });
});

describe('what ends up INSIDE the generated files', () => {
    it('does not carry the raw argument into the title and the signal', async () => {
        // toPascal on the raw argument would turn '../../Evil Widget' into '../../EvilWidget', and
        // write it into <title> and into `$signal('...')` in App.pdx. Deriving it from the
        // sanitised name keeps the content clean as well as the path.
        await run('project', '../../Evil Widget');
        const html = readFileSync(join(root, 'evil-widget', 'index.html'), 'utf-8');
        const app = readFileSync(join(root, 'evil-widget', 'src', 'App.pdx'), 'utf-8');
        expect(html).toContain('<title>EvilWidget</title>');
        expect(app).toContain("$signal('EvilWidget')");
        expect(html).not.toContain('..');
    });
});

describe('a name with nothing usable in it', () => {
    it('is refused instead of scaffolding into the output directory itself', async () => {
        // '...' sanitises to '', and resolve(dir, '') is `dir`: the project would be scaffolded
        // ON TOP of --dir rather than inside a folder of its own.
        const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
            throw new Error('exit');
        }) as never);
        await expect(run('project', '...')).rejects.toThrow('exit');
        expect(exit).toHaveBeenCalledWith(1);
        expect(readdirSync(root)).toEqual([]);
    });
});
