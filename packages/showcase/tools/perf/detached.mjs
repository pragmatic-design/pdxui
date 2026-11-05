// Detached elements a component leaves alive after its removal, tag by tag.
//
//   node tools/perf/detached.mjs <dir> [tag …] [--mounts <n>]
//
// For each tag (every tag of the manifest when none is named), in a fresh page of the component-mount
// build in <dir>: <n> rounds (5) of 100 mounted and removed, a forced GC, then every detached element
// still alive, by `tag[data-part].class`. The retention spec counts a component's own instances; this
// counts what is left of its tree, which can leak while the instance does not.
import { detachedElements, flag, freshPage, manifestTags, mountScenario } from './memory.mjs';

const args = process.argv.slice(2);
const mounts = Number(flag(args, '--mounts') ?? 5);
const [dir, ...named] = args;
if (!dir) {
    console.error('usage: detached.mjs <dir> [tag …] [--mounts <n>]');
    process.exit(2);
}
const tags = named.length ? named : manifestTags();
const { page: first, browser, server, close } = await mountScenario(dir);
await first.close();
let leaving = 0;
for (const tag of tags) {
    const page = await freshPage(browser, server);
    for (let i = 0; i < mounts; i++) await page.evaluate((t) => window.__mount(t, 100), tag);
    const { total, names } = await detachedElements(page);
    await page.close();
    if (total === 0 && named.length === 0) continue;
    if (total > 0) leaving++;
    console.log(`${tag.padEnd(22)} ${String(total).padStart(6)} detached  ${names.slice(0, 3).map(([n, c]) => `${n} ×${c}`).join(', ')}`);
}
console.log(`${leaving} of ${tags.length} tags leave detached elements after ${mounts * 100} mounts`);
await close();
