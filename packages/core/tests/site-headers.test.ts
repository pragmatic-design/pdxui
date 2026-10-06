// The headers pdxui.com sends, asserted where they are declared.
//
// `packages/site` has no suite of its own — its signal is a browser — so this lives here beside
// the other repository-wide structural tests (`build-contract`, `docs-language`), and like them it
// reads a file rather than shelling out to anything.
//
// The CSP is a code decision as much as a hosting one. `HEAD https://pdxui.com` answers
// `Microsoft-IIS/8.5` and returns `x-content-type-options: nosniff` — the header `web.config`
// declares. So the site is not on GitHub Pages (which ignores `web.config` and can send no custom
// header at all), the file is live, and a CSP is a two-line change in this repository. `public/CNAME` is the misleading artefact: a
// Pages convention on a site Pages does not serve.
//
// What the policy can and cannot do is the part worth pinning. The playground runs `new Function`,
// so `script-src` must allow `unsafe-eval` — the directive a CSP most wants to forbid — and while
// that is true the policy CANNOT stop injected inline script. It still constrains where script may
// be loaded from, forbids plugins, pins the base URI and refuses framing, which is worth having and
// is not the same as being protected. Dropping `unsafe-eval` means moving the playground to its own
// origin, and the two are one decision, not two.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installAnalytics } from '../../site/src/lib/analytics';

const WEB_CONFIG = join(__dirname, '..', '..', 'site', 'public', 'web.config');
const config = readFileSync(WEB_CONFIG, 'utf8');

/** The value of a `<add name="..." value="..." />` custom header, or null. */
function header(name: string): string | null {
    const m = config.match(new RegExp(`<add\\s+name="${name}"\\s+value="([^"]*)"`, 'i'));
    return m ? m[1] : null;
}

describe('the headers pdxui.com declares', () => {
    it('found web.config and it declares custom headers', () => {
        // Without this, every assertion below is satisfied by a file that failed to load or by a
        // regex that stopped matching the markup.
        expect(config.length, 'web.config is empty or unreadable').toBeGreaterThan(500);
        expect(config, 'the customHeaders block is gone').toContain('<customHeaders>');
    });

    it('still sends X-Content-Type-Options', () => {
        // Measured arriving in production, so this one is not theoretical. It is asserted here
        // because it shares a block with the CSP: an edit that drops the block drops both.
        expect(header('X-Content-Type-Options')).toBe('nosniff');
    });

    it('sends a Content-Security-Policy', () => {
        expect(header('Content-Security-Policy'), 'no CSP is declared').not.toBeNull();
    });

    it('the policy carries the directives a meta tag could not set', () => {
        // `frame-ancestors` is refused inside a <meta http-equiv> and only works as a real header.
        // Asserting it is how this test knows it is looking at a header policy and not at a
        // decorative copy of one that a `<meta>` would silently ignore.
        const csp = header('Content-Security-Policy') ?? '';
        for (const directive of ['default-src', 'script-src', 'object-src', 'base-uri', 'frame-ancestors']) {
            expect(csp, `${directive} missing from the policy`).toContain(directive);
        }
        // 'self', not 'none': /integrations frames the site's own /integrations/<app>/index.html, and
        // 'none' refuses it. Another origin is still refused.
        expect(csp, 'frame-ancestors must refuse framing by another origin').toMatch(/frame-ancestors\s+'self'(;|$)/);
        expect(csp, 'object-src must refuse plugins').toMatch(/object-src\s+'none'/);
    });

    it("the policy does not allow inline SCRIPT", () => {
        // `unsafe-eval` is there by decision and documented in the file. Inline script is the one
        // that would make the policy nearly worthless, and it is the plausible future edit: someone
        // adds an inline script, the console complains, and the fastest fix is to allow it. This
        // fails then, which is the only moment it is useful.
        //
        // Per DIRECTIVE, and that distinction is the whole assertion. A check over the entire
        // policy string fails on `style-src 'unsafe-inline'` — and the config is right, not such a
        // check: `usePopover` positions every floating element with
        // `content.style.position = 'fixed'`, and there are 266 inline-style assignments across
        // core and ui. A style-src without `'unsafe-inline'` puts every popover, tooltip, select
        // dropdown and calendar in the top-left corner. Inline STYLE is a small, necessary
        // concession; inline SCRIPT is the thing a CSP exists to refuse.
        //
        // The policy is read rather than defaulted to '': with no CSP at all, `not.toContain` over
        // an empty string passes, and this case would report green for a site sending no policy
        // whatsoever — a check that cannot fail measures nothing.
        const csp = header('Content-Security-Policy');
        expect(csp, 'there is no policy for this case to check').not.toBeNull();

        const directive = (name: string) =>
            csp!.split(';').map(d => d.trim()).find(d => d.startsWith(`${name} `)) ?? '';

        expect(directive('script-src'), 'script-src must exist to be checked').not.toBe('');
        expect(directive('script-src'), "inline script turns the policy into decoration")
            .not.toContain("'unsafe-inline'");

        // The concession, pinned so it stays deliberate rather than spreading.
        expect(directive('style-src'), 'style-src needs the inline concession the framework relies on')
            .toContain("'unsafe-inline'");
    });

    it('lets in what index.html loads from other origins, and nothing broader', () => {
        // index.html loads Google Fonts and the Cloudflare Web Analytics beacon. A policy that
        // refuses them is a site with system fonts and no analytics, and nothing in the console a
        // visitor reads; each host is named, never a wildcard.
        const csp = header('Content-Security-Policy') ?? '';
        const directive = (name: string) => csp.split(';').map(d => d.trim()).find(d => d.startsWith(`${name} `)) ?? '';
        expect(directive('style-src')).toContain('https://fonts.googleapis.com');
        expect(directive('font-src')).toContain('https://fonts.gstatic.com');
        expect(directive('script-src')).toContain('https://static.cloudflareinsights.com');
        expect(directive('connect-src')).toContain('https://cloudflareinsights.com');
        expect(csp, 'a wildcard source lets in any host').not.toMatch(/(^|\s)(\*|https:)(\s|;|$)/);
    });

    it('and the site installs the Cloudflare Web Analytics beacon the policy allows', () => {
        const site = join(__dirname, '..', '..', 'site');
        expect(readFileSync(join(site, 'index.html'), 'utf8'), 'index.html never calls the installer')
            .toMatch(/import \{ installAnalytics \} from '\.\/src\/lib\/analytics';\s*installAnalytics\(\);/);
        const lib = readFileSync(join(site, 'src', 'lib', 'analytics.ts'), 'utf8');
        expect(lib).toContain("'https://static.cloudflareinsights.com/beacon.min.js'");
        expect(lib).toMatch(/TOKEN = '[0-9a-f]{32}'/);
    });

    it('the beacon runs on pdxui.com and nowhere else: not in dev, preview or the site\'s tests', () => {
        expect(installAnalytics('localhost'), 'a local run would report to the analytics').toBeNull();
        expect(installAnalytics('127.0.0.1')).toBeNull();
        expect(document.querySelectorAll('script[data-cf-beacon]')).toHaveLength(0);

        const script = installAnalytics('pdxui.com')!;
        expect(script.src).toBe('https://static.cloudflareinsights.com/beacon.min.js');
        expect(JSON.parse(script.getAttribute('data-cf-beacon')!)).toEqual({ token: 'bee9003c93894465ab2b9d8397939622' });
        expect(script.isConnected).toBe(true);
        script.remove();
    });

    it('says in the file why unsafe-eval is there', () => {
        // A directive nobody can explain is one the next reader deletes or, worse, copies. The
        // reason, and what it would take to remove it, are part of the change, not commentary on it.
        expect(config, "'unsafe-eval' is present with no comment explaining it")
            .toMatch(/unsafe-eval[\s\S]{0,900}?playground to a separate origin/);
    });
});
