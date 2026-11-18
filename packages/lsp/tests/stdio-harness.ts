// The language server over stdio, as an editor runs it: bundled the way build.mjs bundles it,
// started with --stdio, spoken to in JSON-RPC.

import { join } from 'path';
import { rmSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';
import { bundleOptions } from '../esbuild-options.mjs';
import { StreamMessageReader, StreamMessageWriter, createProtocolConnection, type ProtocolConnection } from 'vscode-languageserver/node';
import { waitOnChild, stopWaitingOn } from '../../core/tests/setup/slow-test-children';

const LSP = join(__dirname, '..');
// Inside the package, so the bundled server finds this monorepo's packages/ the way the compiler
// does from its own folder when a project declares no component package. One file per start: the
// stdio tests run in parallel, and with one shared bundle a test can start the server while another
// is rewriting it — the server never answers `initialize` and the hook times out.
const bundlePath = () => join(LSP, 'node_modules', '.stdio-test', `server-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.cjs`);

export interface PublishedDiagnostic { source?: string; code?: string | number; message: string; range: { start: { line: number } } }

export interface StdioServer {
    conn: ProtocolConnection;
    /** Every publishDiagnostics received, by URI — the last one wins. */
    diagnostics: Map<string, PublishedDiagnostic[]>;
    /**
     * Open `text` as `uri` and resolve with the diagnostics the server publishes for it. Rejects, at
     * once, when the server exits: with its exit code, the file, and the end of its stderr (#1184).
     */
    openAndDiagnose(uri: string, text: string): Promise<PublishedDiagnostic[]>;
    /** Stop waiting on the server: every pending call, and every later one, fails with `why` and its file. */
    giveUp(why: string): void;
    stop(): void;
}

/** How much of the server's stderr an error carries: its end, where a crash prints. */
const STDERR_TAIL = 2000;

/**
 * Start the server on `root` with `initializationOptions`, and complete the handshake. The server is
 * bundled from source unless `shipped` names a built one — the extension's — which is
 * then run as it is and left in place.
 */
export async function startServer(root: string, initializationOptions?: unknown, shipped?: string): Promise<StdioServer> {
    const bundle = shipped ?? bundlePath();
    if (!shipped) {
        await build({
            ...bundleOptions,
            entryPoints: [join(LSP, 'src', 'server.ts')], outfile: bundle, external: ['vscode'], logLevel: 'silent',
        });
    }
    // stderr piped, not inherited: still written through, and its end kept for the error a crash gives.
    const server: ChildProcess = spawn(process.execPath, [bundle, '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderrTail = '';
    server.stderr!.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk);
        stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL);
    });
    // The tests' work is the server's: a slow failure's record reads its CPU, and whether it is alive,
    // beside the test's own idle loop (#1183).
    waitOnChild(server.pid!, 'language server');

    // What every call waits on, by what it is doing; and, once the server is gone or given up on, why
    // every call now fails. A server that crashed mid-sweep left each openAndDiagnose waiting until the
    // test's 120 s timeout, which read the same as a slow one (#1184).
    const waiting = new Map<string, { doing: string; resolve: (d: PublishedDiagnostic[]) => void; reject: (e: Error) => void }>();
    let ended: string | null = null;
    const end = (why: string): void => {
        ended ??= why;
        for (const w of waiting.values()) w.reject(new Error(`${why}, ${w.doing}`));
        waiting.clear();
    };
    let stopping = false;
    server.once('exit', (code, signal) => {
        if (stopping) return end('the language server was stopped by the test');
        const how = signal ? `signal ${signal}` : `code ${code}`;
        const tail = stderrTail.trimEnd();
        end(`the language server exited with ${how}${tail ? `; its stderr ended with:\n${tail}\n—` : ''}`);
    });

    const conn = createProtocolConnection(new StreamMessageReader(server.stdout!), new StreamMessageWriter(server.stdin!));
    const diagnostics: StdioServer['diagnostics'] = new Map();
    conn.onNotification('textDocument/publishDiagnostics', (p: { uri: string; diagnostics: PublishedDiagnostic[] }) => {
        diagnostics.set(p.uri, p.diagnostics);
        const w = waiting.get(p.uri);
        if (w) { waiting.delete(p.uri); w.resolve(p.diagnostics); }
    });
    conn.listen();
    // The handshake waits like any call: a server that dies at start says so instead of the hook's timeout.
    await new Promise<void>((resolve, reject) => {
        waiting.set('#initialize', { doing: 'before it answered initialize', resolve: () => resolve(), reject });
        conn.sendRequest('initialize', { processId: process.pid, rootUri: pathToFileURL(root).href, capabilities: {}, initializationOptions })
            .then(() => { waiting.delete('#initialize'); resolve(); }, reject);
    });
    await conn.sendNotification('initialized', {});
    const openAndDiagnose = (uri: string, text: string) => new Promise<PublishedDiagnostic[]>((resolve, reject) => {
        const doing = `diagnosing ${uri}`;
        if (ended !== null) return reject(new Error(`${ended}, ${doing}`));
        waiting.set(uri, { doing, resolve, reject });
        // A write to a server that has just exited fails here: that call fails with it.
        conn.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'pdx', version: 1, text } })
            .catch((e: Error) => { waiting.delete(uri); reject(new Error(`${ended ?? e.message}, ${doing}`)); });
    });
    const stop = (): void => {
        stopping = true;
        stopWaitingOn(server.pid!);
        conn.dispose();
        server.kill();
        if (!shipped) rmSync(bundle, { force: true });
    };
    return { conn, diagnostics, openAndDiagnose, giveUp: end, stop };
}
