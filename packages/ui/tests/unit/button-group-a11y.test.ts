// pdx-button-group is an action group: role="group", no selection state on its buttons.
//
// - Its selection modes (mode="single"|"multiple") left it in #286 (decision 51): selecting among
//   buttons is pdx-toggle-group, whose radio group and aria-pressed group are measured in
//   toggle-group-beta-contract.spec.ts, and a migrated group in button-group-migrated.spec.ts.
// - `label` names the group. `aria-label` on the host does too, the host being the element
//   with the role; `label` is the prop the other groups have.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tick } from './helpers';
import '../../src/button/pdx-button';
import '../../src/button-group/pdx-button-group';

async function mount(html: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await tick(50);
    return host.querySelector('pdx-button-group') as HTMLElement;
}

const EDIT = `
    <pdx-button-group>
        <pdx-button value="cut">Cut</pdx-button>
        <pdx-button value="copy">Copy</pdx-button>
    </pdx-button-group>`;

const items = (g: HTMLElement) => Array.from(g.querySelectorAll<HTMLButtonElement>('button'));

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-button-group is an action group', () => {
    it('role="group", with no selection state on its buttons', async () => {
        const g = await mount(EDIT);
        expect(g.getAttribute('role')).toBe('group');
        expect(items(g).some(b => b.hasAttribute('aria-pressed') || b.hasAttribute('aria-checked') || b.hasAttribute('role'))).toBe(false);
    });

    it('a click selects nothing and announces nothing: the selection modes are gone', async () => {
        const g = await mount(EDIT);
        const heard: string[] = [];
        g.addEventListener('pdx-change', () => heard.push('pdx-change'));
        items(g)[0].click();
        await tick(50);
        expect(heard).toEqual([]);
        expect(items(g).some(b => b.hasAttribute('aria-pressed') || b.hasAttribute('aria-checked'))).toBe(false);
    });

    it('its manifest declares no mode, no value and no pdx-change', () => {
        const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'custom-elements.json'), 'utf8')) as {
            modules: { declarations: { tagName?: string; attributes?: { name: string }[]; events?: { name: string }[] }[] }[];
        };
        const d = manifest.modules.flatMap((m) => m.declarations).find((x) => x.tagName === 'pdx-button-group');
        const attrs = (d?.attributes ?? []).map((a) => a.name);
        expect(attrs).not.toContain('mode');
        expect(attrs).not.toContain('value');
        expect((d?.events ?? []).map((e) => e.name)).not.toContain('pdx-change');
    });
});

describe('pdx-button-group name', () => {
    it('label="Edit" names the element with the role', async () => {
        const g = await mount(EDIT.replace('<pdx-button-group>', '<pdx-button-group label="Edit">'));
        expect(g.getAttribute('aria-label')).toBe('Edit');
    });

    it('without label, an author aria-label is left as it is', async () => {
        const g = await mount(EDIT.replace('<pdx-button-group>', '<pdx-button-group aria-label="Clipboard">'));
        expect(g.getAttribute('aria-label')).toBe('Clipboard');
    });
});
