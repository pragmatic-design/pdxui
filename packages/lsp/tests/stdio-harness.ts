// The language server over stdio, as an editor runs it: bundled the way build.mjs bundles it,
// started with --stdio, spoken to in JSON-RPC.

import { join } from 'path';
import { rmSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';
import { StreamMessageReader, StreamMessageWriter, createProtocolConnection, type ProtocolConnection } from 'vscode-languageserver/node';

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
    /** Open `text` as `uri` and resolve with the diagnostics the server publishes for it. */
    openAndDiagnose(uri: string, text: string): Promise<PublishedDiagnostic[]>;
    stop(): void;
}

/**
 * Start the server on `root` with `initializationOptions`, and complete the handshake. The server is
 * bundled from source unless `shipped` names a built one — the extension's — which is
 * then run as it is and left in place.
 */
export async function startServer(root: string, initializationOptions?: unknown, shipped?: string): Promise<StdioServer> {
    const bundle = shipped ?? bundlePath();
    if (!shipped) {
        await build({
            entryPoints: [join(LSP, 'src', 'server.ts')], bundle: true, platform: 'node', format: 'cjs',
            outfile: bundle, external: ['vscode'], logLevel: 'silent',
            alias: { '@pdxui/compiler': join(LSP, '..', 'compiler', 'src', 'index.ts') },
        });
    }
    const server: ChildProcess = spawn(process.execPath, [bundle, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] });
    // A server that dies says so: without this, a crash at start left `initialize` waiting until the
    // hook's timeout, which reads like slowness.
    const died = new Promise<never>((_, reject) => server.once('exit', (code) => reject(new Error(`the language server exited with ${code} before answering`))));
    const conn = createProtocolConnection(new StreamMessageReader(server.stdout!), new StreamMessageWriter(server.stdin!));
    const diagnostics: StdioServer['diagnostics'] = new Map();
    const waiting = new Map<string, (d: PublishedDiagnostic[]) => void>();
    conn.onNotification('textDocument/publishDiagnostics', (p: { uri: string; diagnostics: PublishedDiagnostic[] }) => {
        diagnostics.set(p.uri, p.diagnostics);
        const resolve = waiting.get(p.uri);
        if (resolve) { waiting.delete(p.uri); resolve(p.diagnostics); }
    });
    conn.listen();
    await Promise.race([
        conn.sendRequest('initialize', { processId: process.pid, rootUri: pathToFileURL(root).href, capabilities: {}, initializationOptions }),
        died,
    ]);
    died.catch(() => { /* after the handshake an exit is the test's stop(), not a failure */ });
    await conn.sendNotification('initialized', {});
    const openAndDiagnose = (uri: string, text: string) => new Promise<PublishedDiagnostic[]>((resolve) => {
        waiting.set(uri, resolve);
        void conn.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'pdx', version: 1, text } });
    });
    return { conn, diagnostics, openAndDiagnose, stop: () => { conn.dispose(); server.kill(); if (!shipped) rmSync(bundle, { force: true }); } };
}
