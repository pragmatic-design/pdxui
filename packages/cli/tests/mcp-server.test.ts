// `pdx mcp`: the CLI as an MCP server, so an agent calls the compiler, the manifest and the docs as
// tools instead of shelling out and parsing text.
//
// Driven by the SDK's own client over an in-memory transport: what an agent's host would see.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createPdxMcpServer } from '../src/mcp/server';

let project: string;
let client: Client;

/** The text of a tool's result, parsed: every tool answers with one JSON text block. */
async function call(name: string, args: Record<string, unknown> = {}): Promise<{ isError?: boolean; data: unknown }> {
    const result = await client.callTool({ name, arguments: args }) as { isError?: boolean; content: { type: string; text: string }[] };
    return { isError: result.isError, data: JSON.parse(result.content[0].text) };
}

beforeAll(async () => {
    project = mkdtempSync(join(tmpdir(), 'pdx-mcp-'));
    mkdirSync(join(project, 'src', 'pages'), { recursive: true });
    // A raw interpolation in an attribute: PDX_RAW_INTERPOLATION, with a fix.
    // Named so it collides with no library tag: `card.pdx` would be pdx-card, which @pdxui/ui ships.
    writeFileSync(join(project, 'src', 'profile-card.pdx'),
        '<template>\n  <p title="${tone}">x</p>\n</template>\n<script setup>\nlet tone = $signal(\'a\');\n</script>\n');
    writeFileSync(join(project, 'src', 'pages', 'home.pdx'),
        '<template><p>home</p></template>\n<script setup>\n@page \'/\';\n</script>\n');

    // The docs the tool searches, in the shape gen-llms.mjs writes: an index of links, then sections.
    // A fixture rather than the site's output, which is generated, git-ignored, and rewritten by
    // another suite while this one runs.
    const docs = join(project, 'llms-full.txt');
    writeFileSync(docs, [
        '# PDX', '', '## Docs', '- [Diagnostics](/docs/diagnostics): every PDX_* code', '- [Routing](/docs/routing): pages', '',
        '## Components', '- [pdx-button](/components/pdx-button): A button', '',
        '---', '', '# Documentation (complete)', '',
        '## Routing', '', 'Pages are declared with @page.', '',
        '## Diagnostics', '', 'PDX_RAW_INTERPOLATION: a raw interpolation in an attribute. Bind the attribute instead.', '',
        // A heading INSIDE a page is written with `## ` too: it belongs to the page above it.
        '## Reading a finding', '', 'Each finding names its line and column.', '',
        '# Component API', '', '## pdx-button', 'A button.', '',
    ].join('\n'));

    const server = createPdxMcpServer(project, { docsPath: docs });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    client = new Client({ name: 'pdx-mcp-test', version: '1.0.0' });
    await client.connect(clientSide);
}, 60_000);

afterAll(async () => {
    await client?.close();
    rmSync(project, { recursive: true, force: true });
});

describe('pdx mcp', () => {
    it('lists the six tools, each with an input schema', async () => {
        const { tools } = await client.listTools();
        expect(tools.map(t => t.name).sort()).toEqual(['check', 'component', 'components', 'docs', 'explain', 'project']);
        for (const t of tools) {
            expect(t.inputSchema.type, `${t.name} has no object schema`).toBe('object');
            expect(t.description, `${t.name} has no description`).toBeTruthy();
        }
    });

    it('check: the diagnostic with its position and its fix', async () => {
        const { data } = await call('check');
        const report = data as { files: { file: string; warnings: { code: string; line?: number; fix?: { edits: unknown[] } }[] }[] };
        const finding = report.files.flatMap(f => f.warnings).find(w => w.code === 'PDX_RAW_INTERPOLATION');
        expect(finding, 'the raw interpolation was not reported').toBeDefined();
        expect(finding!.line).toBe(2);
        expect(finding!.fix?.edits.length).toBeGreaterThan(0);
    });

    it('check does not write the file unless asked to fix it', async () => {
        await call('check');
        expect(readFileSync(join(project, 'src', 'profile-card.pdx'), 'utf-8')).toContain('${tone}');
    });

    it('explain: the catalog entry, and an error for a code that does not exist', async () => {
        const { data } = await call('explain', { code: 'PDX_RAW_INTERPOLATION' });
        expect(data).toMatchObject({ code: 'PDX_RAW_INTERPOLATION' });
        expect((data as { fix: string }).fix).toBeTruthy();

        const missing = await call('explain', { code: 'PDX_RAW_INTERPOLATIN' });
        expect(missing.isError).toBe(true);
        expect((missing.data as { closest: string }).closest).toBe('PDX_RAW_INTERPOLATION');
    });

    it('component: pdx-button with its props, description and import path', async () => {
        const { data } = await call('component', { tag: 'pdx-button' });
        const entry = data as { tag: string; description: string; importPath: string; package: string; attributes: { name: string }[] };
        expect(entry.tag).toBe('pdx-button');
        expect(entry.description).toBeTruthy();
        expect(entry.importPath).toBe('@pdxui/ui/button');
        expect(entry.package).toBe('@pdxui/ui');
        expect(entry.attributes.map(a => a.name)).toContain('variant');
    });

    it('component: a project component, from its .pdx', async () => {
        const { data } = await call('component', { tag: 'pdx-profile-card' });
        expect(data).toMatchObject({ tag: 'pdx-profile-card', file: expect.stringContaining('profile-card.pdx') });
    });

    it('component: an unknown tag is an error that says so', async () => {
        const { isError, data } = await call('component', { tag: 'pdx-nope' });
        expect(isError).toBe(true);
        expect(JSON.stringify(data)).toContain('pdx-nope');
    });

    it('components: tags with one-line descriptions, narrowed by a query', async () => {
        const { data } = await call('components', { query: 'dialog' });
        const list = data as { tag: string; description: string }[];
        expect(list.map(c => c.tag)).toContain('pdx-dialog');
        expect(list.every(c => /dialog/i.test(c.tag + ' ' + c.description))).toBe(true);
        expect(list.find(c => c.tag === 'pdx-dialog')!.description).not.toContain('\n');
    });

    it('project: the analyze manifest, with the route', async () => {
        const { data } = await call('project');
        const manifest = data as { components: { tag: string }[]; routes: { path: string; tag: string }[] };
        expect(manifest.components.map(c => c.tag).sort()).toEqual(['pdx-home', 'pdx-profile-card']);
        expect(manifest.routes).toEqual([expect.objectContaining({ path: '/', tag: 'pdx-home' })]);
    });

    it('docs: the best-matching sections, with their URLs', async () => {
        const { data } = await call('docs', { query: 'raw interpolation attribute' });
        const hits = data as { title: string; url: string; text: string }[];
        expect(hits[0]).toMatchObject({ title: 'Diagnostics', url: 'https://pdxui.com/docs/diagnostics' });
        expect(hits[0].text).toContain('PDX_RAW_INTERPOLATION');
        expect(hits.map(h => h.title), 'a section that matches nothing came back').not.toContain('Routing');
    });

    it('docs: a heading inside a page is found under that page and its URL', async () => {
        const { data } = await call('docs', { query: 'finding column' });
        const hits = data as { title: string; url: string }[];
        expect(hits[0]).toMatchObject({ title: 'Diagnostics › Reading a finding', url: 'https://pdxui.com/docs/diagnostics' });
    });
});
