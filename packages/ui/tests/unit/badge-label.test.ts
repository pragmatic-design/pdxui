// A `pdx-badge` can say what it means.
//
// `label` names the badge; the variant word — "success indicator", "danger indicator" — is only the
// fallback of an unnamed dot. Without it, every presence dot in the galleries reads out a colour word.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/badge/pdx-badge';

async function mount(html: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await tick(20);
    return host;
}

afterEach(() => { document.body.innerHTML = ''; });

const status = (host: HTMLElement) => host.querySelector('[role="status"]')!;

describe('pdx-badge label', () => {
    it('names a dot with its label', async () => {
        const host = await mount('<pdx-badge dot variant="success" label="Online"></pdx-badge>');
        expect(status(host).getAttribute('aria-label')).toBe('Online');
    });

    it('falls back to the variant word only for an unnamed dot', async () => {
        const host = await mount('<pdx-badge dot variant="danger"></pdx-badge>');
        expect(status(host).getAttribute('aria-label')).toBe('danger indicator');
    });

    it('names a counter with its label, so "3" can read "3 unread messages"', async () => {
        const host = await mount('<pdx-badge value="3" label="3 unread messages"></pdx-badge>');
        expect(status(host).getAttribute('aria-label')).toBe('3 unread messages');
        expect(status(host).textContent).toBe('3');
    });

    it('leaves an unlabelled counter to its text', async () => {
        const host = await mount('<pdx-badge value="7"></pdx-badge>');
        expect(status(host).hasAttribute('aria-label')).toBe(false);
    });

    it('follows the label when it changes', async () => {
        const host = await mount('<pdx-badge dot variant="success" label="Online"></pdx-badge>');
        host.querySelector('pdx-badge')!.setAttribute('label', 'Away');
        await tick(20);
        expect(status(host).getAttribute('aria-label')).toBe('Away');
    });
});
