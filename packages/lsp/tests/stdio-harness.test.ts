// The stdio harness says what happened to the server it waits on (#1184).
//
// It swallowed the server's exit after the handshake, so a server that crashed mid-sweep left every
// pending openAndDiagnose waiting, and showcase-sweep sat silent until its 120 s timeout. It hit
// exactly 120 s three times (#991), and nothing said whether the server was slow or dead. Two planted
// servers, run as the harness runs a shipped one: one exits on its first file, one never answers.

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { startServer, type StdioServer } from './stdio-harness';

const SERVERS = join(__dirname, 'fixtures', 'servers');
const ROOT = join(__dirname, 'fixtures');
const FILE = pathToFileURL(join(ROOT, 'planted-page.pdx')).href;

let server: StdioServer | undefined;

afterEach(() => {
    server?.stop();
    server = undefined;
});

describe('a server that exits mid-sweep', () => {
    it('fails the pending call at once, with the file, the exit code and the server\'s stderr', async () => {
        server = await startServer(ROOT, undefined, join(SERVERS, 'exits-on-open.cjs'));
        // Before #1184 this never settled: the test's own timeout was the only end.
        const error = await server.openAndDiagnose(FILE, '<template></template>').then(() => null, (e: Error) => e);
        expect(error, 'the call resolved although the server exited').toBeInstanceOf(Error);
        expect(error!.message).toContain('exited with code 3');
        expect(error!.message).toContain(FILE);
        expect(error!.message).toContain('planted: the server gives up on its first file');
    }, 10_000);

    it('a call made after the exit fails too, instead of waiting', async () => {
        server = await startServer(ROOT, undefined, join(SERVERS, 'exits-on-open.cjs'));
        await server.openAndDiagnose(FILE, '<template></template>').catch(() => {});
        const later = pathToFileURL(join(ROOT, 'later.pdx')).href;
        await expect(server.openAndDiagnose(later, '<template></template>')).rejects.toThrow(/exited with code 3/);
    }, 10_000);
});

describe('a server too slow for the sweep', () => {
    it('given up on, it fails the pending call naming the file it had reached', async () => {
        server = await startServer(ROOT, undefined, join(SERVERS, 'never-diagnoses.cjs'));
        const pending = server.openAndDiagnose(FILE, '<template></template>');
        server.giveUp('the sweep ran out of time');
        await expect(pending).rejects.toThrow(`the sweep ran out of time, diagnosing ${FILE}`);
    }, 10_000);
});
