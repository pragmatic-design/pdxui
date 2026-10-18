// Style checks — what a `<style>` block says that the browser will not read.
//
// Separate from validate.ts, which checks script against template and never sees the styles.

import type { SFCStyle } from '../parser/sfc';
import type { ValidationWarning } from './validate';

/**
 * PDX_GLOBAL_SELECTOR — `:global(...)` is Vue's and Svelte's escape from a scoped style, and it is
 * not CSS. PDX passes it through, so the browser drops the whole rule, silently.
 *
 * PDX does not need it: a plain `<style>` block is global. A scoped style stops at a child component
 * (#152), whose public surface is its parts, states and tokens. The message carries the selector
 * without the wrapper. Reported in a plain block too: the browser drops the rule there as well.
 *
 * `source` is the whole file, because `style.start` is an offset into it: the line reported is the
 * file's, not the block's.
 */
export function validateStyles(styles: SFCStyle[], source: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    for (const style of styles) {
        // Comments blanked to the same length, so offsets still map onto the file.
        const css = style.content.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
        // Match: a selector (after the previous `}`, `;` or `{`) containing :global(, up to its `{`.
        // Groups: [1]=the selector
        const re = /(?:^|[{};])\s*([^{};]*:global\([^{};]*?)\s*\{/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(css)) !== null) {
            const selector = m[1].trim();
            const rewritten = selector.replace(/:global\(\s*([^()]*?)\s*\)/g, '$1');
            const at = style.start + m.index + m[0].indexOf(m[1]);
            warnings.push({
                code: 'PDX_GLOBAL_SELECTOR',
                severity: 'warn',
                message: `':global()' is not CSS, and the browser drops the rule '${selector}'. `
                    + `A rule meant for the whole page belongs in a plain <style> block: write '${rewritten}' there.`,
                hint: `Replace '${selector}' with '${rewritten}' in a plain <style> block.`,
                line: source.slice(0, at).split('\n').length,
            });
        }
    }
    return warnings;
}
