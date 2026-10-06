// Small accessibility guarantees, batch 3.
//
// Pagination re-renders its buttons without dropping focus to <body> on a page change; OTP/PIN
// cells sit in a group and carry a count ("Digit 1 of 6"), and PIN cells do not offer SMS codes
// (autocomplete one-time-code); pdx-page-header's heading level is configurable, not always an h1.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/pagination/pdx-pagination';
import '../../src/otp-input/pdx-otp-input';
import '../../src/pin-input/pdx-pin-input';
import '../../src/page-header/pdx-page-header';

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

describe('pdx-pagination keeps focus', () => {
    beforeEach(cleanup);

    async function mountPager(page = 1): Promise<HTMLElement> {
        document.body.innerHTML = `<pdx-pagination total="100" page-size="10" page="${page}"></pdx-pagination>`;
        await tick(30);
        return document.body.firstElementChild as HTMLElement;
    }
    const byLabel = (el: Element, label: string) => el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;

    it('Next keeps focus on Next', async () => {
        const el = await mountPager();
        byLabel(el, 'Next page').focus();
        byLabel(el, 'Next page').click();
        await frame();
        expect(el.querySelector('[aria-current="page"]')?.getAttribute('aria-label')).toBe('Page 2');
        expect(document.activeElement).toBe(byLabel(el, 'Next page'));
    });

    it('a page number keeps focus on that page, now current', async () => {
        const el = await mountPager();
        byLabel(el, 'Page 2').focus();
        byLabel(el, 'Page 2').click();
        await frame();
        expect(document.activeElement).toBe(byLabel(el, 'Page 2'));
        expect(byLabel(el, 'Page 2').getAttribute('aria-current')).toBe('page');
    });

    it('Next onto the last page, where it is disabled, moves focus to the current page', async () => {
        const el = await mountPager(9);
        byLabel(el, 'Next page').focus();
        byLabel(el, 'Next page').click();
        await frame();
        expect(byLabel(el, 'Next page').disabled).toBe(true);
        expect(document.activeElement).toBe(el.querySelector('[aria-current="page"]'));
    });

    it('focus survives a parent that reflects the page back into the prop', async () => {
        const el = await mountPager() as HTMLElement & { page: number };
        el.addEventListener('pdx-change', (e) => { el.page = (e as CustomEvent).detail.page; });
        byLabel(el, 'Next page').focus();
        byLabel(el, 'Next page').click();
        await frame();
        await frame();
        expect(document.activeElement).toBe(byLabel(el, 'Next page'));
    });

    it('page buttons are named "Page n"; the ellipses are hidden', async () => {
        const el = await mountPager(5);
        expect(byLabel(el, 'Page 5')?.textContent).toBe('5');
        const dots = el.querySelectorAll('.pdx-page-ellipsis');
        expect(dots.length).toBeGreaterThan(0);
        for (const d of dots) expect(d.getAttribute('aria-hidden')).toBe('true');
    });
});

describe('OTP and PIN cells', () => {
    beforeEach(cleanup);

    it('OTP cells sit in a named group and say which of how many', async () => {
        document.body.innerHTML = '<pdx-otp-input length="6"></pdx-otp-input>';
        await tick(30);
        const group = document.querySelector('[role="group"]')!;
        expect(group).not.toBeNull();
        expect(group.getAttribute('aria-label')).toBe('Verification code');
        const cells = group.querySelectorAll('input');
        expect(cells.length).toBe(6);
        expect(cells[0].getAttribute('aria-label')).toBe('Digit 1 of 6');
        expect(cells[0].getAttribute('autocomplete')).toBe('one-time-code');
    });

    it('label names the OTP group', async () => {
        document.body.innerHTML = '<pdx-otp-input length="4" label="Login code"></pdx-otp-input>';
        await tick(30);
        expect(document.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Login code');
    });

    it('PIN cells are a "PIN" group and do not offer one-time codes', async () => {
        document.body.innerHTML = '<pdx-pin-input length="4"></pdx-pin-input>';
        await tick(40);
        const group = document.querySelector('[role="group"]')!;
        expect(group.getAttribute('aria-label')).toBe('PIN');
        const cells = group.querySelectorAll('input');
        expect(cells.length).toBe(4);
        for (const c of cells) expect(c.getAttribute('autocomplete')).toBe('off');
        expect(cells[3].getAttribute('aria-label')).toBe('Digit 4 of 4');
    });
});

describe('pdx-page-header heading level', () => {
    beforeEach(cleanup);

    it('heading-level="2" renders an h2; the default is an h1', async () => {
        document.body.innerHTML = '<pdx-page-header title="Patients" heading-level="2"></pdx-page-header><pdx-page-header title="Home"></pdx-page-header>';
        await tick(30);
        const [second, first] = Array.from(document.querySelectorAll('pdx-page-header'));
        expect(second.querySelector('h2.pdx-page-header-title')?.textContent).toBe('Patients');
        expect(second.querySelector('h1')).toBeNull();
        expect(first.querySelector('h1.pdx-page-header-title')?.textContent).toBe('Home');
    });

    it('the level follows the prop', async () => {
        document.body.innerHTML = '<pdx-page-header title="Patients"></pdx-page-header>';
        await tick(30);
        const el = document.body.firstElementChild as HTMLElement & { headingLevel: number };
        el.headingLevel = 3;
        await tick(10);
        expect(el.querySelector('h3.pdx-page-header-title')?.textContent).toBe('Patients');
    });
});
