// The splash the compiler writes into index.html.
import { describe, it, expect } from 'vitest';
import { injectSplash } from '../src/splash';

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <title>PDX Service Desk</title>
</head>
<body class="app">
    <pdx-app></pdx-app>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>`;

describe('injectSplash', () => {
    it('paints the app name before the app root, as its sibling, and marks the body busy', () => {
        const html = injectSplash(PAGE);
        expect(html).toContain('<body class="app" aria-busy="true">');
        const splash = html.indexOf('id="pdx-splash"');
        expect(splash).toBeGreaterThan(-1);
        expect(splash, 'inside or after the app root: mounting would clear it').toBeLessThan(html.indexOf('<pdx-app>'));
        expect(html).toMatch(/<div id="pdx-splash" aria-hidden="true"><span>PDX Service Desk<\/span><\/div>/);
    });

    it('its style is in the head, fixed over the viewport, with a 200 ms fade and none under reduced motion', () => {
        const html = injectSplash(PAGE);
        const head = html.slice(0, html.indexOf('</head>'));
        expect(head).toContain('#pdx-splash{position:fixed;inset:0');
        expect(head).toContain('transition:opacity .2s ease');
        expect(head).toContain('@media (prefers-reduced-motion:reduce){#pdx-splash{transition:none}}');
        expect(head).toContain('#pdx-splash.pdx-splash-leaving{opacity:0;pointer-events:none}');
    });

    it('takes a title, a logo and a minimum duration, and escapes them', () => {
        const html = injectSplash(PAGE, { title: 'Acme <Desk>', logo: '/logo.svg', minDuration: 400 });
        expect(html).toContain('<div id="pdx-splash" aria-hidden="true" data-min-duration="400"><img src="/logo.svg" alt=""><span>Acme &lt;Desk&gt;</span></div>');
    });

    it('is idempotent: Vite transforms the page more than once', () => {
        const once = injectSplash(PAGE);
        expect(injectSplash(once)).toBe(once);
    });

    it('control — a page without a body is left as it is', () => {
        expect(injectSplash('<div>fragment</div>')).toBe('<div>fragment</div>');
    });
});
