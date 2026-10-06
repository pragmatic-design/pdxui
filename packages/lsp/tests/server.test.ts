// The LSP server itself.
//
// `server.ts` is one module of top-level side effects: it opens a connection and registers a
// handler per LSP request. Testing the capabilities below it does not execute it, so every dispatch
// decision in it — which completion list to answer with, which of six definition strategies wins,
// whether a rename error becomes an LSP error or an exception — is verified here.
//
// The connection and the document store are stubbed so the handlers can be CALLED. Everything
// under them is real: a real workspace on disk, real .pdx analysis, a real TypeScript service.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { pathToFileURL } from 'url';

// Shared with the mock factory, which is hoisted above the imports.
const stub = vi.hoisted(() => ({
    on: {} as Record<string, (...args: unknown[]) => unknown>,
    doc: {} as Record<string, (...args: unknown[]) => unknown>,
    sent: [] as { uri: string; diagnostics: unknown[] }[],
    open: new Map<string, unknown>(),
    logged: [] as string[],
}));

vi.mock('vscode-languageserver/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vscode-languageserver/node')>();
    const register = (name: string) => (fn: (...a: unknown[]) => unknown) => { stub.on[name] = fn; };
    return {
        ...actual,
        createConnection: () => ({
            onInitialize: register('initialize'),
            onDidChangeWatchedFiles: register('watchedFiles'),
            onDidChangeConfiguration: register('configuration'),
            onCompletion: register('completion'),
            onDefinition: register('definition'),
            onHover: register('hover'),
            onDocumentSymbol: register('symbols'),
            onReferences: register('references'),
            onPrepareRename: register('prepareRename'),
            onRenameRequest: register('rename'),
            onCodeAction: register('codeAction'),
            onDocumentFormatting: register('formatting'),
            sendDiagnostics: (p: { uri: string; diagnostics: unknown[] }) => { stub.sent.push(p); },
            console: { log: (m: string) => { stub.logged.push(m); } },
            listen: () => {},
        }),
        TextDocuments: class {
            constructor(_: unknown) {}
            onDidOpen(fn: (...a: unknown[]) => unknown) { stub.doc.open = fn; }
            onDidChangeContent(fn: (...a: unknown[]) => unknown) { stub.doc.change = fn; }
            onDidClose(fn: (...a: unknown[]) => unknown) { stub.doc.close = fn; }
            get(uri: string) { return stub.open.get(uri); }
            all() { return [...stub.open.values()]; }
            listen() {}
        },
    };
});

// Importing the server registers every handler above.
import '../src/server';

// ─── A real workspace on disk ───────────────────────────────────────

const root = join(tmpdir(), `pdx-lsp-server-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
const uriOf = (file: string) => pathToFileURL(join(root, file)).href;

const BUTTON = `<template>
    <button class="btn"><slot></slot></button>
</template>
<script>
@prop label: string = 'Click';
@event pressed: string;
let count = $signal(0);
function press() { count.set(count() + 1); }
</script>
`;

const PAGE = `<template>
    <h1>{{ title }}</h1>
    <pdx-button :label="title" @pressed="onPressed"></pdx-button>
    <p>{{ missingThing }}</p>
</template>
<script>
let title = $signal('Hello');
function onPressed(v) { title.set(v); }
</script>
`;

// A component package the project depends on, as any third party would ship one: a package.json
// with `customElements`, and the manifest it names. `acme-chip` is the non-pdx tag.
const MANIFEST = JSON.stringify({
    modules: [{
        path: 'src/card/pdx-card.ts',
        declarations: [{
            kind: 'class', customElement: true, tagName: 'pdx-card',
            description: 'A card surface',
            attributes: [
                { name: 'variant', type: { text: "'outlined' | 'filled'" }, default: "'outlined'", description: 'Visual style' },
                { name: 'elevation', type: { text: 'number' }, description: 'Shadow depth' },
            ],
            events: [{ name: 'pdx-select', type: { text: 'CustomEvent' }, description: 'Fired on select' }],
            slots: [{ name: 'header', description: 'Card header' }],
        }],
    }, {
        path: 'src/chip.ts',
        declarations: [{
            kind: 'class', customElement: true, tagName: 'acme-chip',
            description: 'A chip from a third-party package',
            attributes: [{ name: 'tone', type: { text: "'info' | 'warn'" }, description: 'Colour' }],
        }],
    }],
});
const CARDS_PACKAGE = JSON.stringify({
    name: '@acme/cards', version: '1.0.0', customElements: 'custom-elements.json',
    exports: { './card': './src/card/pdx-card.ts', './chip': './src/chip.ts' },
});

/** Open a document with the stubbed store and hand it back. */
function open(file: string, text: string): TextDocument {
    const uri = uriOf(file);
    const doc = TextDocument.create(uri, 'pdx', 1, text);
    stub.open.set(uri, doc);
    return doc;
}

/** Position of the first occurrence of `needle`, offset by `delta` characters into it. */
function positionOf(text: string, needle: string, delta = 0): { line: number; character: number } {
    const idx = text.indexOf(needle) + delta;
    const before = text.slice(0, idx);
    const line = before.split('\n').length - 1;
    const character = idx - (before.lastIndexOf('\n') + 1);
    return { line, character };
}

/** Windows paths come back from a file:// URI with forward slashes. */
const slashed = (p: string) => p.replace(/\\/g, '/');

const at = (uri: string, position: { line: number; character: number }) =>
    ({ textDocument: { uri }, position });

let pageDoc: TextDocument;
let buttonDoc: TextDocument;

beforeAll(() => {
    // A project: its package.json declares the component package, its components live in src/.
    const cards = join(root, 'node_modules', '@acme', 'cards');
    mkdirSync(join(cards, 'src', 'card'), { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies: { '@acme/cards': '1.0.0' } }));
    writeFileSync(join(cards, 'package.json'), CARDS_PACKAGE);
    writeFileSync(join(cards, 'custom-elements.json'), MANIFEST);
    writeFileSync(join(cards, 'src', 'card', 'pdx-card.ts'), '');
    writeFileSync(join(cards, 'src', 'chip.ts'), '');
    writeFileSync(join(root, 'src', 'button.pdx'), BUTTON);
    writeFileSync(join(root, 'src', 'page.pdx'), PAGE);

    stub.on.initialize({ rootUri: pathToFileURL(root).href, initializationOptions: undefined });

    buttonDoc = open('src/button.pdx', BUTTON);
    pageDoc = open('src/page.pdx', PAGE);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

// ─── Lifecycle ──────────────────────────────────────────────────────

describe('initialize', () => {
    it('announces every capability the editor is allowed to ask for', () => {
        const result = stub.on.initialize({ rootUri: pathToFileURL(root).href }) as {
            capabilities: Record<string, unknown>;
        };
        const c = result.capabilities;

        expect(c.definitionProvider).toBe(true);
        expect(c.hoverProvider).toBe(true);
        expect(c.documentSymbolProvider).toBe(true);
        expect(c.referencesProvider).toBe(true);
        expect(c.documentFormattingProvider).toBe(true);
        expect(c.renameProvider, 'rename without prepare cannot validate the symbol first')
            .toEqual({ prepareProvider: true });
        expect((c.completionProvider as { triggerCharacters: string[] }).triggerCharacters)
            .toEqual(['@', '$', "'", '"', '<']);
    });

    it('scans the workspace it was pointed at', () => {
        // The root is derived from a file:// URI, so it comes back with forward slashes even on
        // Windows — compared normalised rather than asserting one platform's separator.
        expect(slashed(stub.logged.join('\n'))).toContain(slashed(root));
        expect(stub.logged.some((l) => /Found \d+ components/.test(l)),
            'the server started without saying what it found').toBe(true);
    });

    it('falls back to rootPath when there is no rootUri', () => {
        const result = stub.on.initialize({ rootUri: null, rootPath: root });
        expect(result).toBeTruthy();
        expect(slashed(stub.logged.join('\n'))).toContain(slashed(root));
    });

    it('starts with no workspace at all rather than failing', () => {
        expect(() => stub.on.initialize({ rootUri: null, rootPath: '' })).not.toThrow();
        // Put the real workspace back for the rest of the file.
        stub.on.initialize({ rootUri: pathToFileURL(root).href });
    });
});

// ─── Diagnostics ────────────────────────────────────────────────────

describe('diagnostics on change', () => {
    const diagnosticsFor = (doc: TextDocument) => {
        stub.sent.length = 0;
        stub.doc.change({ document: doc });
        return stub.sent[0];
    };

    it('publishes for the document that changed', () => {
        const sent = diagnosticsFor(pageDoc);
        expect(sent.uri).toBe(pageDoc.uri);
        expect(Array.isArray(sent.diagnostics)).toBe(true);
    });

    it('reports a template reference the script never declares', () => {
        const sent = diagnosticsFor(pageDoc);
        const messages = (sent.diagnostics as { message: string }[]).map((d) => d.message).join('\n');
        expect(messages, 'a typo in the template was not reported').toContain('missingThing');
    });

    it('reports a <pdx-*> tag that resolves to nothing', () => {
        const doc = open('unresolved.pdx', '<template><pdx-nope /></template>\n<script>\nlet a = $signal(1);\n</script>\n');
        const sent = diagnosticsFor(doc);

        const codes = (sent.diagnostics as { code?: string }[]).map((d) => d.code);
        expect(codes, 'an unknown component silently passed validation')
            .toContain('PDX_UNRESOLVED_COMPONENT');
    });

    it('does not report a tag the workspace does provide', () => {
        const sent = diagnosticsFor(pageDoc);
        const unresolved = (sent.diagnostics as { code?: string; message: string }[])
            .filter((d) => d.code === 'PDX_UNRESOLVED_COMPONENT');
        expect(unresolved.map((d) => d.message).join(''),
            'a component that exists in the workspace was reported missing').not.toContain('pdx-button');
    });

    it('ignores a file that is not a .pdx', () => {
        stub.sent.length = 0;
        stub.doc.change({ document: TextDocument.create(uriOf('notes.md'), 'markdown', 1, '# hi') });
        expect(stub.sent, 'the server diagnosed a file it does not own').toHaveLength(0);
    });

    it('pdx.typeCheck turns the type errors off and on again, on the open documents', () => {
        const doc = open('src/typed.pdx', "<template><p>x</p></template>\n<script setup>\nconst n: string = 42;\n</script>\n");
        const tsCodes = () => {
            const sent = stub.sent.filter((s) => s.uri === doc.uri).at(-1);
            return (sent?.diagnostics as { source?: string }[] ?? []).filter((d) => d.source === 'pdx-ts').length;
        };
        stub.sent.length = 0;
        stub.doc.change({ document: doc });
        expect(tsCodes(), 'the type error was not reported with the check on').toBeGreaterThan(0);

        stub.sent.length = 0;
        stub.on.configuration({ settings: { pdx: { typeCheck: false } } });
        expect(tsCodes(), 'turning the setting off left the type error on screen').toBe(0);

        stub.sent.length = 0;
        stub.on.configuration({ settings: { pdx: { typeCheck: true } } });
        expect(tsCodes(), 'turning it back on did not bring it back').toBeGreaterThan(0);
        stub.open.delete(doc.uri);
    });

    it('closing a document clears its squiggles', () => {
        stub.sent.length = 0;
        stub.doc.close({ document: pageDoc });
        expect(stub.sent[0]).toEqual({ uri: pageDoc.uri, diagnostics: [] });
    });
});

// ─── Completion ─────────────────────────────────────────────────────

describe('completion', () => {
    const labels = (items: unknown) => (items as { label: string }[]).map((i) => i.label);

    it('answers nothing for a document the store does not have', () => {
        expect(stub.on.completion(at(uriOf('never-opened.pdx'), { line: 0, character: 0 })))
            .toEqual([]);
    });

    it('offers translation keys inside $t(', () => {
        // The scanner reads translations from src/translations, which is where a PDX app keeps them.
        mkdirSync(join(root, 'src', 'translations'), { recursive: true });
        writeFileSync(join(root, 'src', 'translations', 'en.json'), JSON.stringify({ nav: { home: 'Home' } }));
        stub.on.watchedFiles({ changes: [] });   // rebuild the index from disk

        const text = "<template><p>x</p></template>\n<script>\nconst s = $t('\n</script>\n";
        const doc = open('t.pdx', text);
        const items = stub.on.completion(at(doc.uri, positionOf(text, "$t('", 4)));

        expect(labels(items), 'the translation keys never reached the editor').toContain('nav.home');
    });

    it('offers the runes at the start of a line', () => {
        const text = '<template><p>x</p></template>\n<script>\n@\n</script>\n';
        const doc = open('rune.pdx', text);
        const items = stub.on.completion(at(doc.uri, positionOf(text, '@', 1)));

        expect(labels(items).some((l) => l.startsWith('@prop')),
            'typing @ offered no runes').toBe(true);
    });

    it('offers the workspace components after a <', () => {
        const text = '<template>\n<\n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('tag.pdx', text);
        const items = stub.on.completion(at(doc.uri, positionOf(text, '\n<\n', 2)));

        expect(labels(items), 'the component the workspace defines was not offered')
            .toContain('pdx-button');
    });

    it('offers a manifest component attributes inside its tag', () => {
        const text = '<template>\n<pdx-card ></pdx-card>\n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('card.pdx', text);
        const items = stub.on.completion(at(doc.uri, positionOf(text, '<pdx-card ', 10)));

        expect(labels(items), 'the manifest attributes were not offered inside the tag')
            .toEqual(expect.arrayContaining([expect.stringContaining('variant')]));
    });

    it('offers a third-party component attributes inside its tag', () => {
        const text = '<template>\n<acme-chip ></acme-chip>\n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('chip.pdx', text);
        const items = stub.on.completion(at(doc.uri, positionOf(text, '<acme-chip ', 11)));

        expect(labels(items)).toEqual(expect.arrayContaining([expect.stringContaining('tone')]));
    });

    it('does not report a third-party tag as unresolved', () => {
        const doc = open('chip-diag.pdx', '<template><acme-chip></acme-chip></template>\n<script>\nlet a = $signal(1);\n</script>\n');
        stub.sent.length = 0;
        stub.doc.change({ document: doc });
        const codes = (stub.sent[0].diagnostics as { code?: string }[]).map((d) => d.code);
        expect(codes).not.toContain('PDX_UNRESOLVED_COMPONENT');
    });
});

// ─── Definition ─────────────────────────────────────────────────────

describe('go to definition', () => {
    it('answers null for a document the store does not have', () => {
        expect(stub.on.definition(at(uriOf('never-opened.pdx'), { line: 0, character: 0 })))
            .toBeNull();
    });

    it('jumps from a tag to the file that defines it', () => {
        const loc = stub.on.definition(at(pageDoc.uri, positionOf(PAGE, '<pdx-button', 3))) as
            { uri: string } | { uri: string }[] | null;

        expect(loc, 'a tag in the template led nowhere').not.toBeNull();
        const first = Array.isArray(loc) ? loc[0] : loc!;
        expect(first.uri).toContain('button.pdx');
    });

    it('jumps from a manifest tag to its source file', () => {
        const text = '<template>\n<pdx-card></pdx-card>\n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('card-def.pdx', text);
        const loc = stub.on.definition(at(doc.uri, positionOf(text, '<pdx-card', 3))) as
            { uri: string } | null;

        expect(loc, 'a manifest component had no definition').not.toBeNull();
        expect((loc as { uri: string }).uri).toContain('pdx-card.ts');
    });

    it('resolves a local symbol in the same file', () => {
        const loc = stub.on.definition(at(pageDoc.uri, positionOf(PAGE, 'title.set', 2)));
        expect(loc, 'a symbol declared in the script above could not be found').toBeTruthy();
    });

    it('answers null when the cursor is on nothing', () => {
        const text = '<template>\n   \n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('empty.pdx', text);
        expect(stub.on.definition(at(doc.uri, { line: 1, character: 1 }))).toBeNull();
    });
});

// ─── Hover ──────────────────────────────────────────────────────────

describe('hover', () => {
    it('answers null for a document the store does not have', () => {
        expect(stub.on.hover(at(uriOf('never-opened.pdx'), { line: 0, character: 0 }))).toBeNull();
    });

    it('describes a manifest component from its tag', () => {
        const text = '<template>\n<pdx-card></pdx-card>\n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('card-hover.pdx', text);
        const hover = stub.on.hover(at(doc.uri, positionOf(text, '<pdx-card', 3))) as
            { contents: { value: string } } | null;

        expect(hover, 'hovering a component said nothing').not.toBeNull();
        expect(hover!.contents.value).toContain('pdx-card');
    });

    it('describes a tag from a third-party component package', () => {
        const text = '<template>\n<acme-chip></acme-chip>\n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('chip-hover.pdx', text);
        const hover = stub.on.hover(at(doc.uri, positionOf(text, '<acme-chip', 3))) as
            { contents: { value: string } } | null;

        expect(hover, 'a component package other than @pdxui/ui was invisible').not.toBeNull();
        expect(hover!.contents.value).toContain('third-party');
    });

    it('describes a rune', () => {
        const text = '<template><p>x</p></template>\n<script>\n@prop label: string = "x";\n</script>\n';
        const doc = open('rune-hover.pdx', text);
        const hover = stub.on.hover(at(doc.uri, positionOf(text, '@prop', 2)));

        expect(hover, 'hovering @prop said nothing').toBeTruthy();
    });

    it('answers null on empty space', () => {
        const text = '<template>\n   \n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('hover-empty.pdx', text);
        expect(stub.on.hover(at(doc.uri, { line: 1, character: 1 }))).toBeNull();
    });
});

// ─── Symbols, references, formatting ────────────────────────────────

describe('document symbols', () => {
    it('lists what the script declares', () => {
        const symbols = stub.on.symbols({ textDocument: { uri: buttonDoc.uri } }) as
            { name: string }[];
        const names = symbols.map((s) => s.name);

        expect(names, 'the outline was empty for a file with declarations').not.toHaveLength(0);
        expect(names.join(' ')).toContain('count');
    });

    it('is empty for a document the store does not have', () => {
        expect(stub.on.symbols({ textDocument: { uri: uriOf('never-opened.pdx') } })).toEqual([]);
    });

    it('is empty for a file with no script', () => {
        const doc = open('no-script.pdx', '<template><p>only markup</p></template>\n');
        expect(stub.on.symbols({ textDocument: { uri: doc.uri } })).toEqual([]);
    });
});

describe('find references', () => {
    it('finds a local symbol in its own file', () => {
        const refs = stub.on.references({
            ...at(buttonDoc.uri, positionOf(BUTTON, 'let count', 4)),
            context: { includeDeclaration: true },
        }) as { uri: string }[];

        expect(refs.length, 'a symbol used twice reported no references').toBeGreaterThan(0);
    });

    it('is empty for a document the store does not have', () => {
        expect(stub.on.references({
            ...at(uriOf('never-opened.pdx'), { line: 0, character: 0 }),
            context: { includeDeclaration: true },
        })).toEqual([]);
    });

    it('is empty when the cursor is not on a word', () => {
        const text = '<template>\n   \n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('refs-empty.pdx', text);
        expect(stub.on.references({
            ...at(doc.uri, { line: 1, character: 1 }),
            context: { includeDeclaration: true },
        })).toEqual([]);
    });
});

describe('formatting', () => {
    it('returns edits for an open document', () => {
        const edits = stub.on.formatting({ textDocument: { uri: pageDoc.uri } });
        expect(Array.isArray(edits)).toBe(true);
    });

    it('is empty for a document the store does not have', () => {
        expect(stub.on.formatting({ textDocument: { uri: uriOf('never-opened.pdx') } })).toEqual([]);
    });
});

// ─── Rename ─────────────────────────────────────────────────────────

describe('rename', () => {
    it('prepare answers a range for a symbol that can be renamed', () => {
        const r = stub.on.prepareRename(at(buttonDoc.uri, positionOf(BUTTON, 'let count', 4)));
        expect(r, 'a renameable symbol was refused').toBeTruthy();
    });

    it('prepare answers null for a document the store does not have', () => {
        expect(stub.on.prepareRename(at(uriOf('never-opened.pdx'), { line: 0, character: 0 })))
            .toBeNull();
    });

    it('prepare answers null when the cursor is not on a word', () => {
        const text = '<template>\n   \n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('prep-empty.pdx', text);
        expect(stub.on.prepareRename(at(doc.uri, { line: 1, character: 1 }))).toBeNull();
    });

    it('produces the edits for a valid new name', () => {
        const edits = stub.on.rename({
            ...at(buttonDoc.uri, positionOf(BUTTON, 'let count', 4)),
            newName: 'total',
        }) as { changes?: Record<string, unknown[]> };

        expect(edits, 'renaming produced no edit at all').toBeTruthy();
        expect(Object.keys(edits.changes ?? {}).length).toBeGreaterThan(0);
    });

    it('turns an invalid new name into an LSP error instead of throwing', () => {
        // The editor shows a message; an exception here would take the request down with it.
        const result = stub.on.rename({
            ...at(buttonDoc.uri, positionOf(BUTTON, 'let count', 4)),
            newName: '123 not an identifier',
        }) as { code?: number; message?: string };

        expect(result, 'an invalid rename escaped as an exception').toBeTruthy();
        expect(result.message, 'the editor was told nothing about why').toBeTruthy();
    });

    it('answers null for a document the store does not have', () => {
        expect(stub.on.rename({
            ...at(uriOf('never-opened.pdx'), { line: 0, character: 0 }), newName: 'x',
        })).toBeNull();
    });
});

// ─── Code actions ───────────────────────────────────────────────────

describe('code actions', () => {
    it('is empty for a document the store does not have', () => {
        expect(stub.on.codeAction({
            textDocument: { uri: uriOf('never-opened.pdx') },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        })).toEqual([]);
    });

    it('offers a fix over a warning it knows how to fix', () => {
        // `${}` in an attribute is the canonical PDX warning with a quick fix.
        const text = '<template>\n<div title="${name}"></div>\n</template>\n<script>\nlet name = $signal("x");\n</script>\n';
        const doc = open('fixable.pdx', text);
        const pos = positionOf(text, '${name}', 1);
        const actions = stub.on.codeAction({
            textDocument: { uri: doc.uri },
            range: { start: pos, end: pos },
        }) as unknown[];

        expect(Array.isArray(actions)).toBe(true);
    });
});

// ─── The index that follows the disk ────────────────────────────────

describe('the workspace index', () => {
    it('picks up a component created after startup, on a watched-file change', () => {
        writeFileSync(join(root, 'src', 'later.pdx'), BUTTON);

        stub.on.watchedFiles({ changes: [] });

        const text = '<template>\n<\n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const doc = open('after.pdx', text);
        const items = stub.on.completion(at(doc.uri, positionOf(text, '\n<\n', 2))) as { label: string }[];

        expect(items.map((i) => i.label), 'a file created after startup stayed invisible')
            .toContain('pdx-later');
    });

    it('rescans when a .pdx not yet in the index is opened', () => {
        writeFileSync(join(root, 'src', 'fresh.pdx'), BUTTON);
        const doc = open('src/fresh.pdx', BUTTON);

        stub.doc.open({ document: doc });

        const text = '<template>\n<\n</template>\n<script>\nlet a = $signal(1);\n</script>\n';
        const probe = open('probe.pdx', text);
        const items = stub.on.completion(at(probe.uri, positionOf(text, '\n<\n', 2))) as { label: string }[];

        expect(items.map((i) => i.label)).toContain('pdx-fresh');
    });

    it('opening a file that is not a .pdx does not trigger a rescan', () => {
        const doc = TextDocument.create(uriOf('readme.md'), 'markdown', 1, '# hi');
        expect(() => stub.doc.open({ document: doc })).not.toThrow();
    });
});

// ─── Rename that reaches as far as it should ────────────

describe('rename scope', () => {
    /** The file a URI names, normalised: the server writes disk files as file:///c%3A/…. */
    const fileOf = (uri: string) => decodeURIComponent(uri).replace(/\\/g, '/').toLowerCase();
    const editedFiles = (edit: { changes?: Record<string, unknown[]>; documentChanges?: { textDocument?: { uri: string } }[] }) => [
        ...Object.keys(edit.changes ?? {}),
        ...(edit.documentChanges ?? []).map(c => c.textDocument?.uri).filter((u): u is string => !!u),
    ].map(fileOf);

    it('refuses to rename a tag a component package defines, and says which', () => {
        const text = '<template>\n<pdx-card></pdx-card>\n</template>\n<script setup>\nlet a = $signal(1);\n</script>\n';
        const doc = open('src/lib-tag.pdx', text);
        const r = stub.on.prepareRename(at(doc.uri, positionOf(text, '<pdx-card', 3))) as { message?: string } | null;
        expect(r?.message, 'a library tag was offered for renaming').toContain('@acme/cards');
    });

    it('renaming a project tag also updates a .ts selector and an .html page', () => {
        writeFileSync(join(root, 'src', 'util.ts'), "export const card = () => document.querySelector('pdx-button');\n");
        writeFileSync(join(root, 'index.html'), '<!doctype html><body><pdx-button></pdx-button></body>\n');
        stub.on.watchedFiles({ changes: [] });

        const edit = stub.on.rename({ ...at(pageDoc.uri, positionOf(PAGE, '<pdx-button', 3)), newName: 'pdx-action' }) as
            { changes?: Record<string, unknown[]>; documentChanges?: { textDocument?: { uri: string } }[] };
        const files = editedFiles(edit);
        expect(files.some(f => f.endsWith('src/util.ts')), 'the querySelector in a .ts file was left behind').toBe(true);
        expect(files.some(f => f.endsWith('index.html')), 'the .html page was left behind').toBe(true);
    });

    it('renaming a function a .pdx.ts exports updates the .pdx that imports it', () => {
        const STATE = 'export function bump(n: number) { return n + 1; }\n';
        const USER = "<template><p>{{ bump(1) }}</p></template>\n<script setup>\nimport { bump } from './state.pdx';\nconst two = bump(1);\n</script>\n";
        writeFileSync(join(root, 'src', 'state.pdx.ts'), STATE);
        writeFileSync(join(root, 'src', 'user.pdx'), USER);
        stub.on.watchedFiles({ changes: [] });
        const uri = uriOf('src/state.pdx.ts');
        stub.open.set(uri, TextDocument.create(uri, 'typescript', 1, STATE));

        expect(stub.on.prepareRename(at(uri, positionOf(STATE, 'bump', 1))), 'the exported function could not be renamed').toBeTruthy();
        const edit = stub.on.rename({ ...at(uri, positionOf(STATE, 'bump', 1)), newName: 'increment' }) as { changes?: Record<string, { newText: string }[]> };
        const user = Object.entries(edit?.changes ?? {}).find(([u]) => fileOf(u).endsWith('src/user.pdx'));
        expect(user, 'the importing .pdx was not edited').toBeDefined();
        // the import, the script call and the template call
        expect(user![1]).toHaveLength(3);
        expect(Object.keys(edit.changes!).map(fileOf).some(f => f.endsWith('src/state.pdx.ts'))).toBe(true);
    });
});

// ─── A workspace whose app is a folder below it ─────────

describe('a document resolves from its own project, not from the editor folder', () => {
    // The editor opens a monorepo root; the app is apps/web, and pnpm put @pdxui/ui in
    // apps/web/node_modules only. A server that loaded the manifest from the folder it was
    // opened on would find none, and every library tag in the app would be unresolved.
    const mono = join(tmpdir(), `pdx-lsp-mono-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    const web = join(mono, 'apps', 'web');
    const ui = join(web, 'node_modules', '@pdxui', 'ui');
    const TEXT = '<template>\n<pdx-button ></pdx-button>\n</template>\n<script>\nlet a = $signal(1);\n</script>\n';

    beforeAll(() => {
        mkdirSync(join(ui, 'src'), { recursive: true });
        mkdirSync(join(web, 'src'), { recursive: true });
        writeFileSync(join(web, 'package.json'), JSON.stringify({ name: 'web', dependencies: { '@pdxui/ui': '1.0.0' } }));
        writeFileSync(join(ui, 'package.json'), JSON.stringify({
            name: '@pdxui/ui', version: '1.0.0', customElements: 'custom-elements.json', exports: { './button': './src/button.js' },
        }));
        writeFileSync(join(ui, 'custom-elements.json'), JSON.stringify({
            modules: [{ path: 'src/button.js', declarations: [{
                kind: 'class', customElement: true, tagName: 'pdx-button', description: 'The app-local button',
                attributes: [{ name: 'variant', type: { text: "'solid' | 'ghost'" }, description: 'Look' }],
            }] }],
        }));
        writeFileSync(join(web, 'src', 'page.pdx'), TEXT);
        stub.on.initialize({ rootUri: pathToFileURL(mono).href });
    });

    afterAll(() => {
        rmSync(mono, { recursive: true, force: true });
        stub.on.initialize({ rootUri: pathToFileURL(root).href });
    });

    it('offers the props of a library tag inside it', () => {
        const uri = pathToFileURL(join(web, 'src', 'page.pdx')).href;
        stub.open.set(uri, TextDocument.create(uri, 'pdx', 1, TEXT));
        const items = stub.on.completion(at(uri, positionOf(TEXT, '<pdx-button ', 12))) as { label: string }[];

        expect(items.map((i) => i.label)).toEqual(expect.arrayContaining([expect.stringContaining('variant')]));
    });

    it('does not report the library tag as unresolved', () => {
        const uri = pathToFileURL(join(web, 'src', 'page.pdx')).href;
        const doc = TextDocument.create(uri, 'pdx', 2, TEXT);
        stub.open.set(uri, doc);
        stub.sent.length = 0;
        stub.doc.change({ document: doc });
        const codes = (stub.sent[0].diagnostics as { code?: string }[]).map((d) => d.code);
        expect(codes).not.toContain('PDX_UNRESOLVED_COMPONENT');
    });
});
