// gen-grammar.mjs — writes the rune alternations of the PDX grammar from the compiler's one rune
// list.
//
// A grammar with its own copy of the runes drifts, and the runes it misses are not highlighted.
// Everything else in the grammar is
// written by hand and kept as it is; only the two alternations below are generated.
//
// Usage: node scripts/gen-grammar.mjs   (or `npm run gen-grammar` in packages/vscode-pdx)
// `packages/lsp/tests/grammar.test.ts` fails when the committed grammar is not what this writes.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const GRAMMAR_PATH = join(here, '..', 'syntaxes', 'pdx.tmLanguage.json');
const RUNES_PATH = join(here, '..', '..', 'compiler', 'src', 'compiler', 'runes.ts');

/**
 * The grammar with its rune alternations written from `runes`: the declarations into
 * `pdx-decorators`, the `$` functions into the first rule of `pdx-runes`. Pure: the caller writes.
 */
export function generateGrammar(grammar, runes) {
    const out = structuredClone(grammar);
    const names = (kind) => runes.filter((r) => r.kind === kind).map((r) => r.name).join('|');
    out.repository['pdx-decorators'].patterns[0].match = `^\\s*@(${names('decorator')})\\b`;
    out.repository['pdx-runes'].patterns[0].match = `\\$(${names('function')})\\b`;
    return out;
}

/** The grammar file's text for `grammar`, the way it is committed. */
export function grammarText(grammar) {
    return JSON.stringify(grammar, null, 2) + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    // runes.ts has no imports and only erasable types: Node (22.18+) loads it as it is.
    const { RUNES } = await import(pathToFileURL(RUNES_PATH).href);
    const grammar = JSON.parse(readFileSync(GRAMMAR_PATH, 'utf-8'));
    writeFileSync(GRAMMAR_PATH, grammarText(generateGrammar(grammar, RUNES)));
    console.log(`pdx.tmLanguage.json: ${RUNES.length} runes`);
}
