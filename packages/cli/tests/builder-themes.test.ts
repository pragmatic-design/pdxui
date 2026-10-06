// The builder offers a fixed theme list (packages/builder/src/config.ts) because
// @pdxui/design exposes none. That list is a second place where the shipped themes are
// named, so it can drift: a theme added to design/src/themes/ would never appear in the
// builder, and a removed one would be offered and render nothing.
//
// This is the guard. It fails on drift in either direction, naming the offenders.
//
// Lives in the CLI package for the same reason the theme-engine tests do: this is where
// vitest already exists and cross-package imports are normal.

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { THEMES } from '../../builder/src/config';

const here = dirname(fileURLToPath(import.meta.url));
const themesDir = resolve(here, '../../design/src/themes');

describe('builder theme list', () => {
    it('matches the CSS themes shipped by @pdxui/design', () => {
        const onDisk = readdirSync(themesDir)
            .filter(f => f.endsWith('.css'))
            .map(f => f.slice(0, -4))
            .sort();

        const declared = [...THEMES].sort();

        expect(declared, 'themes offered by the builder but not shipped').toEqual(onDisk);
    });

    it('offers neutral, the canvas theme', () => {
        expect(THEMES).toContain('neutral');
    });
});
