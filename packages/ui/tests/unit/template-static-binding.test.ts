// A `:attr` or `@event` in an html`` template of a .ts component binds only a `${…}` placeholder.
//
// The runtime engine binds a `:`-prefixed attribute only when its value is a placeholder
// (bindAttribute in core's renderer/template.ts), so a static value such as `:aria-valuemin="0"` is
// never seen by it, and the browser keeps an attribute literally named ":aria-valuemin": a slider
// that exposes a value and a maximum, and no minimum. `.pdx` files get compiler diagnostics for this
// family; `.ts` components written with the runtime html tag get none — so this scan is their guard.
// It reads the source, not the DOM: the runtime cannot tell a mistake from an attribute that really
// contains a colon.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { tick, cleanup } from './helpers';
import '../../src/rating/pdx-rating';

const SRC = join(__dirname, '..', '..', 'src');

function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) sourceFiles(p, acc);
        else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) acc.push(p);
    }
    return acc;
}

/** Stands for a `${…}` in the joined static text of a template. */
const HOLE = '__PDX_HOLE__';

/** Attributes whose name starts with `:` or `@`, with their value (quoted or bare). */
const BOUND_ATTR = /\s([:@][\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g;

/**
 * Every `:x` / `@x` attribute in an html`` template whose value is not exactly one placeholder,
 * as `line: attribute="value"`.
 */
function staticBindings(text: string, fileName = 'x.ts'): string[] {
    const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === 'html') {
            const tpl = node.template;
            const joined = ts.isNoSubstitutionTemplateLiteral(tpl)
                ? tpl.text
                : tpl.head.text + tpl.templateSpans.map(s => HOLE + s.literal.text).join('');
            const startLine = sf.getLineAndCharacterOfPosition(tpl.getStart(sf)).line + 1;
            for (const m of joined.matchAll(BOUND_ATTR)) {
                const value = m[2] ?? m[3] ?? m[4] ?? '';
                if (value === HOLE) continue;
                const line = startLine + (joined.slice(0, m.index).match(/\n/g)?.length ?? 0);
                found.push(`${line}: ${m[1]}="${value.split(HOLE).join('${…}')}"`);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

afterEach(cleanup);

describe('html`` templates in packages/ui/src bind :attr and @event only to a placeholder', () => {
    it('no .ts component has a static or mixed :attr / @event value', () => {
        const report: string[] = [];
        for (const file of sourceFiles(SRC)) {
            for (const hit of staticBindings(readFileSync(file, 'utf-8'), file)) {
                report.push(`${relative(SRC, file)}:${hit}`);
            }
        }
        expect(report, 'a :attr or @event the runtime will never bind — write it as a plain attribute, or bind a ${…}').toEqual([]);
    });

    it('the scan reports a static :attr — the shape pdx-rating had', () => {
        const src = 'const t = html`<div role="slider" :aria-valuemin="0"></div>`;';
        expect(staticBindings(src)).toEqual(['1: :aria-valuemin="0"']);
    });

    it('the scan reports a value that mixes text and a placeholder, and a static @event', () => {
        const src = 'const t = html`<div\n  :class="a ${x}"\n  @click="go"></div>`;';
        expect(staticBindings(src)).toEqual(['2: :class="a ${…}"', '3: @click="go"']);
    });

    it('the control: a placeholder value, quoted or bare, is not reported, and a comment is not a template', () => {
        const src = [
            '// <x :value="light">',
            'const t = html`<div :aria-valuemax="${max}" @click=${go} :tabindex=\'${t}\' aria-valuemin="0"></div>`;',
        ].join('\n');
        expect(staticBindings(src)).toEqual([]);
    });
});

describe('pdx-rating exposes its minimum', () => {
    it('the slider carries aria-valuemin="0", and no attribute named with a colon', async () => {
        document.body.innerHTML = '<pdx-rating></pdx-rating>';
        await tick(20);
        const slider = document.querySelector('pdx-rating [role="slider"]')!;
        expect(slider, 'the rating rendered no slider').toBeTruthy();
        expect(slider.getAttribute('aria-valuemin')).toBe('0');
        const colon = Array.from(slider.attributes).map(a => a.name).filter(n => n.startsWith(':'));
        expect(colon, 'an attribute the template engine never bound').toEqual([]);
    });
});
