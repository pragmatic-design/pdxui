// Every .pdx of the showcase, opened through the language server over stdio, carries no FALSE
// TypeScript error.
//
// The showcase is the reference app: it builds and its suites pass, so a type error the editor
// reports in its files is the editor's — a TypeScript lib not found outside the folder's own
// node_modules, a rune declared differently from what the compiler takes (`$derived` takes a value,
// not a function; `$event` is not a bare Event), a rune left in the projected code as text, a
// declaration the compiler hoists reported as used before being declared. Only a real app opened
// through the server shows them.
//
// The showcase's OWN type errors are real ones, invisible because tsc does not read a .pdx, and the
// showcase has none. So there is no allow-list: any error here is either a false one, which is an
// editor bug, or a real one in the reference app, which is the app's to fix.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';
import { startServer, type StdioServer } from './stdio-harness';

const SHOWCASE = join(__dirname, '..', '..', 'showcase');
/** How long the sweep waits on the server before giving up; the test's timeout is ten seconds more. */
const SWEEP_MS = 110_000;

function pdxFilesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...pdxFilesUnder(full));
        else if (name.endsWith('.pdx')) out.push(full);
    }
    return out;
}

let server: StdioServer;
beforeAll(async () => { server = await startServer(SHOWCASE); }, 60_000);
afterAll(() => server?.stop());

describe('the showcase, opened in the editor', () => {
    it('reports no TypeScript error', async () => {
        const files = pdxFilesUnder(join(SHOWCASE, 'src'));
        expect(files.length, 'the sweep found no file to open').toBeGreaterThan(40);

        const found: string[] = [];
        // Given up on before the test's own timeout, the sweep fails naming the file it had reached:
        // the timeout alone read the same for a slow server as for a dead one (#1184). A server that
        // exits fails the sweep at once, through the harness.
        const giveUp = setTimeout(() => server.giveUp(`the sweep did not finish in ${SWEEP_MS / 1000} s`), SWEEP_MS);
        try {
            for (const file of files) {
                const published = await server.openAndDiagnose(pathToFileURL(file).href, readFileSync(file, 'utf-8'));
                // No line number in the key: an edit that moves lines is not a new error.
                for (const d of published.filter(d => d.source === 'pdx-ts')) {
                    found.push(`${relative(SHOWCASE, file).split('\\').join('/')} ${d.code} ${d.message.split('\n')[0]}`);
                }
            }
        } finally {
            clearTimeout(giveUp);
        }
        expect(found, 'type errors in the showcase — a false one is an editor bug').toEqual([]);
    }, SWEEP_MS + 10_000);
});
