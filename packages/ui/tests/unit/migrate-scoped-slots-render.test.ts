// What `pdx migrate` writes for the scoped-slot forms (#492) renders what the alpha form rendered.
// Each case compiles the alpha source and the migrated one, mounts both, and compares what they show.

import { describe, it, expect, beforeEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import { ComponentResolver } from '../../../compiler/src/component-resolver';
import { scopedSlotParent, scopedSlotOutlet, scriptSnippetInterpolation } from '../../../compiler/src/language/scoped-slots';
import type { LanguageChangeContext } from '../../../compiler/src/language/changes';
import { cleanup, tick } from './helpers';
import '../../src/list/pdx-list';

type Fix = (text: string, context?: LanguageChangeContext) => string;
const fixWith = (change: { fix: unknown }) => change.fix as Fix;

/** Compile a `.pdx` named `name` and define its element, as the app's build would. */
function define(name: string, src: string): void {
    const { code, warnings } = compile(src, `${name}.pdx`, [], undefined, {});
    expect(warnings.filter((w) => w.severity === 'error'), `${name} compiles with no error`).toEqual([]);
    const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
    expect(body, `${name} imports something besides @pdxui/core`).not.toMatch(/^import /m);
    new Function('__core', body)(core);
}

async function mount(tag: string): Promise<HTMLElement> {
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}

const text = (el: Element) => el.textContent?.replace(/\s+/g, ' ').trim();

beforeEach(cleanup);

describe('scoped-slot-parent renders what the let: slot rendered', () => {
    it('a pdx-list item slot and its @snippet show the same rows', async () => {
        const resolver = new ComponentResolver();
        resolver.registerUiManifest();
        const context: LanguageChangeContext = { snippetParamsOf: (tag) => resolver.snippetParamsOf(tag) };
        const alpha = '<template>\n  <pdx-list :items="people">\n    <slot name="item" let:item let:index>\n      <b class="row">{{ index + 1 }}. {{ item.name }}</b>\n    </slot>\n  </pdx-list>\n</template>\n'
            + "<script>\nlet people = $signal([{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }]);\n</script>\n";
        const migrated = fixWith(scopedSlotParent)(alpha, context);
        expect(migrated).toContain('@snippet item(item, index) {');

        define('mig-list-alpha', alpha);
        define('mig-list-beta', migrated);
        const before = [...(await mount('app-mig-list-alpha')).querySelectorAll('b.row')].map(text);
        const after = [...(await mount('app-mig-list-beta')).querySelectorAll('b.row')].map(text);
        expect(before).toEqual(['1. Ada', '2. Grace']);
        expect(after).toEqual(before);
    });
});

describe('scoped-slot-outlet: the migrated child renders its fallback, and a parent fills it', () => {
    const CHILD = '<template><ul>@for (items as it; track it) {<li><slot name="row" :item="it">({{ it }})</slot></li>}</ul></template>\n'
        + '<script>\n@prop items: string[] = [];\n</script>\n';

    it('with nothing given, both children show the fallback', async () => {
        const migrated = fixWith(scopedSlotOutlet)(CHILD);
        expect(migrated).toContain('@render row?.(it) @else');
        define('mig-child-alpha', CHILD);
        define('mig-child-beta', migrated);
        const a = await mount('app-mig-child-alpha');
        const b = await mount('app-mig-child-beta');
        (a as unknown as { items: string[] }).items = ['x', 'y'];
        (b as unknown as { items: string[] }).items = ['x', 'y'];
        await tick(20);
        expect(text(a)).toBe('(x)(y)');
        expect(text(b)).toBe(text(a));
    });

    it('a parent of the migrated child, with its slot migrated, compiles and renders its snippet', async () => {
        define('mig-child-gamma', fixWith(scopedSlotOutlet)(CHILD));
        const parent = "<template><app-mig-child-gamma :items=\"['p', 'q']\"><slot name=\"row\" let:item><i>{{ item }}!</i></slot></app-mig-child-gamma></template>\n";
        const migrated = fixWith(scopedSlotParent)(parent, { snippetParamsOf: (tag) => (tag === 'app-mig-child-gamma' ? new Map([['row', ['item']]]) : null) });
        expect(migrated).toContain('@snippet row(item) {');
        define('mig-parent', migrated);
        const el = await mount('app-mig-parent');
        expect([...el.querySelectorAll('i')].map(text)).toEqual(['p!', 'q!']);
    });
});

describe('script-snippet-interpolation renders what ${arg} rendered', () => {
    it('a script @snippet with ${arg}, migrated to {{ arg }}, shows the same', async () => {
        const alpha = "<template><p>@render tag('one') @render tag('two')</p></template>\n<script>\n@snippet tag(label: string) {\n  <span class=\"t\">${label}</span>\n}\n</script>\n";
        const migrated = fixWith(scriptSnippetInterpolation)(alpha);
        expect(migrated).toContain('<span class="t">{{ label }}</span>');
        define('mig-snip-alpha', alpha);
        define('mig-snip-beta', migrated);
        const before = [...(await mount('app-mig-snip-alpha')).querySelectorAll('span.t')].map(text);
        const after = [...(await mount('app-mig-snip-beta')).querySelectorAll('span.t')].map(text);
        expect(before).toEqual(['one', 'two']);
        expect(after).toEqual(before);
    });
});
