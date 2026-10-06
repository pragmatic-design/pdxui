/**
 * DEMO of the `pragmatic` design-language (archetype × brand) — generates
 * pragmatic-styled themes from arbitrary brand colours into themes/generated/.
 *
 * NB: it does NOT ship these. The shipped `pragmatic`/`pragmatic-gold` are
 * hand-tuned SIGNATURE themes (their exact colours are the brand identity — the
 * engine's palette generation reshapes light brand colours like gold via the
 * white-label container model, so a signature gold must stay hand-tuned). The
 * archetype is for applying the Pragmatic *style* to any brand.
 *   npx tsx packages/design/scripts/gen-brand-themes.ts   (or: pnpm --filter @pdxui/design gen:themes)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTheme, oklchToHex } from '../src/engine/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'src', 'themes', 'generated');
mkdirSync(outDir, { recursive: true });

// Brand hexes derived from the hand-written OKLCH targets (hue is what matters).
const blue = oklchToHex({ l: 0.55, c: 0.2, h: 235 });
const goldAccent = oklchToHex({ l: 0.78, c: 0.15, h: 75 });
const gold = oklchToHex({ l: 0.78, c: 0.16, h: 85 });
const blueAccent = oklchToHex({ l: 0.55, c: 0.18, h: 235 });

const themes = {
    pragmatic: createTheme({ name: 'pragmatic', brandColor: blue, accentColor: goldAccent, language: 'pragmatic', radiusScale: 'rounded' }),
    // Same archetype, gold brand; only per-instance delta: card LEFT accent (blue uses top).
    'pragmatic-gold': createTheme({
        name: 'pragmatic-gold', brandColor: gold, accentColor: blueAccent, language: 'pragmatic', radiusScale: 'rounded',
        cssOverrides: '& .pdx-surface-card { border-top: 0; border-left: 3px solid var(--pdx-color-primary); }',
    }),
};

const header = (name: string) =>
    `/* GENERATED from the 'pragmatic' design-language (engine). Do NOT edit — edit engine/languages.ts.\n   Theme: ${name}. A convergence pilot, not shipped. */\n\n`;

for (const [name, theme] of Object.entries(themes)) {
    writeFileSync(join(outDir, `${name}.css`), header(name) + theme.toCSS() + '\n');
    const issues = theme.validate();
    const errors = issues.filter((i) => i.level === 'error');
    console.log(`${name}: ${issues.length} issues, ${errors.length} error(s)`);
    for (const e of errors) console.log('   ERROR', e.code, '—', e.message);
}
console.log('→ written to', outDir.replace(/\\/g, '/'));
