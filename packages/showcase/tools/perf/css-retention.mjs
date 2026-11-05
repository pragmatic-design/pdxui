// Which rules of a stylesheet make Chromium keep removed elements: bisect it on about:blank.
//
//   node tools/perf/css-retention.mjs <css> [from to] [--attr <name>]
//   node tools/perf/css-retention.mjs <css> --each <from> <to> [--attr <name>]
//   node tools/perf/css-retention.mjs <css> --inner <index> [--attr <name>]
//
// Loads the top-level rules <from>..<to> of <css> (all of them by default) into about:blank, then
// inserts 20 `<div>`s one by one, sets <attr> (`data-part`) on each once it is in the page, removes
// it, and counts after a forced GC how many are still alive. Halve the range until one top-level rule
// is left; `--each` probes the rules of a range one at a time, and `--inner` the rules inside one
// top-level block (an `@layer`), each wrapped in the same block. This is how
// `[data-part="item"] + [data-part="item"]` was found in the list dividers (#887).
import { readFileSync } from 'node:fs';
import { launch } from './lib.mjs';
import { flag } from './memory.mjs';

const args = process.argv.slice(2);
const attr = flag(args, '--attr') ?? 'data-part';
const each = flag(args, '--each');
const inner = flag(args, '--inner');
const [file, a, b] = args;
if (!file) {
    console.error('usage: css-retention.mjs <css> [from to] | --each <from> <to> | --inner <index>  [--attr <name>]');
    process.exit(2);
}
const css = readFileSync(file, 'utf8');
const browser = await launch();

/** Detached elements still alive, of 20, with `cssText` loaded. */
async function alive(cssText) {
    const page = await browser.newPage();
    await page.goto('about:blank');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    await page.evaluate(({ cssText, attr }) => {
        const style = document.createElement('style');
        style.textContent = cssText;
        document.head.appendChild(style);
        window.__refs = [];
        for (let i = 0; i < 20; i++) {
            const el = document.createElement('div');
            el.textContent = 'x';
            document.body.appendChild(el);
            el.setAttribute(attr, 'root');
            el.getBoundingClientRect();
            el.remove();
            window.__refs.push(new WeakRef(el));
        }
    }, { cssText, attr });
    await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n > 5 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const n = await page.evaluate(() => window.__refs.filter((r) => r.deref()).length);
    await page.close();
    return n;
}

const page = await browser.newPage();
await page.goto('about:blank');
const rules = await page.evaluate((text) => { const s = new CSSStyleSheet(); s.replaceSync(text); return [...s.cssRules].map((r) => r.cssText); }, css);
const block = inner === undefined ? null : await page.evaluate((text) => {
    const s = new CSSStyleSheet(); s.replaceSync(text);
    const r = s.cssRules[0];
    return { name: r.name ?? '', rules: [...(r.cssRules ?? [])].map((x) => x.cssText) };
}, rules[Number(inner)]);
await page.close();

if (block) {
    console.log(`top-level rule ${inner}: @layer ${block.name}, ${block.rules.length} rules inside`);
    for (let i = 0; i < block.rules.length; i++) {
        const n = await alive(`@layer ${block.name} { ${block.rules[i]} }`);
        if (n > 0) console.log(`  inner ${i}: ${n} of 20 alive\n    ${block.rules[i].slice(0, 300)}`);
    }
    console.log('  (inner rules not listed keep nothing)');
} else if (each !== undefined) {
    for (let i = Number(each); i < Number(a); i++) console.log(`rule ${i}: ${await alive(rules[i])} of 20 alive`);
} else {
    const from = Number(a ?? 0), to = Number(b ?? rules.length);
    console.log(`rules ${from}..${to} of ${rules.length}: ${await alive(rules.slice(from, to).join('\n'))} of 20 alive; with no CSS: ${await alive('')} of 20`);
}
await browser.close();
