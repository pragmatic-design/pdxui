// pdx analyze — generate component manifest (pdx-manifest.json).
// `buildProjectManifest` is the work, which the MCP server calls too.

import { defineCommand } from 'citty';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'pathe';
import { scanPdxFiles } from '../manifest/scanner';
import { analyzeComponent } from '../manifest/generator';
import { loadConfigOrExit, resolveConfig } from '../config/loader';
import { logger } from '../utils/logger';
import type { PdxManifest } from '../manifest/schema';
import type { ResolvedConfig } from '../config/schema';

/** The project manifest: every .pdx under the project's root, and the route table. */
export async function buildProjectManifest(cwd: string, resolved: ResolvedConfig): Promise<{ manifest: PdxManifest; failed: { file: string; error: string }[] }> {
    const files = await scanPdxFiles(resolved.root);
    const manifest: PdxManifest = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        components: [],
        routes: [],
    };
    const failed: { file: string; error: string }[] = [];
    for (const file of files) {
        try {
            const component = analyzeComponent(file, cwd);
            manifest.components.push(component);
            if (component.route) manifest.routes.push(component.route);
        } catch (err) {
            failed.push({ file, error: (err as Error).message });
        }
    }
    manifest.routes.sort((a, b) => a.path.localeCompare(b.path));
    return { manifest, failed };
}

export default defineCommand({
    meta: { name: 'analyze', description: 'Generate the project manifest: components, props, events, slots, routes' },
    args: {
        out: { type: 'string', description: 'Output file path', default: 'pdx-manifest.json' },
        // For an agent: the manifest on stdout, nothing on disk and nothing else printed.
        json: { type: 'boolean', description: 'Print the manifest to stdout and write no file', default: false },
    },
    async run({ args }) {
        const cwd = process.cwd();
        const config = await loadConfigOrExit(cwd);
        const resolved = resolveConfig(config, cwd);
        const toStdout = args.json === true;

        const { manifest, failed } = await buildProjectManifest(cwd, resolved);
        for (const f of failed) logger.error(`Failed to analyze ${f.file}: ${f.error}`);
        if (manifest.components.length === 0 && failed.length === 0 && !toStdout) {
            logger.warn('No .pdx files found in', resolved.root);
            return;
        }

        if (toStdout) {
            process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
            return;
        }

        const outPath = resolve(cwd, args.out as string);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, JSON.stringify(manifest, null, 2));

        logger.success(
            `Manifest generated: ${args.out}` +
            ` — ${manifest.components.length} components, ${manifest.routes.length} routes`
        );
    },
});
