// `pdx analyze` is the project manifest an agent reads: the tag each file registers, the route
// table, and a form that prints to stdout.
//
// The tag is the compiler's, not a filename rule of its own (`App.pdx` → `pdx-App` is no element
// name a browser accepts); the `routes` its schema declares are filled.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import analyzeCmd from '../src/commands/analyze';

type Runnable = { run: (c: { args: Record<string, unknown> }) => Promise<void> };
interface Manifest {
    components: { tag: string; file: string }[];
    routes?: { path: string; file: string; tag: string; guard?: string; layout?: string }[];
}

let sandbox: string;
let printed: string;

beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pdx-analyze-'));
    mkdirSync(join(sandbox, 'src', 'pages'), { recursive: true });
    printed = '';
    vi.spyOn(process, 'cwd').mockReturnValue(sandbox);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
        printed += String(chunk);
        return true;
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sandbox, { recursive: true, force: true });
});

const write = (rel: string, src: string) => writeFileSync(join(sandbox, rel), src);
const json = async (): Promise<Manifest> => {
    await (analyzeCmd as unknown as Runnable).run({ args: { json: true } });
    return JSON.parse(printed) as Manifest;
};

describe('pdx analyze', () => {
    it('names a component by the tag the compiler registers: App.pdx is pdx-app', async () => {
        write('src/App.pdx', '<template><p>app</p></template>\n');
        const manifest = await json();
        expect(manifest.components.map((c) => c.tag)).toEqual(['pdx-app']);
    });

    it('fills routes[] from the @page components, sorted by path', async () => {
        write('src/pages/users.pdx', '<template><p>u</p></template>\n<script setup>\n@page \'/users\';\n@guard \'users.read\';\n</script>\n');
        write('src/pages/home.pdx', '<template><p>h</p></template>\n<script setup>\n@page \'/\';\n</script>\n');
        write('src/card.pdx', '<template><p>not a page</p></template>\n');
        const { routes } = await json();
        expect(routes?.map((r) => [r.path, r.tag, r.file.replace(/\\/g, '/')])).toEqual([
            ['/', 'pdx-home', 'src/pages/home.pdx'],
            ['/users', 'pdx-users', 'src/pages/users.pdx'],
        ]);
        expect(routes?.[1].guard).toBe('users.read');
    });

    it('--json prints the manifest and writes no file', async () => {
        write('src/hello.pdx', '<template><p>hi</p></template>\n');
        const manifest = await json();
        expect(manifest.components).toHaveLength(1);
        expect(readdirSync(sandbox).filter((f) => f.endsWith('.json')), 'a file was written').toEqual([]);
        expect(existsSync(join(sandbox, 'pdx-manifest.json'))).toBe(false);
    });

    it('control — --out still writes the file, and prints no manifest', async () => {
        write('src/hello.pdx', '<template><p>hi</p></template>\n');
        await (analyzeCmd as unknown as Runnable).run({ args: { out: 'pdx-manifest.json' } });
        expect(existsSync(join(sandbox, 'pdx-manifest.json'))).toBe(true);
        expect(printed).not.toContain('"components"');
    });
});
