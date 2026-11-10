// The declarations of the library's components written in .pdx (#1004). tsc --emitDeclarationOnly
// writes the .d.ts of every TypeScript module and reads no .pdx, so a .pdx component would ship with
// no types; this writes dist/<path>.d.ts for each, beside the dist/<path>.js the library build made of
// it, with the compiler's own generator — the declaration `pdx build` writes for an app's component.
//
// Run as part of `build`, after tsc. Behind a main() so a test can call writePdxDeclarations on a
// fixture without writing this package's dist.

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseSFC, parseTemplate, analyzeScript, deriveTag, generateDts, exposedMembers, dataPartCounts } from '@pdxui/compiler';
import { libraryEntries } from './library-entries.mjs';

/** The library's tag prefix: `pdx-x.pdx` registers `<pdx-x>`. */
const PREFIX = 'pdx';

/**
 * Write the .d.ts of every .pdx entry of the package at `root` into `outDir`. Returns the files written,
 * relative to `outDir`.
 *
 * @param {string} root
 * @param {string} outDir
 * @returns {string[]}
 */
export function writePdxDeclarations(root, outDir) {
    const written = [];
    for (const [rel, file] of Object.entries(libraryEntries(root))) {
        if (!file.endsWith('.pdx')) continue;
        const descriptor = parseSFC(readFileSync(file, 'utf-8'));
        const analysis = analyzeScript(descriptor.script?.content ?? '', file);
        const dts = generateDts({
            tag: analysis.customTag ?? deriveTag(file, PREFIX),
            props: analysis.props,
            events: analysis.events,
            slots: analysis.slots,
            // A part the template renders more than once is the array of its elements (#988).
            exposed: exposedMembers(analysis, dataPartCounts(parseTemplate(descriptor.template?.content ?? ''))),
        });
        const target = join(outDir, `${rel}.d.ts`);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, dts);
        written.push(`${rel}.d.ts`);
    }
    return written;
}

function main() {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const written = writePdxDeclarations(root, join(root, 'dist'));
    console.log(`[gen-pdx-dts] ${written.length} .pdx component declaration(s) → dist`);
}

// Only when run as a script: importing this file (the unit test does) must not write dist/.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
