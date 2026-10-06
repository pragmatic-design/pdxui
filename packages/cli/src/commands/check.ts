// pdx check — validate all .pdx files in project.
// Output: human-readable (default) or JSON (--json for agent loop).
// Fix mode: --fix applies the fixes findings carry, and reports the file as it is after.
// The work itself is `runCheck` (check-run.ts), which the MCP server calls too.

import { defineCommand } from 'citty';
import { loadConfigOrExit, resolveConfig } from '../config/loader';
import { logger } from '../utils/logger';
import { runCheck, checkJson } from './check-run';

export { checkI18nKeys } from './check-run';

export default defineCommand({
    meta: { name: 'check', description: 'Validate .pdx files' },
    args: {
        json: { type: 'boolean', default: false, description: 'Output structured JSON' },
        fix: { type: 'boolean', default: false, description: 'Apply the fixes findings carry; the report describes the files after' },
        severity: { type: 'string', default: 'warn', description: 'Minimum severity to report: error, warn, info' },
        i18n: { type: 'boolean', default: false, description: 'Validate i18n: check translation keys across locales' },
        'max-warnings': { type: 'string', description: 'Exit 1 when there are more warnings than this' },
        design: { type: 'boolean', default: false, description: 'Add the design review: the heuristics and cross-file rules (category "design")' },
        types: { type: 'boolean', default: false, description: 'Type-check the script and template of every .pdx, as the editor does (PDX_TS errors)' },
    },
    async run({ args }) {
        const cwd = process.cwd();
        const config = await loadConfigOrExit(cwd);
        const resolved = resolveConfig(config, cwd);

        const result = await runCheck(cwd, resolved, {
            fix: !!args.fix, severity: args.severity as string, i18n: !!args.i18n, design: !!args.design, types: !!args.types,
        });
        if (result.checked === 0) {
            logger.warn('No .pdx files found in', resolved.root);
            return;
        }
        const { reports, totalErrors, totalWarnings, totalFixed, totalIgnored } = result;
        if (result.typecheckSeconds !== undefined && !args.json) {
            logger.info(`Type-checked ${result.checked} files in ${result.typecheckSeconds.toFixed(1)}s`);
        }

        // Output
        if (args.json) {
            console.log(JSON.stringify(checkJson(result), null, 2));
        } else {
            for (const r of reports) {
                if (r.errors.length === 0 && r.warnings.length === 0 && r.fixed.length === 0) continue;

                logger.log(`\n${r.file}`);
                for (const e of r.errors) logger.error(`  ERROR: ${e}`);
                for (const w of r.warnings) {
                    const icon = w.severity === 'error' ? '✗' : w.severity === 'warn' ? '⚠' : 'ℹ';
                    const fixTag = w.fixable ? ' [fixable]' : '';
                    // `file:line:column`, the form a terminal turns into a link to the line.
                    const at = w.line !== undefined ? ` ${r.file}:${w.line}:${w.column ?? 1}` : '';
                    logger.warn(`  ${icon} ${w.code}${at}: ${w.message}${fixTag}`);
                    if (w.hint) logger.info(`    Hint: ${w.hint}`);
                }
                for (const f of r.fixed) logger.success(`  ✓ fixed ${f.code}: ${f.title}`);
            }

            if (totalErrors === 0 && totalWarnings === 0) {
                logger.success(`✓ ${result.checked} files checked — no issues found`);
            } else {
                const fixMsg = totalFixed > 0 ? `, ${totalFixed} fixed` : '';
                const ignoredMsg = totalIgnored > 0 ? `, ${totalIgnored} ignored by pdx-ignore` : '';
                logger.log(`\n${result.checked} files, ${totalErrors} errors, ${totalWarnings} warnings${fixMsg}${ignoredMsg}`);
                if (!args.fix && reports.some(r => r.warnings.some(w => w.fixable))) {
                    logger.info('Run pdx check --fix to auto-fix fixable issues.');
                }
            }
        }

        if (totalErrors > 0) process.exit(1);
        // A budget for warnings, so CI can hold the line on them as it does on errors.
        const maxWarnings = args['max-warnings'] === undefined ? undefined : Number(args['max-warnings']);
        if (maxWarnings !== undefined && !(Number.isInteger(maxWarnings) && maxWarnings >= 0)) {
            logger.error(`--max-warnings takes a whole number, got "${args['max-warnings']}"`);
            process.exit(1);
        } else if (maxWarnings !== undefined && totalWarnings > maxWarnings) {
            if (!args.json) logger.error(`${totalWarnings} warnings, more than --max-warnings ${maxWarnings}`);
            process.exit(1);
        }
    },
});
