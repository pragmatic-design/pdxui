// The design system dims the page with a token, not with a value of its own.
//
// `--pdx-color-backdrop` names the role. A backdrop that writes its own value — an oklch, an rgba,
// a slate tint — leaves a theme that sets the token changing the dialog and not the field-list
// dialog beside it, and two dialogs from the same library dim the page differently. The lightbox is a sixth, near-opaque on purpose: a role of its own,
// `--pdx-color-backdrop-strong`, not a value.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'design', 'src');

function cssFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : []);
}

/** The declaration block of `selector` in `file`. */
function rule(file: string, selector: string): string {
    const css = readFileSync(join(SRC, file), 'utf-8');
    const at = css.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`${selector} not found in ${file}`);
    return css.slice(at, css.indexOf('}', at));
}

describe('the design system\'s backdrops', () => {
    it('no backdrop writes a black or slate value of its own', () => {
        // The issue's grep: a background that is translucent black (or the json-editor's slate).
        const literal = /background(-color)?:\s*(oklch\(0 0 0 \/|rgba\(0, ?0, ?0|rgba\(15, ?23, ?42)/;
        const found = cssFiles(SRC)
            .flatMap((f) => readFileSync(f, 'utf-8').split('\n').map((line, i) => ({ f, line, i })))
            .filter(({ line }) => literal.test(line))
            .map(({ f, i }) => `${f.slice(SRC.length + 1).replace(/\\/g, '/')}:${i + 1}`);
        expect(found, 'these dim the page with a value instead of the token').toEqual([]);
    });

    it('the modal ones use --pdx-color-backdrop', () => {
        for (const [file, selector] of [
            ['components/dialog.css', '.pdx-dialog-backdrop'],
            ['components/form.css', '.pdx-field-list-dialog-overlay'],
            ['components/app-layout.css', '.pdx-app-overlay'],
            ['components/fab.css', '.pdx-fab-mask'],
            ['components/json-editor.css', '.jed-back'],
        ]) {
            expect(rule(file, selector), `${selector} (${file})`).toContain('var(--pdx-color-backdrop)');
        }
    });

    it('the lightbox uses the strong one, and the token is declared', () => {
        expect(rule('components/image.css', '.pdx-img-lightbox')).toContain('var(--pdx-color-backdrop-strong)');
        expect(readFileSync(join(SRC, 'tokens.css'), 'utf-8')).toMatch(/--pdx-color-backdrop-strong:\s*oklch\(0 0 0 \/ 0\.9\)/);
    });
});
