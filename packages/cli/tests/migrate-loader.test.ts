// `pdx migrate` and the named route loader (#506).
//
// The anonymous `@loader loadUser;` is named after its function, the page's `currentLoaderData()` and
// `currentLoaderState()` become that name's `data()` and `state()`, and a loader reading `location` is
// flagged. A second run changes nothing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../src/commands/migrate';
import { removeTree } from './remove-tree';

let root: string;
const file = (rel: string, text: string) => {
    const path = join(root, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text, 'utf-8');
};
const read = (rel: string) => readFileSync(join(root, rel), 'utf-8');

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pdx-migrate-loader-')); });
afterEach(() => { removeTree(root); });

const PAGE = [
    "<template><p>{{ currentLoaderState() === 'done' ? currentLoaderData().name : '' }}</p></template>",
    '<script>',
    "@page '/users/:id';",
    '@loader loadUser;',
    'async function loadUser() {',
    "  return fetch('/api' + location.pathname);",
    '}',
    '</script>',
    '',
].join('\n');

describe('pdx migrate — the named route loader (#506)', () => {
    it('names the loader after its function and rewrites its readers', async () => {
        file('src/pages/user.pdx', PAGE);
        const report = await migrate(['.'], { cwd: root });
        const out = read('src/pages/user.pdx');
        expect(out).toContain('\n@loader loadUser: loadUser;\n');
        expect(out).toContain("{{ loadUser.state() === 'success' ? loadUser.data().name : '' }}");
        expect(report.changed.map((c) => c.id)).toEqual(expect.arrayContaining(['loader-anonymous', 'loader-readers']));
    });

    it('flags the loader that reads location, at its line', async () => {
        file('src/pages/user.pdx', PAGE);
        const report = await migrate(['.'], { cwd: root });
        expect(report.flagged.map((f) => [f.line, f.id, f.found])).toEqual([[6, 'loader-reads-address', 'location.']]);
    });

    it('a second run changes nothing', async () => {
        file('src/pages/user.pdx', PAGE);
        await migrate(['.'], { cwd: root });
        const once = read('src/pages/user.pdx');
        const report = await migrate(['.'], { cwd: root });
        expect(read('src/pages/user.pdx')).toBe(once);
        expect(report.changed).toEqual([]);
    });

    it('flags an import of the removed readers in a module', async () => {
        file('src/user-header.ts', "import { currentLoaderData } from '@pdxui/router';\nexport const name = () => currentLoaderData();\n");
        const report = await migrate(['.'], { cwd: root });
        expect(report.flagged.map((f) => f.id)).toEqual(['export:@pdxui/router:currentLoaderData']);
    });
});
