/**
 * A component's mount moves none of its block copies' elements into the page's document before the
 * component is appended (#1287).
 *
 * A compiled block's markup is copied from a `<template>`'s content (`staticBlock`, #109), so a copy
 * belongs to the template's inert document, until the component's content is appended to the page. The
 * block helpers made their fragments and markers with the page's `document`: an `@if` inside a template
 * moved its branch into the page's fragment, back into the parent block's copy, and into the page again
 * at the append, an adoption each way. pdx-form-template's two nested `@if` mounted it 1.08–1.11× its
 * TypeScript version on CI; with the markers in the inert document (core's `blockDocument()`), 0.75×.
 * On main before the fix, 35 of the library's 120 components did it, pdx-scheduler with 286 elements a
 * mount.
 *
 * Measured in Chromium, which has the two documents (happy-dom's template content is the page's). Each
 * DOM insertion is wrapped: an element of the inert document moved into a node of the page's that is not
 * connected is one counted. An element a component's own script creates with `document` and places in
 * a copy (pdx-page-header's heading) goes the other way, and is not what this counts.
 */
import { test, expect } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { scenarioDist } from './scenarios-build';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** A static server over the scenario's build: module scripts do not load from file://. */
function serve(dir: string): Promise<{ url: string; server: Server }> {
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
        const file = join(dir, path === '/' || path === '\\' ? 'index.html' : path);
        if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    });
    return new Promise((done) => server.listen(0, '127.0.0.1', () => {
        done({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, server });
    }));
}

const manifestPath = resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'ui', 'custom-elements.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { modules: { declarations?: { tagName?: string }[] }[] };
const TAGS = manifest.modules.flatMap((m) => (m.declarations ?? []).flatMap((d) => (d.tagName ? [d.tagName] : []))).sort();

/**
 * Wraps the page's DOM insertions to count, in `window.__crossed`, the elements of the inert document
 * moved into a node of the page's document that is not connected.
 */
function countCrossings(): void {
    const w = window as unknown as { __crossed: number };
    w.__crossed = 0;
    const inPage = (n: Node) => n.ownerDocument === document;
    const elementsIn = (n: Node): number => (n instanceof Element ? 1 + n.querySelectorAll('*').length
        : n instanceof DocumentFragment ? n.querySelectorAll('*').length : 0);
    const count = (target: Node | null, moved: unknown[]) => {
        if (!target || target.isConnected || !inPage(target)) return;
        for (const n of moved) {
            if (!(n instanceof Node)) continue;
            for (const m of n instanceof DocumentFragment ? Array.from(n.childNodes) : [n]) if (!inPage(m)) w.__crossed += elementsIn(m);
        }
    };
    const insertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, child: Node | null): T { count(this, [node]); return insertBefore.call(this, node, child) as T; };
    const appendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function <T extends Node>(this: Node, node: T): T { count(this, [node]); return appendChild.call(this, node) as T; };
    for (const proto of [Element.prototype, CharacterData.prototype]) {
        const replaceWith = proto.replaceWith;
        proto.replaceWith = function (this: ChildNode, ...nodes: (Node | string)[]) { count(this.parentNode, nodes); replaceWith.apply(this, nodes); };
    }
}

let site: { url: string; server: Server };
test.beforeAll(async () => { site = await serve(scenarioDist('component-mount')); });
test.afterAll(async () => { await new Promise((r) => site.server.close(r)); });

test('the control: a copy\'s element moved into a fragment of the page is counted', async ({ page }) => {
    await page.goto(site.url);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    await page.evaluate(countCrossings);
    const crossed = await page.evaluate(() => {
        const t = document.createElement('template');
        t.innerHTML = '<p><b></b></p>';
        document.createDocumentFragment().appendChild(t.content.cloneNode(true).firstChild!);
        return (window as unknown as { __crossed: number }).__crossed;
    });
    expect(crossed, 'the counter did not see a copy\'s two elements enter the page\'s document').toBe(2);
});

test('no component moves its copies\' elements into the page\'s document before it is appended', async ({ page }) => {
    await page.goto(site.url);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    await page.evaluate(countCrossings);
    const rows = await page.evaluate((tags) => {
        const w = window as unknown as { __crossed: number };
        const out: [string, number][] = [];
        for (const tag of tags) {
            if (!customElements.get(tag)) continue;
            const host = document.createElement('div');
            document.body.appendChild(host);
            w.__crossed = 0;
            for (let i = 0; i < 10; i++) host.appendChild(document.createElement(tag));
            if (w.__crossed) out.push([tag, w.__crossed / 10]);
            host.remove();
        }
        return out;
    }, TAGS);
    expect(TAGS.length, 'the manifest lists no tag').toBeGreaterThan(100);
    expect(rows.map(([tag, n]) => `${tag}: ${n} elements a mount`)).toEqual([]);
});
