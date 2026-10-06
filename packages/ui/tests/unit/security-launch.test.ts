// Security: chart tooltip values must be escaped, sanitised HTML must carry no user id, link
// hrefs must be scheme-sanitised on every export, and pasted markup must go through the whitelist.
import { describe, it, expect } from 'vitest';
import { sanitizeHTML } from '../../src/shared/sanitize';
import { toHTML } from '../../src/rich-text/format/html';
import { toMarkdown } from '../../src/rich-text/format/markdown';
import { parseClipboardHTML } from '../../src/rich-text/view/clipboard';
import { defaultSchema } from '../../src/rich-text/model/schema';
import { createNode, createText } from '../../src/rich-text/model/node';
import { createMark } from '../../src/rich-text/model/mark';

import { showTooltip, hideTooltip } from '../../src/chart/core/tooltip';

// Chart tooltip must escape data value and series color (innerHTML)
describe('chart tooltip escaping', () => {
    it('escapes a malicious non-numeric y value and a color breakout', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const info: any = {
            x: 10, y: 10, label: 'L',
            points: [{
                series: { name: 'S', color: 'red"><img src=x onerror=alert(1)>' },
                point: { x: 0, y: '<img src=x onerror=alert(2)>' },
                px: 0, py: 0,
            }],
        };
        const theme: any = { bgColor: '#fff', textColor: '#000', gridColor: '#ccc', fontFamily: 'sans' };
        showTooltip(info, theme, container);
        const tip = document.querySelector('.pdx-chart-tooltip')!;
        // The real security property: no element was injected from the data (the
        // malicious value renders as inert escaped text, so "onerror" survives only as
        // literal characters — hence we assert on the parsed DOM, not the raw string).
        expect(tip.querySelector('img')).toBeNull();
        // Only the static structure survives: label div + row div + dot span + <strong> value.
        expect(tip.querySelectorAll('*').length).toBe(4);
        hideTooltip();
    });
});

// DOM clobbering: user id must not survive HTML sanitization
describe('sanitizeHTML strips id in HTML context', () => {
    it('drops a clobbering id but keeps class', () => {
        const out = sanitizeHTML('<div id="attributes" class="ok">x</div>');
        expect(out).not.toMatch(/id=/i);
        expect(out).toMatch(/class="ok"/i);
    });
});

// Link href must be scheme-sanitized on every export path
describe('rich-text link href sanitization', () => {
    const doc = createNode('doc', {}, [
        createNode('paragraph', {}, [
            createText('click', [createMark('link', { href: 'javascript:alert(1)' })]),
        ]),
    ]);

    it('strips javascript: in HTML export', () => {
        expect(toHTML(doc)).not.toMatch(/javascript:/i);
    });

    it('strips javascript: in Markdown export', () => {
        expect(toMarkdown(doc)).not.toMatch(/javascript:/i);
    });

    it('strips javascript: from a pasted link at the model frontier', () => {
        const nodes = parseClipboardHTML('<a href="javascript:alert(1)">x</a>', defaultSchema);
        const json = JSON.stringify(nodes);
        expect(json).not.toMatch(/javascript:/i);
    });

    it('keeps safe https links', () => {
        const safe = createNode('doc', {}, [createNode('paragraph', {}, [
            createText('ok', [createMark('link', { href: 'https://example.com' })]),
        ])]);
        expect(toHTML(safe)).toMatch(/https:\/\/example\.com/);
    });
});

// Pasted markup with handlers/scripts must not survive into the model
describe('paste goes through the whitelist sanitizer', () => {
    it('drops event handlers from pasted HTML', () => {
        const nodes = parseClipboardHTML('<p>hi<img src=x onerror="alert(1)"></p>', defaultSchema);
        expect(JSON.stringify(nodes)).not.toMatch(/onerror/i);
    });
});
