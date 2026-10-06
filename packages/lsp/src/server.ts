// PDX Language Server — LSP implementation for .pdx Single File Components.
// Provides: diagnostics, completion, go-to-definition, hover, document symbols,
// find-references (local + cross-file tags), rename, and quick-fix code actions.
// Uses @pdxui/compiler APIs for analysis and validation.
//
// This file is the connection: the document store, the lifecycle, the settings, and the registration
// of each handler. The project state is `workspace.ts`; each handler's body is beside its capability
// in `capabilities/`.

import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentSyncKind,
    InitializeResult,
    CompletionParams,
    DefinitionParams,
    HoverParams,
    DocumentSymbolParams,
    ReferenceParams,
    RenameParams,
    PrepareRenameParams,
    CodeActionParams,
    DocumentFormattingParams,
    CodeActionKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { getAnalysis, removeDocument } from './document-manager';
import { Workspace } from './workspace';
import { diagnoseDocument } from './capabilities/publish-diagnostics';
import { completionsAt } from './capabilities/completion-request';
import { definitionAt } from './capabilities/definition-request';
import { hoverAt } from './capabilities/hover-request';
import { prepareRenameAt, renameAt } from './capabilities/rename-request';
import { getWordAtPosition } from './capabilities/definition';
import { getDocumentSymbols } from './capabilities/symbols';
import { getReferences } from './capabilities/references';
import { getCodeActions } from './capabilities/code-actions';
import { formatDocument } from './capabilities/format';
import { pathToUri } from './utils/uri';

// ─── Connection + Document Manager ──────────────────────────────────

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const ws = new Workspace(documents);

// ─── Lifecycle ──────────────────────────────────────────────────────

connection.onInitialize((params: InitializeParams): InitializeResult => {
    const opts = params.initializationOptions as { typeCheck?: boolean; typescriptLib?: string } | undefined;
    ws.typeCheckEnabled = opts?.typeCheck !== false;
    ws.tsLibHint = opts?.typescriptLib;
    ws.resetTsServices();
    if (params.rootUri) {
        // file:///C:/path → C:/path (Windows needs leading slash stripped)
        let p = new URL(params.rootUri).pathname;
        if (process.platform === 'win32' && p.startsWith('/')) p = p.slice(1);
        ws.root = decodeURIComponent(p);
    } else {
        ws.root = params.rootPath ?? '';
    }

    // Scan workspace for components and translations
    if (ws.root) {
        ws.rescan();
        connection.console.log(`[pdx-lsp] Workspace: ${ws.root}`);
        const top = ws.registries.forRoot(ws.root);
        connection.console.log(`[pdx-lsp] Found ${top.components.length} components, ${top.manifest.size} manifest components (in ${top.resolver.searched.join(', ') || 'nothing'})`);
        connection.console.log(`[pdx-lsp] Found ${ws.translations.length} translation files, ${ws.pdxFiles.length} .pdx files`);
    }

    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full,
            completionProvider: {
                triggerCharacters: ['@', '$', "'", '"', '<'],
                resolveProvider: false,
            },
            definitionProvider: true,
            hoverProvider: true,
            documentSymbolProvider: true,
            referencesProvider: true,
            renameProvider: { prepareProvider: true },
            codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
            documentFormattingProvider: true,
        },
    };
});

// Files created/deleted/changed on disk after startup → rebuild the index so new
// components/translations become visible without an editor restart.
connection.onDidChangeWatchedFiles(() => {
    ws.rescan();
});

// The `pdx.typeCheck` setting changed: apply it and re-diagnose the open documents, so turning it
// off clears the type squiggles at once.
connection.onDidChangeConfiguration((change) => {
    const pdx = (change.settings as { pdx?: { typeCheck?: boolean } } | undefined)?.pdx;
    if (typeof pdx?.typeCheck !== 'boolean' || pdx.typeCheck === ws.typeCheckEnabled) return;
    ws.typeCheckEnabled = pdx.typeCheck;
    for (const doc of documents.all()) publishDiagnostics(doc);
});

// Opening a .pdx not yet in the index (e.g. a freshly created file) → rescan so its
// tag is available to completion/definition immediately.
documents.onDidOpen(event => {
    const uri = event.document.uri;
    if (uri.endsWith('.pdx') && !ws.pdxFiles.some(f => pathToUri(f) === uri)) {
        ws.rescan();
    }
});

// ─── Diagnostics (on change) ────────────────────────────────────────

documents.onDidChangeContent(change => publishDiagnostics(change.document));

/** Diagnose a .pdx document and publish the result. */
function publishDiagnostics(document: TextDocument): void {
    const diagnostics = diagnoseDocument(ws, document);
    if (diagnostics) connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

documents.onDidClose(event => {
    removeDocument(event.document.uri);
    ws.forget(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// ─── Requests ───────────────────────────────────────────────────────

connection.onCompletion((params: CompletionParams) => {
    const document = documents.get(params.textDocument.uri);
    return document ? completionsAt(ws, document, params) : [];
});

connection.onDefinition((params: DefinitionParams) => {
    const document = documents.get(params.textDocument.uri);
    return document ? definitionAt(ws, document, params) : null;
});

connection.onHover((params: HoverParams) => {
    const document = documents.get(params.textDocument.uri);
    return document ? hoverAt(ws, document, params) : null;
});

// Document symbols (outline).
connection.onDocumentSymbol((params: DocumentSymbolParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const { analysis, descriptor } = getAnalysis(document);
    if (!analysis || !descriptor?.script) return [];

    return getDocumentSymbols(analysis, document.getText(), descriptor.script);
});

connection.onReferences((params: ReferenceParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const source = document.getText();
    const word = getWordAtPosition(source, params.position);
    if (!word) return [];

    const { analysis, descriptor } = getAnalysis(document);
    return getReferences({
        word,
        source,
        descriptor,
        analysis,
        uri: params.textDocument.uri,
        files: ws.buildWorkspaceFiles(),
        includeDeclaration: params.context?.includeDeclaration ?? true,
    });
});

connection.onPrepareRename((params: PrepareRenameParams) => {
    const document = documents.get(params.textDocument.uri);
    return document ? prepareRenameAt(ws, document, params) : null;
});

connection.onRenameRequest((params: RenameParams) => {
    const document = documents.get(params.textDocument.uri);
    return document ? renameAt(ws, document, params) : null;
});

// Code actions (quick-fixes).
connection.onCodeAction((params: CodeActionParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const { warnings, descriptor } = getAnalysis(document);
    return getCodeActions({
        uri: params.textDocument.uri,
        source: document.getText(),
        descriptor,
        warnings,
        range: params.range,
    });
});

connection.onDocumentFormatting((params: DocumentFormattingParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return formatDocument(document.getText());
});

// ─── Start ──────────────────────────────────────────────────────────

documents.listen(connection);
connection.listen();
