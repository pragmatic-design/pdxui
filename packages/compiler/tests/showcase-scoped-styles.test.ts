// A showcase page styles only itself (#1070).
//
// A `<style>` without `scoped` is global, and a page's module is loaded with the app, not only when
// its route opens. comp-bottom-sheet.pdx wrote `.page { max-width: 800px; margin: 0 auto }`, `section`
// and `h2` in one, and every page of the showcase was drawn in a centred column 800px wide on any
// screen: the scheduler, the data grid and the kanban scrolled inside 750px of a 1440px content area.
// A page's style is `scoped`; what the whole showcase shares is in showcase-shared.css.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const PAGES = join(REPO, 'packages', 'compiler', 'demo', 'showcase-new', 'pages');

/** Every `.pdx` under `dir`, subfolders included. */
function pdxFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) pdxFiles(full, out);
        else if (name.endsWith('.pdx')) out.push(full);
    }
    return out;
}

/** Whether a file has a `<style>` block that is not `scoped`. */
function hasGlobalStyle(file: string): boolean {
    // Match: a <style …> opening tag at the start of a line, a block of the file, not a `&lt;style&gt;` in a
    // source sample. Groups: [1]=its attributes
    return [...readFileSync(file, 'utf8').matchAll(/^<style\b([^>]*)>/gim)].some((m) => !/\bscoped\b/.test(m[1]));
}

describe('a showcase page styles only itself (#1070)', () => {
    const files = pdxFiles(PAGES);

    it('found the pages, so the assertion below is not vacuous', () => {
        expect(files.length).toBeGreaterThan(100);
        expect(files.some((f) => /^<style scoped>/m.test(readFileSync(f, 'utf8')))).toBe(true);
    });

    it('no page has a <style> without scoped', () => {
        const global = files.filter(hasGlobalStyle).map((f) => relative(REPO, f).replace(/\\/g, '/'));
        expect(global, 'these pages restyle every other page: make the style scoped').toEqual([]);
    });

    it('no page sets the width of the page container: it is showcase-shared.css\'s', () => {
        // Thirteen did, at 800 to 1280px, each page a different width, some to get past the 800px above.
        // Match: a `.page { … }` rule (not `.page .x`, which styles inside it) that sets a width.
        const own = files.filter((f) => [...readFileSync(f, 'utf8').matchAll(/^<style\b[^>]*>([\s\S]*?)^<\/style>/gim)]
            .some((m) => [...m[1].matchAll(/(?:^|[\s,}])\.page\s*\{([^}]*)\}/g)].some((r) => /(?:^|[\s;])(?:max-)?width\s*:/.test(r[1]))));
        expect(own.map((f) => relative(REPO, f).replace(/\\/g, '/')), 'these pages size their own container').toEqual([]);
    });
});
