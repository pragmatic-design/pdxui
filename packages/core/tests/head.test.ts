// Tests for useHead runtime.

import { describe, it, expect, afterEach } from 'vitest';
import { useHead } from '../src/browser/head';

// Track disposes to clean up after each test
const disposeFns: (() => void)[] = [];
afterEach(() => {
    for (const d of disposeFns) d();
    disposeFns.length = 0;
});

describe('useHead()', () => {
    it('sets document.title', () => {
        const originalTitle = document.title;
        const dispose = useHead({ title: 'My Page' });
        disposeFns.push(dispose);

        expect(document.title).toBe('My Page');

        dispose();
        expect(document.title).toBe(originalTitle);
    });

    it('creates meta name tag', () => {
        const dispose = useHead({
            meta: [{ name: 'description', content: 'Test page' }],
        });
        disposeFns.push(dispose);

        const meta = document.querySelector('meta[name="description"]');
        expect(meta).toBeTruthy();
        expect(meta?.getAttribute('content')).toBe('Test page');

        dispose();
        expect(document.querySelector('meta[name="description"]')).toBeNull();
    });

    it('creates meta property tag (Open Graph)', () => {
        const dispose = useHead({
            meta: [{ property: 'og:title', content: 'OG Title' }],
        });
        disposeFns.push(dispose);

        const meta = document.querySelector('meta[property="og:title"]');
        expect(meta).toBeTruthy();
        expect(meta?.getAttribute('content')).toBe('OG Title');
    });

    it('creates link tags', () => {
        const dispose = useHead({
            link: [{ rel: 'canonical', href: 'https://example.com' }],
        });
        disposeFns.push(dispose);

        const link = document.querySelector('link[rel="canonical"]');
        expect(link).toBeTruthy();
        expect(link?.getAttribute('href')).toBe('https://example.com');

        dispose();
        expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    });

    it('creates multiple tags at once', () => {
        const dispose = useHead({
            title: 'Multi',
            meta: [
                { name: 'author', content: 'Pragmatic' },
                { name: 'viewport', content: 'width=device-width' },
            ],
            link: [
                { rel: 'icon', href: '/favicon.ico' },
            ],
        });
        disposeFns.push(dispose);

        expect(document.title).toBe('Multi');
        expect(document.querySelector('meta[name="author"]')).toBeTruthy();
        expect(document.querySelector('meta[name="viewport"]')).toBeTruthy();
        expect(document.querySelector('link[rel="icon"]')).toBeTruthy();
    });

    it('dispose removes all created tags', () => {
        const dispose = useHead({
            meta: [
                { name: 'robots', content: 'noindex' },
                { property: 'og:image', content: '/img.png' },
            ],
        });

        expect(document.querySelector('meta[name="robots"]')).toBeTruthy();
        dispose();
        expect(document.querySelector('meta[name="robots"]')).toBeNull();
        expect(document.querySelector('meta[property="og:image"]')).toBeNull();
    });
});
