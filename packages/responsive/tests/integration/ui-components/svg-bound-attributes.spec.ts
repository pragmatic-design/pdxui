// An attribute bound on an SVG element through `html` sets the attribute, in a browser.
//
// On an SVG element `width`, `height`, `x`, `y`, `href` and `className` are read-only SVGAnimated*
// views, and `camel in el` is true for them, so a binding that takes the property path assigns and
// throws: "TypeError: Cannot set property width of #<SVGRectElement> which has only a getter".
// happy-dom does not model those properties, so a core test takes the attribute path and passes; the
// only place the defect can show is a real browser. `<input :value>` is the control: an HTML element keeps
// assigning the property.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=svg-bound-attributes';

interface Read {
    width: string | null;
    x: string | null;
    href: string | null;
    circleClass: string | null;
    groupClass: string | null;
    labelText: string;
    labelAttrs: string[];
}

type Api = {
    mount(): { error: string | null };
    mountInput(): { value: string; valueAttr: string | null };
    set(w: number, x: number, cls: string, groupCls: string, label: string): void;
    read(): Read | null;
};
const read = (page: Page) => page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.read());

test.describe('attributes bound on SVG elements', () => {
    test('are set as attributes, follow their signals, and throw nothing', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', e => pageErrors.push(String(e)));
        await openPage(page, BASE);

        const mounted = await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.mount());
        expect(mounted.error, 'rendering the template threw').toBeNull();
        expect(pageErrors).toEqual([]);

        expect(await read(page)).toMatchObject({
            width: '40',
            x: '5',
            href: '#t',
            circleClass: 'base hot',
            groupClass: 'grp',
            labelText: 'first',
        });

        await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.set(70, 12, 'cold', 'grp2', 'second'));
        await expect.poll(() => read(page)).toMatchObject({
            width: '70', x: '12', circleClass: 'base cold', groupClass: 'grp2', labelText: 'second',
        });
        expect(pageErrors).toEqual([]);
    });

    test('a property SVG can assign keeps the property path: :textContent is text, not an attribute', async ({ page }) => {
        await openPage(page, BASE);
        await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.mount());
        const r = await read(page);
        expect(r?.labelText).toBe('first');
        expect(r?.labelAttrs.map(a => a.toLowerCase())).not.toContain('text-content');
    });

    test('the control: an HTML <input :value> still assigns the property, not the attribute', async ({ page }) => {
        await openPage(page, BASE);
        const r = await page.evaluate(() => (window as unknown as { __gotcha: Api }).__gotcha.mountInput());
        expect(r.value).toBe('typed');
        expect(r.valueAttr, 'the value went to the attribute: the property path was lost').toBeNull();
    });
});
