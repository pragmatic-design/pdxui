import { test, expect } from '@playwright/test';
import { expandLibraryVariants, type LibraryAxis } from '../../compiler/src/compiler/variant-css';

// A library `@variant` rule (#512, specified by #626) reaches its own component and the native element
// its axis maps, and stops at a component nested inside: core marks every host with `data-pdx-root`,
// and the compiled selector excludes what sits under one. Measured in Chromium, which also proves the
// selector parses — a selector the browser rejects drops the whole rule, and nothing would turn red.

const BUTTON: LibraryAxis[] = [
    { name: 'variant', values: ['primary', 'solid', 'ghost'], default: 'primary', native: { primary: '.pdx-primary', solid: '.pdx-primary', ghost: '.pdx-ghost' } },
    { name: 'size', values: ['md', 'sm'], default: 'md' },
];
const CSS = expandLibraryVariants(`
    @variant pdx-button variant(ghost) { [data-part="root"] { color: rgb(255, 0, 0); } }
    @variant pdx-button variant(primary) { [data-part="root"] { color: rgb(0, 0, 255); } }
    @variant pdx-button size(sm) { :scope { outline: 3px solid rgb(0, 128, 0); } }
    @variant pdx-button variant(ghost, solid) and size(sm, md) { [data-part="root"] { text-decoration: underline; } }
`, undefined, (tag) => (tag === 'pdx-button' ? BUTTON : undefined));

const PAGE = `<!doctype html><style>${CSS}</style>
<pdx-button data-pdx-root variant="ghost" size="sm">
  <button data-part="root" id="ghost">ghost</button>
  <pdx-card data-pdx-root>
    <span data-part="root" id="nested">a nested component's root</span>
  </pdx-card>
</pdx-button>
<pdx-button data-pdx-root variant="solid"><button data-part="root" id="solid">solid</button></pdx-button>
<pdx-button data-pdx-root variant="primary"><button data-part="root" id="primary">primary</button></pdx-button>
<button class="pdx-ghost" id="native-ghost">native</button>
<button class="pdx-primary" id="native-primary">native</button>
<button data-part="root" id="outside">no host</button>`;

test('a library @variant rule reaches its component and its native element, not a nested component', async ({ page }) => {
    await page.setContent(PAGE);
    const color = (id: string) => page.evaluate((id) => getComputedStyle(document.getElementById(id)!).color, id);
    expect(await color('ghost'), 'the host\'s own root part').toBe('rgb(255, 0, 0)');
    expect(await color('native-ghost'), 'the native selector the axis maps').toBe('rgb(255, 0, 0)');
    expect(await color('solid'), 'a value sharing the native selector shares the rule').toBe('rgb(0, 0, 255)');
    expect(await color('primary')).toBe('rgb(0, 0, 255)');
    expect(await color('native-primary')).toBe('rgb(0, 0, 255)');
    // The bound, and the control for it: the nested root would be red without `:not(…)`.
    expect(await color('nested'), 'the root of a component nested in the host').not.toBe('rgb(255, 0, 0)');
    expect(await color('outside'), 'a root part under no host').toBe('rgb(0, 0, 0)');
    const outline = await page.evaluate(() => getComputedStyle(document.querySelector('pdx-button[size="sm"]')!).outlineColor);
    expect(outline, ':scope is the host').toBe('rgb(0, 128, 0)');
    // Several values: any of them on each axis.
    const line = (id: string) => page.evaluate((id) => getComputedStyle(document.getElementById(id)!).textDecorationLine, id);
    expect(await line('ghost'), 'ghost and sm').toBe('underline');
    expect(await line('solid'), 'solid with no size: the size test fails').toBe('none');
    expect(await line('native-ghost'), 'the size axis has no native selector: no native form').toBe('none');
});
