// VS Code Extension — LSP client for .pdx files.
// Activates the @pdxui/lsp language server for diagnostics, completion,
// go-to-definition, and hover in .pdx Single File Components.

import * as path from 'path';
import { existsSync } from 'fs';
import { workspace, env, ExtensionContext } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
    // The LSP server is bundled INSIDE this extension (copied from @pdxui/lsp
    // by the `bundle-server` script). A sibling path would break once packaged in
    // a .vsix, so we always resolve it relative to the extension root.
    const serverModule = context.asAbsolutePath(
        path.join('server', 'server.cjs')
    );

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] },
        },
    };

    const clientOptions: LanguageClientOptions = {
        // .pdx and .pdx.ts only. Served to .html files, the PDX server would offer @prop and @event
        // in a plain page, and register formatting there.
        documentSelector: [
            { scheme: 'file', language: 'pdx' },
            { scheme: 'file', language: 'typescript', pattern: '**/*.pdx.ts' },
        ],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.{pdx,pdx.ts}'),
            // `pdx.*` settings reach the server on workspace/didChangeConfiguration: turning
            // `pdx.typeCheck` off clears the type squiggles without a restart.
            configurationSection: 'pdx',
        },
        initializationOptions: {
            typeCheck: workspace.getConfiguration('pdx').get<boolean>('typeCheck', true),
            // VS Code's own TypeScript lib, for a project that has no TypeScript of its own: the
            // server ships none, and without a lib `String` and `document` do not exist.
            typescriptLib: vscodeTypeScriptLib(),
        },
    };

    client = new LanguageClient(
        'pragmaticPdx',
        'Pragmatic PDX Language Server',
        serverOptions,
        clientOptions,
    );

    client.start();
}

/** The lib folder of the TypeScript VS Code ships with, or undefined where it is not. */
function vscodeTypeScriptLib(): string | undefined {
    const lib = path.join(env.appRoot, 'extensions', 'node_modules', 'typescript', 'lib');
    return existsSync(path.join(lib, 'lib.es2022.d.ts')) ? lib : undefined;
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) return undefined;
    return client.stop();
}
