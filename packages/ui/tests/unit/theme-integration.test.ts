import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/input/pdx-input';
import '../../src/textarea/pdx-textarea';
import '../../src/password-input/pdx-password-input';
import '../../src/search-input/pdx-search-input';

describe('theme integration — pdx-input class on inner elements', () => {
    beforeEach(cleanup);

    it('pdx-input renders inner input with .pdx-input class', async () => {
        const el = document.createElement('pdx-input');
        document.body.appendChild(el);
        await tick(50);

        const inner = el.querySelector('input');
        expect(inner).toBeTruthy();
        expect(inner?.classList.contains('pdx-input')).toBe(true);
    });

    it('pdx-textarea renders inner textarea with .pdx-input class', async () => {
        const el = document.createElement('pdx-textarea');
        document.body.appendChild(el);
        await tick(50);

        const inner = el.querySelector('textarea');
        expect(inner).toBeTruthy();
        expect(inner?.classList.contains('pdx-input')).toBe(true);
    });

    it('pdx-password-input renders inner input with .pdx-input class', async () => {
        const el = document.createElement('pdx-password-input');
        document.body.appendChild(el);
        await tick(50);

        const inner = el.querySelector('input');
        expect(inner).toBeTruthy();
        expect(inner?.classList.contains('pdx-input')).toBe(true);
    });

    it('pdx-search-input renders inner input with .pdx-input class', async () => {
        const el = document.createElement('pdx-search-input');
        document.body.appendChild(el);
        await tick(50);

        const inner = el.querySelector('input');
        expect(inner).toBeTruthy();
        expect(inner?.classList.contains('pdx-input')).toBe(true);
    });

    it('pdx-input has wrapper with pdx-input-wrap class', async () => {
        const el = document.createElement('pdx-input');
        document.body.appendChild(el);
        await tick(50);

        const wrap = el.querySelector('.pdx-input-wrap');
        expect(wrap).toBeTruthy();
    });
});
