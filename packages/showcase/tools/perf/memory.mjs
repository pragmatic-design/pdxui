// What the memory tools share: a page of a build with a CDP session, a forced GC, a heap snapshot, and
// the live elements of a page. See README.md, «Memory».
import { launch, openScenario, serve } from './lib.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Take `--name <value>` out of `args` and return the value. */
export function flag(args, name) {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args.splice(at, 2)[1];
}

/** Serve the build in `dir`, open it, and attach CDP with the heap profiler on. */
export async function mountScenario(dir) {
    const server = await serve(resolve(dir));
    const browser = await launch();
    const page = await openScenario(browser, server.url);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    page.__cdp = cdp;
    return { page, browser, server, close: async () => { await browser.close(); server.close(); } };
}

/** A new page of the same build, with its own CDP session. */
export async function freshPage(browser, server) {
    const page = await openScenario(browser, server.url);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    page.__cdp = cdp;
    return page;
}

/** Two forced collections: one can leave what a finalizer released for the next. */
export async function gc(page) {
    await page.__cdp.send('HeapProfiler.collectGarbage');
    await page.__cdp.send('HeapProfiler.collectGarbage');
}

/** The used JS heap after a GC, in bytes. */
export async function heapUsed(page) {
    await gc(page);
    return (await page.__cdp.send('Runtime.getHeapUsage')).usedSize;
}

/** A heap snapshot after a GC, parsed. */
export async function snapshot(page) {
    await gc(page);
    let text = '';
    const onChunk = ({ chunk }) => { text += chunk; };
    page.__cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await page.__cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    page.__cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    return JSON.parse(text);
}

/**
 * The detached elements still alive after a GC, by `tag[data-part].class`. The engine's shared
 * `<template>`s are left out: they live for the page by design.
 */
export async function detachedElements(page) {
    await gc(page);
    const { result: proto } = await page.__cdp.send('Runtime.evaluate', { expression: 'Element.prototype' });
    const { objects } = await page.__cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.objectId });
    const { result } = await page.__cdp.send('Runtime.callFunctionOn', {
        objectId: objects.objectId,
        returnByValue: true,
        // The prototypes of Element's subclasses are in the list too; reading an element's members off
        // a prototype throws, and those are skipped.
        functionDeclaration: `function () {
            const names = {}; let total = 0;
            for (const e of this) {
                let name;
                try {
                    if (e.isConnected || e.localName === 'template') continue;
                    const part = e.getAttribute('data-part');
                    const cls = typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '';
                    name = e.localName + (part ? '[' + part + ']' : '') + cls;
                } catch (x) { continue; }
                total++;
                names[name] = (names[name] ?? 0) + 1;
            }
            return { total, names: Object.entries(names).sort((a, b) => b[1] - a[1]) };
        }`,
    });
    return result.value;
}

/** Every tag of the library's manifest. */
export function manifestTags() {
    const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', '..', '..', 'ui', 'custom-elements.json'), 'utf8'));
    return manifest.modules.flatMap((m) => (m.declarations ?? []).flatMap((d) => (d.tagName ? [d.tagName] : []))).sort();
}
