// The string work of `pdx build --ssg` (#160, part 5c): which scripts are the app's, how a built page
// is split at its body and put back together around a route's markup, where each page is written.

import { describe, it, expect } from 'vitest';
import { appEntries } from '../src/commands/ssg-entry';
import { bodyParts, generatedPage, pageFile, renderableMarkup } from '../src/commands/ssg-page';

describe('the app\'s entry scripts', () => {
    it('are the module scripts, loaded or inline, in the order the page runs them, from the root', () => {
        const html = '<head><script type="module" src="/@pdx/hydrate.js"></script></head><body>'
            + '<script type="module" src="./src/main.js"></script><script type="module">import \'./src/app.pdx\';</script>'
            + '<script type="module" src="/src/b.ts"></script><script type="module">  </script>'
            + '<script src="/legacy.js"></script><script type="module" src="https://cdn.example/x.js"></script></body>';
        expect(appEntries(html)).toEqual([{ src: '/src/main.js' }, { inline: "import './src/app.pdx';" }, { src: '/src/b.ts' }]);
    });
});

describe('a built page around a route', () => {
    const BUILT = '<!doctype html><html><head><title>T</title><style id="pdx-splash-style">#pdx-splash{}</style>\n</head>'
        + '<body class="app" aria-busy="true">\n<div id="pdx-splash" aria-hidden="true"><span>T</span></div>'
        + '<pdx-router-outlet></pdx-router-outlet>\n<script type="module" src="/assets/a.js"></script></body></html>';

    it('is split at its body, the scripts apart from the markup', () => {
        const parts = bodyParts(BUILT)!;
        expect(parts.before.endsWith('<body class="app" aria-busy="true">')).toBe(true);
        expect(parts.scripts).toEqual(['<script type="module" src="/assets/a.js"></script>']);
        expect(renderableMarkup(parts)).toBe('<pdx-router-outlet></pdx-router-outlet>');
        expect(parts.after).toBe('</body></html>');
    });

    it('is written with the route\'s markup, its scripts after it, and no splash', () => {
        const page = generatedPage(bodyParts(BUILT)!, '<pdx-router-outlet data-pdx-ssg="/"><h1>x</h1></pdx-router-outlet>');
        expect(page).toContain('<body class="app">');
        expect(page).not.toContain('pdx-splash');
        expect(page).toContain('<pdx-router-outlet data-pdx-ssg="/"><h1>x</h1></pdx-router-outlet>\n<script type="module" src="/assets/a.js"></script>\n</body></html>');
    });

    it('finds a script\'s end as the HTML parser does, with a space or a slash before the >', () => {
        const parts = bodyParts('<html><body><p>a</p><SCRIPT type="module">x()</SCRIPT ><p>b</p>'
            + '<script>y()</script\n><scripts-list></scripts-list></body></html>')!;
        expect(parts.scripts).toEqual(['<SCRIPT type="module">x()</SCRIPT >', '<script>y()</script\n>']);
        expect(parts.markup).toBe('<p>a</p><p>b</p><scripts-list></scripts-list>');
    });

    it('has no body to split when there is none', () => {
        expect(bodyParts('<html><head></head></html>')).toBeNull();
    });
});

describe('where a page is written', () => {
    it('at the route\'s path, as an index.html', () => {
        expect(pageFile('/')).toBe('index.html');
        expect(pageFile('/about')).toBe('about/index.html');
        expect(pageFile('/posts/1/')).toBe('posts/1/index.html');
    });
});
