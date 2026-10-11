// The .pdx examples the project publishes, as files a compiler or a type-checker can take.
//
// Two sources: the site's docs pages (```pdx fences, often fragments) and the skills an agent reads
// (```html / ```pdx fences that carry a .pdx construct). Each is assembled into the smallest .pdx
// that carries it. Shared by the compile checks here and the type check in packages/lsp, so the two
// read the same examples the same way.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..');
export const DOCS = join(REPO, 'packages', 'site', 'content', 'docs');
const PLUGINS = join(REPO, 'marketplace', 'plugins');

/** One published example: where it is, and the .pdx it stands for. */
export interface PublishedExample {
    /** `data.md fence 3` or `pdxui/skills/…/x.md:120`: what a failure names. */
    where: string;
    /** The example as a complete .pdx. */
    source: string;
    /** A file name for it, unique across the set. */
    filename: string;
    /** A skill fence marked `partial`: not compiled. */
    partial: boolean;
}

/**
 * A line only a script starts with: a declaration rune, or a JavaScript statement. A template line
 * starts with markup, an interpolation or a block directive (`@if`, `@for`…), none of which is here.
 */
const SCRIPT_LINE = /^\s*(?:@(?:form|fetch|store|page|guard|prop|event|title|meta|scroll|slot|loader|expose|params|search|redirect|alias|outlet|prefetch)\b|(?:import|export|let|const|var|function|async|class|interface|type)\s|\$\w+\(|(?:effect|watch|onMount|onDestroy)\()/m;

/**
 * The smallest .pdx that carries a docs fragment. A fence with a `<script` is a file already, give
 * or take a template; a fragment that does not open with markup and has a script line is a script;
 * anything else is markup. Read as markup, a script fragment — `async function save() { … }` — is
 * text in a template, and nothing in it is ever checked (#39).
 */
function docsFile(body: string): string {
    const hasScript = /<script/.test(body);
    const hasTemplate = /<template/.test(body);
    if (hasScript && hasTemplate) return body;
    if (hasScript) {
        const markup = body.slice(0, body.indexOf('<script')).trim();
        const script = body.slice(body.indexOf('<script'));
        return `<template>\n${markup || '<div></div>'}\n</template>\n${script}`;
    }
    // A leading <!-- file name --> caption is not markup the fragment opens with, nor script.
    const uncaptioned = body.replace(/^\s*<!--[\s\S]*?-->[ \t]*\n?/, '');
    const opensWithMarkup = /^\s*(?:<|\{\{)/.test(uncaptioned);
    if (!opensWithMarkup && SCRIPT_LINE.test(uncaptioned)) return `<template><div></div></template>\n<script setup>\n${uncaptioned}\n</script>`;
    return `<template>\n${body}\n</template>`;
}

/** Every ```pdx fence of every docs page (api.md aside), in order. */
export function docsExamples(): PublishedExample[] {
    const out: PublishedExample[] = [];
    for (const file of readdirSync(DOCS).filter(f => f.endsWith('.md') && f !== 'api.md')) {
        const text = readFileSync(join(DOCS, file), 'utf-8').replace(/\r\n/g, '\n');
        const re = /```pdx\n([\s\S]*?)```/g;
        let m: RegExpExecArray | null;
        let index = 0;
        while ((m = re.exec(text)) !== null) {
            index++;
            out.push({
                where: `${file} fence ${index}`,
                source: docsFile(m[1]),
                filename: `${file.replace('.md', '')}-${index}.pdx`,
                partial: false,
            });
        }
    }
    return out;
}

/** A .pdx construct: a block directive, or an SFC block. */
const PDX_CONSTRUCT = /@for\b|@if\b|@try\b|@await\b|@switch\b|@defer\b|<script setup>|<template[\s>]/;

function skillFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) skillFiles(p, out);
        else if (p.endsWith('.md') && /[\\/]skills[\\/]/.test(p)) out.push(p);
    }
    return out;
}

/** A full SFC as is; a template fragment wrapped in one. */
function skillFile(code: string): string {
    if (/<template[\s>]/i.test(code) || /<script[\s>]/i.test(code)) return code;
    return `<template>\n${code}\n</template>`;
}

/**
 * Every ```html / ```pdx fence with a .pdx construct in marketplace/plugins/*\/skills. A topic
 * skill's copy of a docs page is left out: its fences are the docs' own, read by docsExamples().
 */
export function skillExamples(): PublishedExample[] {
    const found: PublishedExample[] = [];
    // Match: a fence at column 0, its info string, the body, the closing fence.
    // Groups: [1]=info string (lang + meta) [2]=body
    const FENCE = /^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm;
    for (const file of skillFiles(PLUGINS)) {
        const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
        if (text.startsWith('<!-- Copied from packages/site/content/docs/')) continue;
        for (const m of text.matchAll(FENCE)) {
            const [lang = '', ...meta] = m[1].trim().split(/\s+/);
            if (lang !== 'html' && lang !== 'pdx') continue;
            if (!PDX_CONSTRUCT.test(m[2])) continue;
            const line = text.slice(0, m.index).split('\n').length;
            found.push({
                where: `${relative(PLUGINS, file).replace(/\\/g, '/')}:${line}`,
                source: skillFile(m[2]),
                filename: `skill-example-${found.length}.pdx`,
                partial: meta.includes('partial'),
            });
        }
    }
    return found;
}

/** The formal language reference, one page per area (#120). */
export const LANGUAGE = join(REPO, 'docs', 'language');

/**
 * Every ```pdx fence of the language reference. Each is a complete .pdx as written: the reference
 * shows whole files, so nothing is assembled around it, and a fence that is not one fails its check.
 */
export function languageExamples(): PublishedExample[] {
    const out: PublishedExample[] = [];
    for (const file of readdirSync(LANGUAGE).filter(f => f.endsWith('.md'))) {
        const text = readFileSync(join(LANGUAGE, file), 'utf-8').replace(/\r\n/g, '\n');
        const re = /^```pdx\n([\s\S]*?)^```[ \t]*$/gm;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            const line = text.slice(0, m.index).split('\n').length;
            out.push({
                where: `docs/language/${file}:${line}`,
                source: m[1],
                filename: `language-${file.replace('.md', '')}-${line}.pdx`,
                partial: false,
            });
        }
    }
    return out;
}

/**
 * `src="./x.ts"` on a block is resolved by the Vite plugin against the file system. The examples
 * teach it, with files that do not exist: stand in for them by extension, so what is compiled is
 * the example's own shape.
 */
export const resolveStub = (src: string): string =>
    src.endsWith('.html') ? '<p class="n">{{ n }}</p>'
        : src.endsWith('.css') ? 'p { margin: 0; }'
            : 'let n = $signal(0);';
