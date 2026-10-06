// `<pdx-avatar :src=${previewUrl}>` shows the picture the user just picked.
//
// A bound blob: or data:image URL reaches a component's `src` as it reaches a native <img>: if the
// link policy applied at the binding, the URL would never reach the prop, the <img> the avatar
// renders would never receive it, and the avatar would show the initials.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { html } from '@pdxui/core';
import '../../src/avatar/pdx-avatar';
import { tick } from './helpers';

const BLOB = 'blob:http://localhost/7c9f2e1a-4b3d-4e5f-9a8b-1c2d3e4f5a6b';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

async function avatarImg(frag: Node): Promise<HTMLImageElement | null> {
    document.body.appendChild(frag);
    await tick();
    return document.querySelector<HTMLImageElement>('pdx-avatar img');
}

describe('pdx-avatar :src', () => {
    it('a bound blob: URL reaches the rendered <img>', async () => {
        const img = await avatarImg(html`<pdx-avatar :src=${BLOB} alt="Ann Lee"></pdx-avatar>`);
        expect(img?.getAttribute('src')).toBe(BLOB);
    });

    it('a bound data:image/png reaches the rendered <img>', async () => {
        const img = await avatarImg(html`<pdx-avatar :src=${PNG} alt="Ann Lee"></pdx-avatar>`);
        expect(img?.getAttribute('src')).toBe(PNG);
    });

    it('the control: a javascript: URL does not, and the initials show instead', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const img = await avatarImg(html`<pdx-avatar :src=${'javascript:alert(1)'} alt="Ann Lee"></pdx-avatar>`);
        expect(img).toBeNull();
        expect(document.querySelector('pdx-avatar')?.textContent).toContain('AL');
    });
});
