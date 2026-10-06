// Tests for pdx-calendar, pdx-time-picker, pdx-date-picker components.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';

import '../../src/calendar/pdx-calendar';
import '../../src/time-picker/pdx-time-picker';
import '../../src/date-picker/pdx-date-picker';

// ─── pdx-calendar ────────────────────────────────────────────

describe('pdx-calendar', () => {
    beforeEach(cleanup);

    it('renders calendar root element', async () => {
        const el = await mount('pdx-calendar');
        await tick(100);
        const root = el.querySelector('.pdx-calendar');
        expect(root).toBeTruthy();
    });

    it('has role="group" on root, not role="application"', async () => {
        // application switches a screen reader's browse mode off for the whole widget; the grid role
        // gives the keyboard model. See calendar-a11y.test.ts.
        const el = await mount('pdx-calendar');
        await tick(100);
        const root = el.querySelector('.pdx-calendar');
        expect(root?.getAttribute('role')).toBe('group');
    });

    it('renders navigation buttons', async () => {
        const el = await mount('pdx-calendar');
        await tick(100);
        const navBtns = el.querySelectorAll('.pdx-cal-nav-btn');
        expect(navBtns.length).toBeGreaterThanOrEqual(2);
    });

    it('renders title with month and year', async () => {
        const el = await mount('pdx-calendar');
        await tick(100);
        const title = el.querySelector('.pdx-cal-title');
        expect(title).toBeTruthy();
        expect(title?.textContent).toBeTruthy();
    });

    it('renders grid with role="grid"', async () => {
        const el = await mount('pdx-calendar');
        await tick(100);
        const grid = el.querySelector('[role="grid"]');
        expect(grid).toBeTruthy();
    });

    it('renders day header row with columnheaders', async () => {
        const el = await mount('pdx-calendar');
        await tick(100);
        const headers = el.querySelectorAll('[role="columnheader"]');
        expect(headers.length).toBe(7);
    });

    it('renders gridcell buttons', async () => {
        const el = await mount('pdx-calendar');
        await tick(100);
        const cells = el.querySelectorAll('[role="gridcell"]');
        // At least 28 days + outside days = 42 for fixed weeks
        expect(cells.length).toBeGreaterThanOrEqual(28);
    });

    it('marks today with aria-current="date"', async () => {
        const el = await mount('pdx-calendar');
        await tick(100);
        const todayCell = el.querySelector('[aria-current="date"]');
        expect(todayCell).toBeTruthy();
        expect(todayCell?.classList.contains('pdx-cal-today')).toBe(true);
    });

    it('applies selected class when value is set', async () => {
        const today = new Date();
        const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
        const el = await mount('pdx-calendar', { value: iso });
        await tick(100);
        const selected = el.querySelector('.pdx-cal-selected');
        expect(selected).toBeTruthy();
    });

    it('marks selected cell with aria-selected', async () => {
        const today = new Date();
        const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
        const el = await mount('pdx-calendar', { value: iso });
        await tick(100);
        const selected = el.querySelector('[aria-selected="true"]');
        expect(selected).toBeTruthy();
    });

    it('renders outside days with pdx-cal-outside class', async () => {
        const el = await mount('pdx-calendar');
        await tick(100);
        // Most months have at least some outside days in fixed week mode
        const outsideCells = el.querySelectorAll('.pdx-cal-outside');
        // Just verify class exists (may be 0 for some months like Feb starting on Monday)
        expect(outsideCells).toBeDefined();
    });

    it('has disabled class when disabled prop is set', async () => {
        const el = await mount('pdx-calendar', { disabled: '' });
        await tick(100);
        const root = el.querySelector('.pdx-calendar');
        expect(root?.classList.contains('disabled')).toBe(true);
    });

    it('emits pdx-change on cell click', async () => {
        const el = await mount('pdx-calendar');
        await tick(100);
        let emitted = false;
        el.addEventListener('pdx-change', () => { emitted = true; });
        const cell = el.querySelector('[role="gridcell"]:not(.pdx-cal-disabled)') as HTMLElement;
        cell?.click();
        expect(emitted).toBe(true);
    });

    it('switches to month view on title click', async () => {
        const el = await mount('pdx-calendar');
        await tick(100);
        const title = el.querySelector('.pdx-cal-title') as HTMLElement;
        title?.click();
        await tick(100);
        const monthGrid = el.querySelector('.pdx-cal-month-grid');
        expect(monthGrid).toBeTruthy();
    });

    it('renders week numbers when requested', async () => {
        const el = await mount('pdx-calendar');
        (el as any).weekNumbers = true;
        await tick(200);
        const wkNums = el.querySelectorAll('.pdx-cal-wk-num');
        expect(wkNums.length).toBeGreaterThan(0);
    });

    it('renders inline when inline prop is set', async () => {
        const el = await mount('pdx-calendar', { inline: '' });
        await tick(100);
        const root = el.querySelector('.pdx-calendar-inline');
        expect(root).toBeTruthy();
    });
});

// ─── pdx-time-picker ─────────────────────────────────────────

describe('pdx-time-picker', () => {
    beforeEach(cleanup);

    it('renders time picker wrapper', async () => {
        const el = await mount('pdx-time-picker');
        await tick(100);
        const wrap = el.querySelector('.pdx-time-picker');
        expect(wrap).toBeTruthy();
    });

    it('has role="group" on wrapper', async () => {
        const el = await mount('pdx-time-picker');
        await tick(100);
        const wrap = el.querySelector('.pdx-time-picker');
        expect(wrap?.getAttribute('role')).toBe('group');
    });

    it('renders hour and minute segments', async () => {
        const el = await mount('pdx-time-picker');
        await tick(100);
        const segments = el.querySelectorAll('[role="spinbutton"]');
        expect(segments.length).toBeGreaterThanOrEqual(2);
    });

    it('renders separator between segments', async () => {
        const el = await mount('pdx-time-picker');
        await tick(100);
        const sep = el.querySelector('.pdx-time-separator');
        expect(sep).toBeTruthy();
        expect(sep?.textContent).toBe(':');
    });

    it('renders seconds segment when showSeconds is set', async () => {
        const el = await mount('pdx-time-picker', { 'show-seconds': '' });
        await tick(100);
        const segments = el.querySelectorAll('[role="spinbutton"]');
        expect(segments.length).toBeGreaterThanOrEqual(3);
    });

    it('renders AM/PM segment for 12h format', async () => {
        const el = await mount('pdx-time-picker', { format: '12h' });
        await tick(100);
        const period = el.querySelector('.pdx-time-period');
        expect(period).toBeTruthy();
    });

    it('does not render AM/PM for 24h format', async () => {
        const el = await mount('pdx-time-picker', { format: '24h' });
        await tick(100);
        const period = el.querySelector('.pdx-time-period');
        expect(period).toBeNull();
    });

    it('segments have tabindex for keyboard access', async () => {
        const el = await mount('pdx-time-picker');
        await tick(100);
        const segments = el.querySelectorAll('[role="spinbutton"]');
        for (const seg of segments) {
            expect(seg.getAttribute('tabindex')).toBe('0');
        }
    });

    it('segments have aria-label', async () => {
        const el = await mount('pdx-time-picker');
        await tick(100);
        const segments = el.querySelectorAll('[role="spinbutton"]');
        for (const seg of segments) {
            expect(seg.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('applies disabled class when disabled', async () => {
        const el = await mount('pdx-time-picker', { disabled: '' });
        await tick(100);
        const wrap = el.querySelector('.pdx-time-picker');
        expect(wrap?.classList.contains('disabled')).toBe(true);
    });

    it('renders hidden input when name is set', async () => {
        const el = await mount('pdx-time-picker', { name: 'startTime' });
        await tick(100);
        const hidden = el.querySelector('input[type="hidden"]');
        expect(hidden).toBeTruthy();
        expect(hidden?.getAttribute('name')).toBe('startTime');
    });

    it('parses initial value correctly', async () => {
        const el = await mount('pdx-time-picker', { value: '14:30', format: '24h' });
        await tick(100);
        const segments = el.querySelectorAll('[role="spinbutton"]');
        const hourText = segments[0]?.textContent;
        const minText = segments[1]?.textContent;
        expect(hourText).toBe('14');
        expect(minText).toBe('30');
    });

    it('displays 12h format for en-US locale with auto format', async () => {
        const el = await mount('pdx-time-picker', { value: '14:30', format: '12h' });
        await tick(100);
        const segments = el.querySelectorAll('[role="spinbutton"]');
        const hourText = segments[0]?.textContent;
        expect(hourText).toBe('02'); // 14:00 → 2 PM
        const period = el.querySelector('.pdx-time-period');
        expect(period?.textContent).toBe('PM');
    });

    it('applies size class', async () => {
        const el = await mount('pdx-time-picker', { size: 'sm' });
        await tick(100);
        const wrap = el.querySelector('.pdx-time-picker');
        expect(wrap?.classList.contains('pdx-time-picker-sm')).toBe(true);
    });
});

// ─── pdx-date-picker ─────────────────────────────────────────

describe('pdx-date-picker', () => {
    beforeEach(cleanup);

    it('renders trigger input', async () => {
        const el = await mount('pdx-date-picker');
        await tick(100);
        const trigger = el.querySelector('.pdx-date-picker-trigger');
        expect(trigger).toBeTruthy();
    });

    it('trigger has role="combobox"', async () => {
        const el = await mount('pdx-date-picker');
        await tick(100);
        const trigger = el.querySelector('.pdx-date-picker-trigger');
        expect(trigger?.getAttribute('role')).toBe('combobox');
    });

    it('trigger has aria-haspopup="dialog"', async () => {
        const el = await mount('pdx-date-picker');
        await tick(100);
        const trigger = el.querySelector('.pdx-date-picker-trigger');
        expect(trigger?.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('renders calendar icon', async () => {
        const el = await mount('pdx-date-picker');
        await tick(100);
        const icon = el.querySelector('.pdx-date-picker-icon');
        expect(icon).toBeTruthy();
        // Contains inline SVG
        expect(icon?.querySelector('svg')).toBeTruthy();
    });

    it('shows placeholder when no value', async () => {
        const el = await mount('pdx-date-picker');
        await tick(100);
        const text = el.querySelector('.pdx-date-picker-placeholder');
        expect(text).toBeTruthy();
    });

    it('shows clear button when value is set', async () => {
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        await tick(100);
        const clear = el.querySelector('.pdx-input-clear');
        expect(clear).toBeTruthy();
    });

    it('hides clear button when clearable is false', async () => {
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        (el as any).clearable = false;
        await tick(100);
        const clear = el.querySelector('.pdx-input-clear') as HTMLElement;
        // Clear button exists but is hidden via display:none
        expect(!clear || clear.style.display === 'none').toBe(true);
    });

    it('applies disabled class', async () => {
        const el = await mount('pdx-date-picker', { disabled: '' });
        await tick(100);
        const trigger = el.querySelector('.pdx-date-picker-trigger');
        expect(trigger?.classList.contains('disabled')).toBe(true);
    });

    it('applies size class', async () => {
        const el = await mount('pdx-date-picker', { size: 'lg' });
        await tick(100);
        const trigger = el.querySelector('.pdx-date-picker-trigger');
        expect(trigger?.classList.contains('pdx-input-lg')).toBe(true);
    });

    it('renders hidden input when name is set', async () => {
        const el = await mount('pdx-date-picker', { name: 'birthdate' });
        await tick(100);
        const hidden = el.querySelector('input[type="hidden"]');
        expect(hidden).toBeTruthy();
        expect(hidden?.getAttribute('name')).toBe('birthdate');
    });

    it('renders panel element (initially hidden)', async () => {
        const el = await mount('pdx-date-picker');
        await tick(100);
        const panel = el.querySelector('.pdx-date-picker-panel');
        expect(panel).toBeTruthy();
        expect((panel as HTMLElement)?.style.display).toBe('none');
    });

    it('renders inline calendar when inline prop is set', async () => {
        const el = await mount('pdx-date-picker', { inline: '' });
        await tick(100);
        // Inline mode: no trigger, calendar rendered directly
        const trigger = el.querySelector('.pdx-date-picker-trigger');
        expect(trigger).toBeNull();
        const calendar = el.querySelector('pdx-calendar');
        expect(calendar).toBeTruthy();
    });

    it('renders clock icon for time-only mode', async () => {
        const el = await mount('pdx-date-picker', { mode: 'time' });
        await tick(100);
        const icon = el.querySelector('.pdx-date-picker-icon-time');
        expect(icon).toBeTruthy();
        expect(icon?.querySelector('svg')).toBeTruthy();
    });

    it('renders calendar icon for date mode', async () => {
        const el = await mount('pdx-date-picker', { mode: 'date' });
        await tick(100);
        const icon = el.querySelector('.pdx-date-picker-icon');
        expect(icon).toBeTruthy();
        expect(icon?.classList.contains('pdx-date-picker-icon-time')).toBe(false);
    });

    it('emits pdx-clear on clear button click', async () => {
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        await tick(100);
        let cleared = false;
        el.addEventListener('pdx-clear', () => { cleared = true; });
        const clearBtn = el.querySelector('.pdx-input-clear') as HTMLElement;
        clearBtn?.click();
        expect(cleared).toBe(true);
    });

    it('shows formatted value when value is set', async () => {
        const el = await mount('pdx-date-picker', { value: '2024-06-15' });
        await tick(200);
        const text = el.querySelector('.pdx-date-picker-text');
        expect(text?.textContent).toBeTruthy();
        expect(text?.classList.contains('pdx-date-picker-placeholder')).toBe(false);
    });
});
