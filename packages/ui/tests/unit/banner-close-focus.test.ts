// Closing a banner from the keyboard keeps the user's place.
//
// Enter on "Close" hides the banner with focus inside it; if focus fell to <body>, a keyboard user
// would be sent back to the top of the page. It goes to the next focusable element after the banner,
// or the previous one when nothing follows.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/banner/pdx-banner';

async function mount(html: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await tick(30);
    return host;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-banner close', () => {
    it('moves focus to the next focusable element when the focused close button hides it', async () => {
        const host = await mount('<button id="before">Before</button><pdx-banner closable>Saved.</pdx-banner><button id="after">After</button>');
        const close = host.querySelector<HTMLButtonElement>('.pdx-banner-close')!;
        close.focus();
        close.click();
        expect(document.activeElement?.id).toBe('after');
    });

    it('moves focus back to the previous one when nothing follows', async () => {
        const host = await mount('<button id="before">Before</button><pdx-banner closable>Saved.</pdx-banner>');
        const close = host.querySelector<HTMLButtonElement>('.pdx-banner-close')!;
        close.focus();
        close.click();
        expect(document.activeElement?.id).toBe('before');
    });

    it('leaves focus alone when it was not in the banner', async () => {
        const host = await mount('<button id="elsewhere">Elsewhere</button><pdx-banner closable>Saved.</pdx-banner><button id="after">After</button>');
        host.querySelector<HTMLButtonElement>('#elsewhere')!.focus();
        (host.querySelector('pdx-banner') as HTMLElement & { dismiss(): void }).dismiss();
        expect(document.activeElement?.id).toBe('elsewhere');
    });
});
