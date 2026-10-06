// pdx build — production build (SPA via Vite, or standalone per-component).

import { defineCommand } from 'citty';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, basename, dirname, join, relative } from 'pathe';
import { compile, generateDts, parseSFC, analyzeScript, deriveTag } from '@pdxui/compiler';
import { loadConfigOrExit, resolveConfig } from '../config/loader';
import { scanPdxFiles } from '../manifest/scanner';
import { analyzeComponent } from '../manifest/generator';
import { logger } from '../utils/logger';

export default defineCommand({
    meta: { name: 'build', description: 'Production build' },
    args: {
        standalone: { type: 'boolean', default: false, description: 'Compile individual .pdx files without Vite' },
        outDir: { type: 'string', description: 'Output directory' },
        minify: { type: 'boolean', default: true, description: 'Minify output' },
        sourcemap: { type: 'string', default: 'false', description: 'Source maps: true | hidden (no sourceMappingURL comment) | false' },
    },
    async run({ args }) {
        const cwd = process.cwd();
        const sourcemap = parseSourcemap(args.sourcemap);
        if (sourcemap === null) {
            logger.error(`--sourcemap takes true, hidden or false, not "${String(args.sourcemap)}".`);
            process.exit(1);
            return;
        }
        const config = await loadConfigOrExit(cwd);
        const resolved = resolveConfig(config, cwd);
        const outDir = (args.outDir as string) ? resolve(cwd, args.outDir as string) : resolved.outDir;

        if (args.standalone) {
            await buildStandalone(resolved, outDir, args.minify as boolean, sourcemap);
        } else {
            await buildSpa(cwd, resolved, outDir, sourcemap);
        }
    },
});

/** What `--sourcemap` asks for: Vite's own `build.sourcemap` values, minus `inline`. */
type SourcemapMode = boolean | 'hidden';

/**
 * Reads `--sourcemap`. A bare `--sourcemap` (citty gives `''` or `true`) means `true`;
 * anything that is not true, hidden or false is `null`, and the command refuses it.
 */
function parseSourcemap(value: unknown): SourcemapMode | null {
    if (value === undefined || value === false || value === 'false') return false;
    if (value === true || value === '' || value === 'true') return true;
    if (value === 'hidden') return 'hidden';
    return null;
}

/** SPA build — wraps Vite build. */
async function buildSpa(
    cwd: string,
    resolved: ReturnType<typeof resolveConfig>,
    outDir: string,
    sourcemap: SourcemapMode
): Promise<void> {
    let vite: typeof import('vite');
    try {
        vite = await import('vite');
    } catch {
        logger.error('Vite is required for `pdx build`. Install with: pnpm add -D vite');
        process.exit(1);
    }

    const { pdx } = await import('@pdxui/compiler');

    await vite.build({
        root: cwd,
        plugins: [pdx({ plugins: resolved.plugins, minify: true, components: [resolved.components] })],
        build: {
            outDir,
            minify: 'esbuild',
            target: resolved.target,
            sourcemap,
        },
    });

    logger.success(`SPA build complete → ${outDir}/`);
}

/** Standalone build — compile individual .pdx files without Vite. */
async function buildStandalone(
    resolved: ReturnType<typeof resolveConfig>,
    outDir: string,
    minify: boolean,
    sourcemap: SourcemapMode
): Promise<void> {
    const files = await scanPdxFiles(resolved.root);
    if (files.length === 0) {
        logger.warn('No .pdx files found');
        return;
    }

    mkdirSync(outDir, { recursive: true });

    const fileResolver = (srcPath: string, fromFile: string): string => {
        const dir = dirname(fromFile);
        const resolved = resolve(dir, srcPath);
        return readFileSync(resolved, 'utf-8');
    };

    let compiled = 0;
    for (const file of files) {
        try {
            const source = readFileSync(file, 'utf-8');
            const name = basename(file, '.pdx');

            // Compile to JS
            const result = compile(source, file, resolved.plugins, fileResolver, { minify });
            if (sourcemap) {
                // The compiler names the source by its basename; beside the .js it is named
                // relative to the map, so a debugger finds the .pdx on disk.
                const map = { ...result.map, file: `${name}.js`, sources: [relative(outDir, file)] };
                writeFileSync(join(outDir, `${name}.js.map`), JSON.stringify(map));
            }
            const comment = sourcemap === true ? `\n//# sourceMappingURL=${name}.js.map\n` : '';
            writeFileSync(join(outDir, `${name}.js`), result.code + comment);

            // Generate .d.ts
            const descriptor = parseSFC(source);
            const analysis = analyzeScript(descriptor.script?.content ?? '', file, { setup: descriptor.script?.setup });
            // The tag the compiled module registers: `@tag`, else the compiler's rule.
            const tag = analysis.customTag ?? deriveTag(file);
            const dts = generateDts({
                tag,
                props: analysis.props,
                events: analysis.events,
                slots: analysis.slots,
            });
            writeFileSync(join(outDir, `${name}.d.ts`), dts);

            // Generate manifest
            const manifest = analyzeComponent(file, resolved.cwd);
            writeFileSync(join(outDir, `${name}.manifest.json`), JSON.stringify(manifest, null, 2));

            compiled++;
            if (result.warnings.length > 0) {
                logger.warn(`${name}.pdx: ${result.warnings.length} warnings`);
            }
        } catch (err) {
            logger.error(`Failed to compile ${file}: ${(err as Error).message}`);
        }
    }

    logger.success(`Standalone build: ${compiled} components → ${outDir}/`);
}
