// The language server over stdio, as an editor runs it: bundled the way build.mjs bundles it,
// started with --stdio, spoken to in JSON-RPC.
//
// What it measures is what an author sees in a .pdx: after `<pdx-` the library's components and the
// project's; inside a project component's tag, its props and events; inside `slot="` under a
// component with named slots, those names; and a hover on a project tag that says what it takes.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';
import type { ProtocolConnection } from 'vscode-languageserver/node';
import { startServer, type StdioServer } from './stdio-harness';

const PROFILE_MENU = `<template>
    <div class="menu">
        <slot name="header"></slot>
        <slot></slot>
    </div>
</template>
<script setup>
@prop label: string = 'Me';
@prop compact: boolean = false;
@event closed: void;
</script>
`;

let root: string;
let server: StdioServer;
let conn: ProtocolConnection;

/** Open `text` as `rel` and return its URI. */
async function open(rel: string, text: string): Promise<string> {
    const uri = pathToFileURL(join(root, rel)).href;
    await conn.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'pdx', version: 1, text } });
    return uri;
}

/** Position just after the first `needle` in `text`. */
function after(text: string, needle: string): { line: number; character: number } {
    const idx = text.indexOf(needle) + needle.length;
    const before = text.slice(0, idx);
    return { line: before.split('\n').length - 1, character: idx - (before.lastIndexOf('\n') + 1) };
}

async function complete(rel: string, text: string, needle: string): Promise<string[]> {
    const uri = await open(rel, text);
    const res = await conn.sendRequest('textDocument/completion', { textDocument: { uri }, position: after(text, needle) }) as
        { label: string }[] | { items: { label: string }[] } | null;
    const items = Array.isArray(res) ? res : res?.items ?? [];
    return items.map(i => i.label);
}

beforeAll(async () => {
    root = join(tmpdir(), `pdx-lsp-stdio-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app' }));
    writeFileSync(join(root, 'src', 'profile-menu.pdx'), PROFILE_MENU);

    server = await startServer(root);
    conn = server.conn;
}, 60_000);

afterAll(async () => {
    server?.stop();
    rmSync(root, { recursive: true, force: true });
});

describe('the language server over stdio', () => {
    it('after <pdx- offers the library components and the project ones', async () => {
        const text = '<template>\n<pdx-\n</template>\n';
        const labels = await complete('src/tags.pdx', text, '<pdx-');

        expect(labels, 'no library component offered').toContain('pdx-button');
        expect(labels).toContain('pdx-data-grid');
        expect(labels, 'the project component was not offered').toContain('pdx-profile-menu');
    });

    it('inside a project component offers its props and events', async () => {
        const text = '<template>\n<pdx-profile-menu ></pdx-profile-menu>\n</template>\n';
        const labels = await complete('src/props.pdx', text, '<pdx-profile-menu ');

        expect(labels).toEqual(expect.arrayContaining(['label', 'compact', '@closed']));
        expect(labels, 'tag names were offered instead of its props').not.toContain('pdx-button');
    });

    it('inside slot="" under a library component offers its named slots', async () => {
        const text = '<template>\n<pdx-drawer>\n  <div slot=""></div>\n</pdx-drawer>\n</template>\n';
        const labels = await complete('src/slots.pdx', text, 'slot="');

        expect(labels).toEqual(expect.arrayContaining(['header', 'footer']));
    });

    it('inside slot="" under a project component offers its named slots', async () => {
        const text = '<template>\n<pdx-profile-menu>\n  <h2 slot=""></h2>\n</pdx-profile-menu>\n</template>\n';
        const labels = await complete('src/slots-project.pdx', text, 'slot="');

        expect(labels).toEqual(['header']);
    });

    it('a hover on a project tag lists its props, events and slots', async () => {
        const text = '<template>\n<pdx-profile-menu></pdx-profile-menu>\n</template>\n';
        const uri = await open('src/hover.pdx', text);
        const hover = await conn.sendRequest('textDocument/hover', { textDocument: { uri }, position: after(text, '<pdx-prof') }) as
            { contents: { value: string } } | null;

        expect(hover, 'hovering a project component said nothing').not.toBeNull();
        expect(hover!.contents.value).toContain('label');
        expect(hover!.contents.value).toContain('@closed');
        expect(hover!.contents.value).toContain('header');
    });
});
