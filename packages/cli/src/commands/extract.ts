// pdx extract — scan .pdx files for $t() calls and generate a translation template.
// Output: translations/template.json with all discovered keys.

import { defineCommand } from 'citty';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { scanPdxFiles } from '../manifest/scanner';
import { loadConfigOrExit, resolveConfig } from '../config/loader';
import { logger } from '../utils/logger';

export default defineCommand({
    meta: { name: 'extract', description: 'Extract translation keys from .pdx files' },
    args: {
        output: { type: 'string', default: 'src/translations/template.json', description: 'Output file path' },
        json: { type: 'boolean', default: false, description: 'Output to stdout as JSON' },
    },
    async run({ args }) {
        const cwd = process.cwd();
        const config = await loadConfigOrExit(cwd);
        const resolved = resolveConfig(config, cwd);

        const files = await scanPdxFiles(resolved.root);
        if (files.length === 0) {
            logger.warn('No .pdx files found');
            return;
        }

        // Scan all files for $t('key') calls
        const allKeys = new Set<string>();
        // Match: $t('key') or $t("key") — captures the key
        const regex = /\$t\s*\(\s*['"]([^'"]+)['"]/g;

        for (const file of files) {
            try {
                const source = readFileSync(file, 'utf-8');
                let match: RegExpExecArray | null;
                while ((match = regex.exec(source)) !== null) {
                    allKeys.add(match[1]);
                }
                regex.lastIndex = 0; // reset for next file
            } catch { /* skip unreadable files */ }
        }

        if (allKeys.size === 0) {
            logger.info('No $t() calls found in .pdx files');
            return;
        }

        // Build nested object from dot-notation keys
        const template: Record<string, unknown> = {};
        const sortedKeys = Array.from(allKeys).sort();

        for (const key of sortedKeys) {
            const parts = key.split('.');
            let current = template;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
                    current[parts[i]] = {};
                }
                current = current[parts[i]] as Record<string, unknown>;
            }
            current[parts[parts.length - 1]] = '';
        }

        const jsonOutput = JSON.stringify(template, null, 2);

        if (args.json) {
            console.log(jsonOutput);
        } else {
            const outPath = join(cwd, args.output as string);
            const outDir = dirname(outPath);
            if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
            writeFileSync(outPath, jsonOutput + '\n', 'utf-8');
            logger.success(`Extracted ${allKeys.size} keys to ${outPath}`);
        }
    },
});
