// pdx theme — generate a WCAG-AA theme from a brand color.
//
// The theme engine produces every color (OKLCH palettes), scale and behavior token
// deterministically, picks auto-contrast button labels, and validates the result.
// `--strict` (default) exits non-zero if any pair fails WCAG AA — so this doubles as
// a check you can wire into CI or an agent loop: generate → validate → fix.

import { defineCommand } from 'citty';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'pathe';
import { createTheme } from '@pdxui/design/engine';
import type { LanguageId } from '@pdxui/design/engine';
import { logger } from '../utils/logger';

export default defineCommand({
    meta: { name: 'theme', description: 'Generate a WCAG-AA theme from a brand color' },
    args: {
        name: { type: 'positional', description: 'Theme name (used as [pdx-theme="name"])', required: true },
        brand: { type: 'string', description: 'Brand color: #6442d6 or oklch(0.52 0.16 215) — use OKLCH for wide-gamut brands (hex clips them)', required: true },
        language: { type: 'string', description: 'Design language preset (material, fluent, cupertino, neutral…)', default: 'neutral' },
        accent: { type: 'string', description: 'Accent color, hex or oklch() (auto-derived complement if omitted)' },
        focus: { type: 'string', description: 'Focus-ring color, hex or oklch() (brand-derived if omitted)' },
        neutral: { type: 'string', description: 'Neutral hue 0-360 for gray tint (auto if omitted)' },
        density: { type: 'string', description: 'compact | normal | comfort', default: 'normal' },
        radius: { type: 'string', description: 'sharp | rounded | pill (preset default if omitted)' },
        out: { type: 'string', description: 'Write CSS to this file (prints to stdout otherwise)' },
        // citty renders a default-true boolean as `--no-strict`, so the text must read
        // correctly under THAT label (it described the opposite before).
        strict: { type: 'boolean', description: 'Emit the CSS even when a pair fails WCAG AA (strict is on by default)', default: true },
        quiet: { type: 'boolean', description: 'Suppress the validation report', default: false },
    },
    async run({ args }) {
        const theme = createTheme({
            name: String(args.name),
            brandColor: String(args.brand),
            language: String(args.language) as LanguageId,
            accentColor: args.accent ? String(args.accent) : undefined,
            focusColor: args.focus ? String(args.focus) : undefined,
            neutralHue: args.neutral != null ? Number(args.neutral) : undefined,
            density: String(args.density) as 'compact' | 'normal' | 'comfort',
            radiusScale: args.radius ? (String(args.radius) as 'sharp' | 'rounded' | 'pill') : undefined,
        });

        const issues = theme.validate();
        const errors = issues.filter(i => i.level === 'error');
        const warns = issues.filter(i => i.level === 'warning');

        if (!args.quiet) {
            for (const i of issues) {
                const line = `[${i.code}] ${i.message}${i.fix ? '  → ' + i.fix : ''}`;
                if (i.level === 'error') logger.error(line);
                else if (i.level === 'warning') logger.warn(line);
                else logger.info(line);
            }
        }

        const css = theme.toCSS();
        if (args.out) {
            const outPath = resolve(process.cwd(), String(args.out));
            // In a new project the folder is usually not there yet.
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, css + '\n');
            const status = errors.length ? `${errors.length} WCAG error(s)` : warns.length ? `${warns.length} warning(s)` : 'WCAG AA clean';
            logger.success(`Theme "${args.name}" → ${args.out} (${status})`);
        } else {
            process.stdout.write(css + '\n');
        }

        if (args.strict && errors.length) {
            logger.error(`Theme is not WCAG AA: ${errors.length} error(s). Pick a different brand/language or pass --no-strict to emit anyway.`);
            process.exit(1);
        }
    },
});
